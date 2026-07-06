import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDF_MIME_TYPES, errorResponse, requireAiCaller, validateBase64Payload } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "extract_vapz_riziv_snapshot",
    description: "Extract VAPZ RIZIV snapshot (sociaal statuut arts / RIZIV-toelage) from a yearly Belgian statement",
    parameters: {
      type: "object",
      properties: {
        detected_category: {
          type: "string",
          enum: ["vapz", "vapz_riziv", "pensioensparen", "ipt", "unknown"],
          description: "Type pensioenproduct dat je herkent. 'vapz_riziv' vereist expliciete RIZIV/sociaal statuut vermelding.",
        },
        detection_confidence: { type: "number", description: "0-1 vertrouwen in detected_category" },
        snapshot_date: { type: "string", description: "Referentiedatum YYYY-MM-DD" },
        year: { type: "integer", description: "Kalenderjaar" },
        pensioenreserve: { type: "number", description: "Opgebouwde reserve VAP RIZIV / sociaal statuut / spaartegoed op datum (EUR)" },
        overlijdensdekking: { type: "number", description: "Kapitaal bij overlijden op datum (EUR)" },
        jaarpremie: { type: "number", description: "RIZIV-toelage / jaarlijkse storting (EUR). 0 indien niet zichtbaar." },
      },
      required: ["detected_category", "detection_confidence", "snapshot_date", "year", "pensioenreserve", "overlijdensdekking", "jaarpremie"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireAiCaller(req);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { pdf, mimeType } = await req.json();
    validateBase64Payload("PDF", pdf, mimeType, PDF_MIME_TYPES, 12 * 1024 * 1024);

    const systemPrompt = `Je bent een data-extractie-assistent voor Belgische pensioenoverzichten (Nederlands).
De gebruiker denkt dat dit een VAP RIZIV / sociaal statuut arts overeenkomst is (gefinancierd door RIZIV-toelage voor zorgverleners).

STAP 1 — Detecteer type (detected_category):
- 'vapz_riziv' alleen als je expliciet 'RIZIV', 'sociaal statuut', 'sociale voordelen zorgverleners' of 'RIZIV-toelage' ziet.
- 'vapz' voor gewone VAPZ zonder RIZIV.
- 'pensioensparen' voor 3de pijler (pensioenspaarfonds/-verzekering).
- 'ipt' voor Individuele Pensioentoezegging / groepsverzekering.
- 'unknown' bij twijfel.

STAP 2 — Extraheer:
1. snapshot_date + year — "op datum" / einde overzichtsjaar (bv. 31/12/2024 → "2024-12-31").
2. pensioenreserve — opgebouwde reserve / verworven reserve / spaartegoed op einddatum (EUR). Neem TOTAAL, niet aangroei.
3. overlijdensdekking — kapitaal bij overlijden op einddatum (EUR). Synoniemen: "Kapitaal bij overlijden", "Overlijdenskapitaal", "Dekking bij overlijden", "Prestatie bij overlijden".
4. jaarpremie — RIZIV-toelage of totaal storting dit jaar (EUR); 0 indien onzichtbaar.

REGELS:
- "1.234,56 €" → 1234.56. Niet afronden.
- Niet zichtbaar → 0.
- Meest recente jaar bij meerdere jaren.
- Antwoord ALTIJD via de tool call.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
            { type: "text", text: "Detecteer het product en extraheer de waarden uit deze PDF." },
            { type: "file", file: { filename: "vapz-riziv.pdf", file_data: `data:${mimeType};base64,${pdf}` } },
          ]},
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_vapz_riziv_snapshot" } },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("AI Gateway error:", res.status, errorText);
      if (res.status === 429) return new Response(JSON.stringify({ error: "AI is momenteel druk. Probeer over enkele seconden opnieuw." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "AI-krediet opgebruikt. Voeg credits toe in Lovable Cloud." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      let msg = `AI-verwerking mislukt (${res.status}). Controleer of de PDF leesbaar is.`;
      try { const j = JSON.parse(errorText); if (j?.error?.message) msg = j.error.message; } catch { /* ignore */ }
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Geen data kunnen extraheren uit deze PDF. Controleer of het een geldig VAP RIZIV-jaaroverzicht is." }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let parsed: any;
    try { parsed = JSON.parse(toolCall.function.arguments); }
    catch { return new Response(JSON.stringify({ error: "AI-antwoord kon niet gelezen worden." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    console.error("extract-vapz-riziv error:", err);
    return errorResponse(err, corsHeaders);
  }
});
