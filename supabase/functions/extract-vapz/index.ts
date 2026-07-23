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
    name: "extract_vapz_snapshot",
    description: "Extract VAPZ snapshot from a yearly Belgian VAPZ statement (Vrij Aanvullend Pensioen Zelfstandigen)",
    parameters: {
      type: "object",
      properties: {
        detected_category: {
          type: "string",
          enum: ["vapz", "vapz_riziv", "pensioensparen", "ipt", "unknown"],
          description: "Type pensioenproduct dat je herkent in de PDF. 'vapz_riziv' als het duidelijk over sociaal statuut arts / RIZIV-toelage gaat, 'pensioensparen' voor 3de pijler, 'ipt' voor Individuele Pensioentoezegging (werkgeversplan), 'vapz' voor gewone VAPZ.",
        },
        detection_confidence: { type: "number", description: "0-1 vertrouwen in detected_category" },
        snapshot_date: { type: "string", description: "Referentiedatum YYYY-MM-DD ('op datum' / 'situatie op' / einde overzichtsjaar)" },
        year: { type: "integer", description: "Kalenderjaar van snapshot" },
        pensioenreserve: { type: "number", description: "Opgebouwde VAPZ-reserve/spaartegoed op referentiedatum in EUR" },
        overlijdensdekking: { type: "number", description: "Kapitaal bij overlijden op referentiedatum in EUR" },
        jaarpremie: { type: "number", description: "Jaarpremie / totaal stortingen in dit jaar in EUR. 0 indien niet zichtbaar." },
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

    const systemPrompt = `Je bent een precieze data-extractie-assistent voor Belgische pensioenoverzichten (Nederlands).
De gebruiker denkt dat dit een VAPZ-overzicht is (Vrij Aanvullend Pensioen Zelfstandigen).

STAP 1 — Detecteer eerst het type product (detected_category):
- 'vapz_riziv' als je 'RIZIV', 'sociaal statuut', 'sociale voordelen zorgverleners', 'RIZIV-toelage' ziet.
- 'pensioensparen' voor 'pensioensparen', 'pensioenspaarfonds', 'pensioenspaarverzekering' (3de pijler).
- 'ipt' voor 'Individuele Pensioentoezegging', 'IPT', 'groepsverzekering', werkgevers-storting.
- 'vapz' voor gewone VAPZ zonder RIZIV-vermelding.
- 'unknown' als je het niet kan bepalen.

STAP 2 — Extraheer:
1. snapshot_date + year — de "op datum" / "situatie op" / einde overzichtsjaar (bv. 31/12/2024 → "2024-12-31").
2. pensioenreserve — de opgebouwde VAPZ-reserve / spaartegoed / verworven reserve op die datum (EUR). Zoek naar: "Opgebouwde reserve", "Verworven reserve", "Spaartegoed", "Kapitaal op <datum>", "Reserves op einde van het jaar". Neem het TOTAAL op einddatum, niet de aangroei.
3. overlijdensdekking — kapitaal bij overlijden op die datum (EUR). Synoniemen: "Kapitaal bij overlijden", "Overlijdenskapitaal", "Overlijdensdekking", "Dekking bij overlijden", "Prestatie bij overlijden", "Verzekerd overlijdenskapitaal". Kies bedrag dat expliciet "overlijden" vermeldt.
4. jaarpremie — jaarlijkse premie of som stortingen dit jaar (EUR); 0 als niet zichtbaar.

REGELS:
- Belgische notatie "1.234,56 €" → 1234.56. NIET afronden.
- Niet zichtbaar of onduidelijk → 0.
- Als er meerdere jaren in de PDF staan, kies altijd het MEEST RECENTE jaar.
- Antwoord ALTIJD via de tool call.`;

    const parsed = await extractWithOpenAi({
      systemPrompt,
      userContent: [
        openAiPdfContent("vapz.pdf", mimeType, pdf),
        { type: "input_text", text: "Detecteer het product en extraheer de waarden uit deze PDF. Antwoord als JSON via de tool call." },
      ],
      toolSchema: TOOL_SCHEMA,
    });

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    console.error("extract-vapz error:", err);
    return errorResponse(err, corsHeaders);
  }
});
