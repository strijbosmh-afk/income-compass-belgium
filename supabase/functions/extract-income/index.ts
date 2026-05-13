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
              income_type: { type: "string", enum: ["ambulatory", "hospitalized", "associatie"] },
              nomenclature_code: { type: "string", description: "RIZIV nomenclature code" },
              description: { type: "string", description: "Service description" },
              quantity: { type: "integer", description: "Number of acts" },
              unit_amount: { type: "number", description: "Unit price in EUR (exact value as printed; 0 if not visible)" },
              total_amount: { type: "number", description: "Total ereloon (bruto) amount in EUR — exact value from screenshot" },
              aandeel_arts: { type: "number", description: "Doctor's share in EUR — exact value from screenshot" },
              bouwfonds: { type: "number", description: "Building fund contribution in EUR — exact value from screenshot" },
              mif: { type: "number", description: "MIF amount in EUR — exact value from screenshot" },
              netto: { type: "number", description: "Net amount paid to doctor in EUR — exact value from screenshot" },
              account_number: { type: "string", description: "Account/rekeningnummer shown in the statement (e.g. '0' or '9'). Only include if a separate account-number column is visible." },
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

    const { image, mimeType, unitNettoByCode, incomeType: selectedIncomeType } = await req.json();
    if (!image) throw new Error("No image provided");
    const knownUnitNetto: Record<string, number> =
      unitNettoByCode && typeof unitNettoByCode === 'object' ? unitNettoByCode : {};
    // selectedIncomeType: door de gebruiker gekozen stroom in de UI. Bepaalt hoe het
    // rekeningnummer-filter werkt: 'hospitalized' = alleen rek 0 bewaren, 'associatie'
    // = alleen rek 9 (gepoold met dr. Schrevens) bewaren, 'ambulatory' = geen filter.
    const userIncomeType: string = typeof selectedIncomeType === 'string' ? selectedIncomeType : '';

    const systemPrompt = `You are a precision OCR + data-extraction assistant for a Belgian medical oncologist.
You extract income data from screenshots of RIZIV/INAMI income statements.

═══════════════════════════════════════════════════════════
ABSOLUTE RULE — IGNORE KOSTENPLAATS / COST CENTRE COMPLETELY
═══════════════════════════════════════════════════════════
• NEVER split a nomenclature_code across multiple rows because of "kostenplaats", "cost centre", "afdeling", "dienst", "locatie", or any similar grouping column.
• If the screenshot shows the SAME nomenclature_code on multiple rows differing only by kostenplaats → AGGREGATE them into ONE row per (code + income_type): sum quantity, sum total_amount, sum aandeel_arts, sum bouwfonds, sum mif, sum netto.
• unit_amount stays the per-act price (do NOT sum it).
• Output exactly ONE record per unique (nomenclature_code, income_type) combination.
• If the screenshot is a "Per nomenclatuur" view (already 1 row per code) → keep it as is.

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
- account_number: the account/rekeningnummer shown for this line (often "0" or "9" in hospital statements). Only include if a separate column clearly shows an account number. If no such column exists, omit this field.

ACCOUNT NUMBER FILTERING (hospitalized statements):
• Some hospital income statements have a "rekeningnummer" / "compte" / "account" column with values like "0" or "9".
• "0" = the doctor's own account (keep).
• "9" = another account / pooled account (discard).
• If such a column is present, record the account_number for each line. If not present, omit the field entirely.

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

    // Flash is used as primary: ~5-10x faster than Pro on vision+tool-call.
    // Nomenclatuur-tabel is sowieso LEIDEND (stap C hieronder), dus de marginaal
    // hogere precisie van Pro weegt niet op tegen het 150s timeout-risico.
    let response = await callModel("google/gemini-2.5-flash");
    if (response.status === 429 || response.status === 402 || response.status >= 500) {
      console.warn(`Flash model returned ${response.status}, falling back to pro`);
      response = await callModel("google/gemini-2.5-pro");
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
    let skippedAccount9 = 0;
    let skippedAccount0 = 0;
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      const rawRecords: any[] = parsed.records || [];

      const num = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      // ─────────────────────────────────────────────────────────────
      // STAP A: AGGREGEER per (nomenclature_code + income_type).
      // Kostenplaats wordt volledig genegeerd — alle rijen met dezelfde
      // code+type worden samengevoegd tot één rij (sommatie van bedragen
      // en quantity). Dit voorkomt dubbele rijen door kostenplaats-splits.
      // ─────────────────────────────────────────────────────────────
      const aggMap = new Map<string, any>();
      for (const r of rawRecords) {
        const code = String(r.nomenclature_code || '').trim();
        if (!code) continue;
        const type = String(r.income_type || '').trim() || 'ambulatory';
        const key = `${code}|${type}`;
        const existing = aggMap.get(key);
        const qty = Math.max(1, Math.round(num(r.quantity) || 1));
        if (!existing) {
          aggMap.set(key, {
            ...r,
            nomenclature_code: code,
            income_type: type,
            quantity: qty,
            unit_amount: num(r.unit_amount),
            total_amount: num(r.total_amount),
            aandeel_arts: num(r.aandeel_arts),
            bouwfonds: num(r.bouwfonds),
            mif: num(r.mif),
            netto: num(r.netto),
            _merged_rows: 1,
          });
        } else {
          existing.quantity += qty;
          existing.total_amount += num(r.total_amount);
          existing.aandeel_arts += num(r.aandeel_arts);
          existing.bouwfonds += num(r.bouwfonds);
          existing.mif += num(r.mif);
          existing.netto += num(r.netto);
          // unit_amount: behoud de eerste >0 waarde (per-act prijs is constant).
          if (existing.unit_amount <= 0 && num(r.unit_amount) > 0) {
            existing.unit_amount = num(r.unit_amount);
          }
          existing._merged_rows += 1;
        }
      }
      const aggregated = Array.from(aggMap.values()).map((r) => ({
        ...r,
        total_amount: Math.round(r.total_amount * 100) / 100,
        aandeel_arts: Math.round(r.aandeel_arts * 100) / 100,
        bouwfonds: Math.round(r.bouwfonds * 100) / 100,
        mif: Math.round(r.mif * 100) / 100,
        netto: Math.round(r.netto * 100) / 100,
      }));

      // ─────────────────────────────────────────────────────────────
      // STAP A2: FILTER op rekeningnummer-kolom afhankelijk van de gekozen stroom.
      // - 'hospitalized' (eigen): bewaar rek 0, verwerp rek 9 (= pool).
      // - 'associatie' (gepoold met dr. Schrevens): bewaar rek 9, verwerp rek 0.
      // - geen rekening-kolom of andere stroom: niet filteren.
      // ─────────────────────────────────────────────────────────────
      const filteredForAccount = aggregated.filter((r) => {
        const acct = String(r.account_number ?? '').trim();
        if (acct !== '0' && acct !== '9') return true;
        if (userIncomeType === 'associatie') {
          if (acct === '0') { skippedAccount0++; return false; }
          return true; // keep '9'
        }
        // default / hospitalized gedrag
        if (acct === '9') { skippedAccount9++; return false; }
        return true;
      });

      // ─────────────────────────────────────────────────────────────
      // STAP B: Bepaal per code de fallback unit_amount uit de geëxtraheerde
      // data (als de nomenclatuur-tabel die code niet kent).
      // ─────────────────────────────────────────────────────────────
      const fallbackUnitByCode = new Map<string, number>();
      for (const r of filteredForAccount) {
        const code = r.nomenclature_code;
        const candidates: number[] = [];
        if (r.unit_amount > 0) candidates.push(r.unit_amount);
        if (r.total_amount > 0 && r.quantity >= 1) candidates.push(r.total_amount / r.quantity);
        for (const c of candidates) {
          const prev = fallbackUnitByCode.get(code);
          if (!prev || c < prev) fallbackUnitByCode.set(code, c);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // STAP C: Nomenclatuur is ALTIJD LEIDEND. Voor elke rij:
      //   • als de code in de gebruikers-nomenclatuur staat → quantity =
      //     round(netto / known_unit_netto), unit_amount = known_unit_netto.
      //   • anders → fallback op afgeleide unit + sanity-check op total/unit.
      // ─────────────────────────────────────────────────────────────
      records = filteredForAccount.map((r) => {
        const code = r.nomenclature_code;
        const netto = num(r.netto);
        const total = num(r.total_amount);
        let unit = num(r.unit_amount);
        let quantity = Math.max(1, Math.round(num(r.quantity) || 1));

        let quantity_from_nomenclature = false;
        let unit_inferred = false;
        let quantity_recomputed = false;

        const knownUnit = knownUnitNetto[code];
        if (knownUnit && knownUnit > 0 && netto > 0) {
          // LEIDEND: bereken quantity uit netto en bekende unit.
          const derived = Math.max(1, Math.round(netto / knownUnit));
          if (derived !== quantity) {
            console.warn(`[qty-from-nomenclature] code ${code}: qty ${quantity} → ${derived} (netto=${netto}, known unit=${knownUnit})`);
            quantity = derived;
            quantity_from_nomenclature = true;
          }
          unit = knownUnit;
          unit_inferred = true;
        } else {
          // Fallback wanneer code niet in nomenclatuur-tabel zit.
          if (unit <= 0 && fallbackUnitByCode.has(code)) {
            unit = Math.round((fallbackUnitByCode.get(code) as number) * 100) / 100;
            unit_inferred = true;
          }
          if (unit > 0 && total > 0) {
            const derived = Math.round(total / unit);
            const expected = derived * unit;
            const tol = Math.max(0.05, total * 0.02);
            if (derived >= 1 && derived !== quantity && Math.abs(expected - total) <= tol) {
              console.warn(`[qty-fix] code ${code}: AI qty=${quantity} → recomputed ${derived} (total=${total}, unit=${unit})`);
              quantity = derived;
              quantity_recomputed = true;
            }
          }
        }

        const aandeel = num(r.aandeel_arts);
        const bouwfonds = num(r.bouwfonds);
        const mif = num(r.mif);
        const computedNetto = Math.round((aandeel - bouwfonds - mif) * 100) / 100;
        const nettoDiff = Math.round((netto - computedNetto) * 100) / 100;

        return {
          ...r,
          nomenclature_code: code,
          aandeel_arts: aandeel,
          bouwfonds,
          mif,
          netto,
          total_amount: total,
          unit_amount: unit,
          quantity,
          _verification: {
            computed_netto: computedNetto,
            netto_diff: nettoDiff,
            quantity_recomputed,
            quantity_from_nomenclature,
            unit_inferred,
            merged_rows: r._merged_rows ?? 1,
          },
        };
      });
    }

    return new Response(JSON.stringify({ records, skippedAccount9, skippedAccount0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-income error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
