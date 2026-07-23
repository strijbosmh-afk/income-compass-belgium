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
    name: "extract_pensioensparen_snapshot",
    description: "Extract pensioensparen snapshot (3de pijler) from a yearly Belgian statement",
    parameters: {
      type: "object",
      properties: {
        detected_category: {
          type: "string",
          enum: ["vapz", "vapz_riziv", "pensioensparen", "ipt", "unknown"],
          description: "Type pensioenproduct dat je herkent.",
        },
        detection_confidence: { type: "number", description: "0-1 vertrouwen in detected_category" },
        snapshot_date: { type: "string", description: "Referentiedatum YYYY-MM-DD" },
        year: { type: "integer", description: "Kalenderjaar" },
        pensioenreserve: { type: "number", description: "Opgebouwde spaartegoed / totaal gespaard bedrag / reserve pensioensparen op datum (EUR)" },
        overlijdensdekking: { type: "number", description: "Overlijdenskapitaal op datum (EUR). 0 indien niet zichtbaar." },
        jaarpremie: { type: "number", description: "Jaarlijkse storting pensioensparen dit jaar (EUR). 0 indien niet zichtbaar." },
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

    const systemPrompt = `Je bent een data-extractie-assistent voor Belgische pensioensparen-jaaroverzichten (3de pijler, Nederlands).
Dit kan een pensioenspaarfonds of pensioenspaarverzekering zijn.

STAP 1 — Detecteer type (detected_category):
- 'pensioensparen' voor 'pensioensparen', 'pensioenspaarfonds', 'pensioenspaarverzekering', '3de pijler'.
- 'vapz_riziv' als je 'RIZIV' / 'sociaal statuut' ziet.
- 'vapz' voor VAPZ zonder RIZIV.
- 'ipt' voor Individuele Pensioentoezegging / groepsverzekering (werkgever).
- 'unknown' bij twijfel.

STAP 2 — Extraheer:
1. snapshot_date + year — "op datum" / einde overzichtsjaar.
2. pensioenreserve — TOTAAL gespaard bedrag / spaartegoed / opgebouwde reserve / netto inventariswaarde op die einddatum (EUR). Neem het totaal, niet de aangroei of storting.
3. overlijdensdekking — KAPITAAL BIJ OVERLIJDEN op die datum (EUR). Zoek expliciet naar een aparte sectie/label:
   - "Kapitaal bij overlijden", "Overlijdenskapitaal", "Prestatie bij overlijden", "Uitkering bij overlijden", "Verzekerd overlijdenskapitaal", "Overlijdensdekking".
   - Bij Amonis-overzichten: zoek in de sectie "Waarborgen" of "Overlijdensdekking" — dit is vaak een VAST verzekerd bedrag (bv. 200.000 €), NIET gelijk aan de reserve.
   - BELANGRIJK: kopieer NOOIT gewoon de pensioenreserve als overlijdensdekking, tenzij de PDF expliciet zegt "overlijdenskapitaal = opgebouwde reserve" of "waarde van de deelbewijzen". Bij een pensioenspaarFONDS zonder verzekering is dat wél zo — dan mag je de reserve overnemen.
   - Als er GEEN aparte overlijdenswaarborg vermeld staat en het is duidelijk een fonds zonder dekking → 0.
4. jaarpremie — jaarlijkse storting pensioensparen (EUR); 0 indien niet zichtbaar.

REGELS:
- "1.234,56 €" → 1234.56. Niet afronden.
- Niet zichtbaar → 0.
- Meest recente jaar bij meerdere jaren.
- Antwoord ALTIJD via de tool call.`;

    const parsed = await extractWithOpenAi({
      systemPrompt,
      userContent: [
        openAiPdfContent("pensioensparen.pdf", mimeType, pdf),
        { type: "input_text", text: "Detecteer het product en extraheer de waarden uit deze PDF. Antwoord als JSON via de tool call." },
      ],
      toolSchema: TOOL_SCHEMA,
    });

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    console.error("extract-pensioensparen error:", err);
    return errorResponse(err, corsHeaders);
  }
});
