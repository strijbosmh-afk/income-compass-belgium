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
    name: "extract_ipt_snapshot",
    description: "Extract IPT (Individuele Pensioentoezegging) snapshot from a yearly Belgian IPT PDF statement",
    parameters: {
      type: "object",
      properties: {
        detected_category: {
          type: "string",
          enum: ["vapz", "vapz_riziv", "pensioensparen", "ipt", "unknown"],
          description: "Type pensioenproduct dat je herkent in de PDF.",
        },
        detection_confidence: { type: "number", description: "0-1 vertrouwen in detected_category" },
        snapshot_date: { type: "string", description: "Referentiedatum (einde overzichtsjaar) in YYYY-MM-DD. Bv. 'Jaaroverzicht 2024' → '2024-12-31'." },
        year: { type: "integer", description: "Kalenderjaar van het overzicht (bv. 2024)." },
        beginkapitaal: { type: "number", description: "Beginkapitaal = 'Uw spaartegoed/kapitaal op 01/01/<jaar>' in EUR." },
        eindkapitaal: { type: "number", description: "Eindkapitaal = 'Uw spaartegoed/kapitaal op 01/01/<jaar+1>' in EUR (= totaal gespaard bedrag op einddatum)." },
        opgebouwde_reserve: { type: "number", description: "Opgebouwde reserve op einddatum in EUR (meestal = eindkapitaal). Neem TOTAAL." },
        jaarpremie: { type: "number", description: "Jaarpremie / som van stortingen dit jaar in EUR. 0 indien niet zichtbaar." },
        overlijdenskapitaal: { type: "number", description: "Kapitaal bij overlijden op einddatum in EUR. Synoniemen: 'Overlijdenskapitaal', 'Kapitaal bij overlijden', 'Dekking overlijden', 'Verzekerd overlijdenskapitaal'." },
        gewaarborgd_rendement: { type: "number", description: "Gewaarborgd rendementspercentage (bv. 1.75). 0 indien niet zichtbaar." },
        winst_uit_beleggingen: { type: "number", description: "Beleggingswinst in EUR. Herken als 'Prestatie van de eenheden' of 'Nettorendement van de fondsen'." },
        inkomende_bewegingen: { type: "number", description: "Som van inkomende bewegingen in EUR (positief)." },
        uitgaande_bewegingen: { type: "number", description: "Som van uitgaande bewegingen in EUR. NEGATIEF indien uitstroom (bv. -10615.41)." },
        kosten_taksen: { type: "number", description: "Som van 'Kosten en taksen' / 'Taksen en kosten' in EUR (negatief indien zo getoond)." },
        kosten_overlijden: { type: "number", description: "Kosten van de overlijdensdekking in EUR (negatief indien zo getoond)." },
      },
      required: ["detected_category", "detection_confidence", "snapshot_date", "year", "beginkapitaal", "eindkapitaal", "opgebouwde_reserve", "jaarpremie", "overlijdenskapitaal", "gewaarborgd_rendement", "winst_uit_beleggingen", "inkomende_bewegingen", "uitgaande_bewegingen", "kosten_taksen", "kosten_overlijden"],
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
De gebruiker denkt dat dit een IPT is (Individuele Pensioentoezegging).

STAP 1 — Detecteer type (detected_category):
- 'ipt' voor 'Individuele Pensioentoezegging', 'IPT', 'groepsverzekering', werkgevers-storting.
- 'vapz_riziv' bij expliciete 'RIZIV' / 'sociaal statuut' vermelding.
- 'vapz' voor gewone VAPZ.
- 'pensioensparen' voor 3de pijler pensioenspaarfonds/-verzekering.
- 'unknown' bij twijfel.

STAP 2 — Extraheer per jaar:
1. year + snapshot_date — herken "Jaaroverzicht <jaar>"; snapshot_date = <jaar>-12-31.
2. beginkapitaal — "Uw spaartegoed op 01/01/<jaar>" of "Uw kapitaal op 01/01/<jaar>".
3. eindkapitaal — "Uw spaartegoed op 01/01/<jaar+1>" of "Uw kapitaal op 01/01/<jaar+1>" (= totaal gespaard bedrag op einddatum).
4. opgebouwde_reserve — totale opgebouwde IPT-reserve op einddatum (meestal = eindkapitaal).
5. jaarpremie — jaarlijkse premie / som stortingen.
6. overlijdenskapitaal — kapitaal bij overlijden op einddatum. Synoniemen: "Overlijdenskapitaal", "Kapitaal bij overlijden", "Dekking bij overlijden", "Verzekerd overlijdenskapitaal", "Prestatie bij overlijden".
7. gewaarborgd_rendement — gewaarborgd rendement in %.
8. winst_uit_beleggingen — "Prestatie van de eenheden" of "Nettorendement van de fondsen" in EUR.
9. inkomende_bewegingen — som inkomende bewegingen (positief).
10. uitgaande_bewegingen — som uitgaande bewegingen (NEGATIEF indien uitstroom).
11. kosten_taksen — "Kosten en taksen" / "Taksen en kosten".
12. kosten_overlijden — kosten van de overlijdensdekking.

REGELS:
- Belgische notatie ("+258 875,41 €", "1.234,56 €") → JSON-getal (258875.41 / 1234.56). NIET afronden.
- Negatieve bedragen ("-10 615,41 €") → negatief opslaan.
- Percentages als getal ("1,75 %" → 1.75).
- Niet zichtbaar → 0.
- "Uw spaartegoed" en "Uw kapitaal" = hetzelfde veld.
- Bij meerdere jaren, kies het MEEST RECENTE jaar.
- Antwoord ALTIJD via de tool call.`;

    const parsed = await extractWithOpenAi({
      systemPrompt,
      userContent: [
        openAiPdfContent("ipt.pdf", mimeType, pdf),
        { type: "input_text", text: "Extraheer de IPT-waarden en de referentiedatum uit deze PDF. Antwoord als JSON via de tool call." },
      ],
      toolSchema: TOOL_SCHEMA,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("extract-pension-ipt error:", err);
    return errorResponse(err, corsHeaders);
  }
});
