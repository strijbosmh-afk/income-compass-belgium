import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOL_SCHEMA = {
  type: "function" as const,
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
              unit_amount: { type: "number", description: "Unit price in EUR (exact value as printed; 0 if not visible)" },
              total_amount: { type: "number", description: "Total ereloon (bruto) amount in EUR — exact value from screenshot" },
              aandeel_arts: { type: "number", description: "Doctor's share in EUR — exact value from screenshot" },
              bouwfonds: { type: "number", description: "Building fund contribution in EUR — exact value from screenshot" },
              mif: { type: "number", description: "MIF amount in EUR — exact value from screenshot" },
              netto: { type: "number", description: "Net amount paid to doctor in EUR — exact value from screenshot" },
            },
            required: ["record_date", "month", "year", "income_type", "nomenclature_code", "description", "quantity", "unit_amount", "total_amount", "aandeel_arts", "bouwfonds", "mif", "netto"],
          },
        },
      },
      required: ["records"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { image, mimeType } = await req.json();
    if (!image) throw new Error("No image provided");

    const systemPrompt = `You are a precision OCR + data-extraction assistant for a Belgian medical oncologist.
You extract income data from screenshots of RIZIV/INAMI income statements ("Per nomenclatuur" or "Per kostenplaats" views).

═══════════════════════════════════════════════════════════
ABSOLUTE RULE — EXACT TRANSCRIPTION OF EUR AMOUNTS
═══════════════════════════════════════════════════════════
For total_amount, aandeel_arts, bouwfonds, mif, netto, unit_amount:
• COPY THE EXACT NUMBER printed in the screenshot, character-for-character.
• DO NOT round, truncate, normalize, or recompute any amount.
• DO NOT derive a value by arithmetic (e.g. don't compute netto = aandeel − bouwfonds − mif). Read the printed netto directly.
• Belgian decimal notation uses comma (e.g. "1.234,56"). Convert to JSON number 1234.56 — preserve all digits.
• If a cell is empty, shows "—", "-", "/", or "0,00" → use 0 (only in that case).
• If you cannot clearly read a digit, prefer leaving the line OUT rather than guessing.

EXTRACTED FIELDS:
- record_date: YYYY-MM-DD. If only month/year visible, use the 1st of that month.
- month: 1-12
- year: e.g. 2026
- income_type: "ambulatory" (Ambulant / outpatient) or "hospitalized" (Gehospitaliseerden / inpatient).
- nomenclature_code: numeric RIZIV/INAMI code, exactly as printed.
- description: brief description if visible, else "".
- quantity: integer, number of acts for this line.
- unit_amount: net price per single act, EXACT value printed in the screenshot (0 if no such column).
- total_amount: total bruto / "Ereloon" / "Honorarium", EXACT value printed.
- aandeel_arts: "Aandeel arts", EXACT value printed.
- bouwfonds: "Bouwfonds", EXACT value printed.
- mif: "MIF", EXACT value printed.
- netto: net paid to doctor, EXACT value printed (column "Netto" / "Netto-ereloon" / "Saldo arts").

DETERMINING quantity:
1. If the screenshot has an explicit "Aantal" / "Q" / "#" column → use that integer exactly.
2. Otherwise the same nomenclature_code may appear on multiple rows (per kostenplaats). Each row aggregates several acts. Infer quantity = round(row_netto / per_act_netto).
   • Use the smallest occurrence of the same code as the per-act reference (its quantity = 1, its netto = unit netto).
   • Example: code 598205 smallest row netto €31,83 → unit. Larger row netto €350,13 → quantity = round(350.13 / 31.83) = 11.
3. quantity must be an integer ≥ 1. Never guess "1" when multiple rows of the same code exist with very different totals.
4. The amounts (total_amount, aandeel_arts, bouwfonds, mif, netto) are still the EXACT printed row totals — never multiply or divide them yourself.

OUTPUT: Return JSON via the tool call. Include EVERY visible line item, including duplicates of the same nomenclature_code on different rows.`;

    const userText = "Extract every line item from this RIZIV income statement screenshot. Copy each EUR amount EXACTLY as printed (no rounding, no recomputation). Return JSON via the tool call.";

    const callModel = async (model: string) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: `data:${mimeType || "image/png"};base64,${image}` } },
              ],
            },
          ],
          tools: [TOOL_SCHEMA],
          tool_choice: { type: "function", function: { name: "extract_income_records" } },
        }),
      });
      return res;
    };

    let response = await callModel("google/gemini-2.5-pro");
    if (response.status === 429 || response.status === 402 || response.status >= 500) {
      // Fallback to flash if Pro is unavailable / rate-limited
      console.warn(`Pro model returned ${response.status}, falling back to flash`);
      response = await callModel("google/gemini-2.5-flash");
    }

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

    let records: any[] = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      records = (parsed.records || []).map((r: any) => {
        // Preserve EXACT amounts from the screenshot — DO NOT recompute.
        const num = (v: any) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        const aandeel = num(r.aandeel_arts);
        const bouwfonds = num(r.bouwfonds);
        const mif = num(r.mif);
        const netto = num(r.netto);
        const total = num(r.total_amount);
        const unit = num(r.unit_amount);
        const quantity = Math.max(1, Math.round(num(r.quantity) || 1));

        // Sanity flag: difference between printed netto and (aandeel - bouwfonds - mif).
        // Stored on the record so the UI can warn the user but the printed values stay intact.
        const computedNetto = Math.round((aandeel - bouwfonds - mif) * 100) / 100;
        const nettoDiff = Math.round((netto - computedNetto) * 100) / 100;

        return {
          ...r,
          aandeel_arts: aandeel,
          bouwfonds,
          mif,
          netto,
          total_amount: total,
          unit_amount: unit,
          quantity,
          _verification: {
            computed_netto: computedNetto,
            netto_diff: nettoDiff, // should be 0,00 if extraction is correct
          },
        };
      });
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
