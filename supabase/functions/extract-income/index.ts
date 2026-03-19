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

    const systemPrompt = `You are a data extraction assistant for a Belgian medical oncologist. You extract income data from screenshots of income statements/reports.

Extract ALL line items from the image. For each item, determine:
- record_date: The date in YYYY-MM-DD format. If only month/year visible, use the 1st of that month.
- month: Month number (1-12)
- year: Year (e.g. 2024)
- income_type: Either "ambulatory" or "hospitalized". Ambulatory = outpatient/consultation. Hospitalized = inpatient/hospital.
- nomenclature_code: The RIZIV/INAMI nomenclature code (numeric code)
- description: Brief description of the service/act
- quantity: Number of acts/services
- unit_amount: Price per unit in EUR
- total_amount: Total amount in EUR (ereloon/honorarium)
- aandeel_arts: The doctor's share ("aandeel arts") in EUR.
- bouwfonds: The building fund contribution ("bouwfonds") in EUR. 
- mif: The MIF (Medisch-Interdisciplinair Fonds) amount in EUR.
- netto: The net amount actually paid out to the doctor in EUR. This is total_amount minus all deductions.

These Belgian-specific fields (aandeel_arts, bouwfonds, mif) may appear as columns in the income statement. Look for headers like "Aandeel arts", "Bouwfonds", "MIF", "Pool", or similar. If not present for a line item, use 0.

Return a JSON object with a "records" array. If you cannot extract data, return {"records": []}.
Be thorough - extract every single line item visible in the image.`;

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
              { type: "text", text: "Extract all income data from this screenshot. Return JSON with a records array. Include aandeel_arts, bouwfonds, and mif columns." },
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
                      },
                      required: ["record_date", "month", "year", "income_type", "nomenclature_code", "description", "quantity", "unit_amount", "total_amount", "aandeel_arts", "bouwfonds", "mif"],
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