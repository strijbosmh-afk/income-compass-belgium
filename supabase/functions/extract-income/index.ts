import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { image, mimeType } = await req.json();
    if (!image) throw new Error("No image provided");

    const systemPrompt = `You are a data extraction assistant for a Belgian medical oncologist. You extract income data from screenshots of RIZIV/INAMI income statements ("Per nomenclatuur" or "Per kostenplaats" views).

Extract ALL line items from the image. For each item, determine:
- record_date: The date in YYYY-MM-DD format. If only month/year visible, use the 1st of that month.
- month: Month number (1-12)
- year: Year (e.g. 2024)
- income_type: Either "ambulatory" (Ambulant / outpatient / consultation) or "hospitalized" (Gehospitaliseerden / inpatient / hospital).
- nomenclature_code: The RIZIV/INAMI nomenclature code (numeric code, exactly as printed — do not invent leading digits).
- description: Brief description of the service/act if visible; otherwise leave empty.
- quantity: Number of times this act was performed for this line.
- unit_amount: Net price per single act in EUR.
- total_amount: Total/gross amount ("Totaal" / "Ereloon" / "Honorarium") in EUR for this line (= quantity × bruto unit price).
- aandeel_arts: The doctor's share ("Aandeel arts") in EUR for this line.
- bouwfonds: The building fund contribution ("Bouwfonds") in EUR for this line.
- mif: The MIF (Medisch-Interdisciplinair Fonds) amount in EUR for this line.
- netto: The net amount actually paid out to the doctor in EUR for this line (= aandeel_arts − bouwfonds − mif).

CRITICAL — DETERMINING quantity:
1. If the screenshot has an explicit "Aantal" or "Q" column, use that value.
2. If NOT, the same nomenclature_code may appear MULTIPLE times in the table (different rows, often per "Kostenplaats"). Each row is an aggregate of multiple acts. You MUST infer quantity by dividing the row's netto amount by the official RIZIV unit netto amount for that code, and rounding to the nearest integer.
   - Example: code 598205 official netto/act = €31.83. Row shows netto €350.13 → quantity = round(350.13 / 31.83) = 11.
   - Example: same code, another row shows netto €63.66 → quantity = 2.
   - If you do not know the official unit price, estimate it from the smallest occurrence of the same code (the row with the smallest netto is most likely a single act → quantity = 1, unit_amount = that netto). Then derive quantity for the larger rows by dividing.
3. Never set quantity = 1 by default when multiple rows for the same code exist with very different totals — always compute it.
4. quantity must be ≥ 1 and an integer.

These Belgian-specific fields (aandeel_arts, bouwfonds, mif) appear as columns. Headers: "Aandeel arts", "Bouwfonds", "MIF", "Pool". If not present for a line item, use 0.

Return a JSON object with a "records" array. Extract every visible line item, including duplicates of the same nomenclature_code on different rows.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all income data from this screenshot. Return JSON with a records array. Include aandeel_arts, bouwfonds, mif, and netto columns." },
              { type: "image_url", image_url: { url: `data:${mimeType || "image/png"};base64,${image}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_income_records",
              description: "Extract income records from a medical income statement screenshot",
              parameters: {
                type: "object",
                properties: {
                  records: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        record_date: { type: "string", description: "Date in YYYY-MM-DD format" },
                        month: { type: "integer", description: "Month number 1-12" },
                        year: { type: "integer", description: "Year" },
                        income_type: { type: "string", enum: ["ambulatory", "hospitalized"] },
                        nomenclature_code: { type: "string", description: "RIZIV nomenclature code" },
                        description: { type: "string", description: "Service description" },
                        quantity: { type: "integer", description: "Number of acts" },
                        unit_amount: { type: "number", description: "Unit price in EUR" },
                        total_amount: { type: "number", description: "Total amount (ereloon) in EUR" },
                        aandeel_arts: { type: "number", description: "Doctor's share in EUR" },
                        bouwfonds: { type: "number", description: "Building fund contribution in EUR" },
                        mif: { type: "number", description: "MIF amount in EUR" },
                        netto: { type: "number", description: "Net amount paid out to doctor in EUR" },
                      },
                      required: ["record_date", "month", "year", "income_type", "nomenclature_code", "description", "quantity", "unit_amount", "total_amount", "aandeel_arts", "bouwfonds", "mif", "netto"],
                    },
                  },
                },
                required: ["records"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_income_records" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    let records = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      records = (parsed.records || []).map((r: any) => ({
        ...r,
        aandeel_arts: r.aandeel_arts || 0,
        bouwfonds: r.bouwfonds || 0,
        mif: r.mif || 0,
        netto: r.netto || (r.total_amount || 0) - (r.bouwfonds || 0) - (r.mif || 0),
      }));
    }

    return new Response(JSON.stringify({ records }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-income error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});