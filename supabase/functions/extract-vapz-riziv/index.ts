import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDF_MIME_TYPES, errorResponse, requireAiCaller, validateBase64Payload } from "../_shared/security.ts";
import { extractWithOpenAi, openAiPdfContent } from "../_shared/openai.ts";

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

    const parsed = await extractWithOpenAi({
      systemPrompt,
      userContent: [
        openAiPdfContent("vapz-riziv.pdf", mimeType, pdf),
        { type: "input_text", text: "Detecteer het product en extraheer de waarden uit deze PDF. Antwoord als JSON via de tool call." },
      ],
      toolSchema: TOOL_SCHEMA,
    });

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    console.error("extract-vapz-riziv error:", err);
    return errorResponse(err, corsHeaders);
  }
});
