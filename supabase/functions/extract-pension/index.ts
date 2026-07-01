import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDF_MIME_TYPES, errorResponse, requireAiCaller, validateBase64Payload } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "extract_pension_snapshot",
    description: "Extract pension snapshot from a yearly Belgian pension PDF statement",
    parameters: {
      type: "object",
      properties: {
        snapshot_date: { type: "string", description: "Reference date in YYYY-MM-DD format (the 'op datum' / valuation date shown in the document)" },
        year: { type: "integer", description: "Year of the snapshot date" },
        pensioenreserve: { type: "number", description: "Pensioenreserve op datum in EUR (main accumulated pension reserve)" },
        overlijdensdekking: { type: "number", description: "Overlijdensdekking op datum in EUR (death cover amount)" },
        pensioenreserve_vapz: { type: "number", description: "Pensioenreserve VAPZ op datum in EUR (free supplementary pension for self-employed reserve)" },
        vap_riziv_toelage: { type: "number", description: "VAP overeenkomst RIZIV toelage op datum in EUR (RIZIV contribution / sociaal statuut amount)" },
      },
      required: ["snapshot_date", "year", "pensioenreserve", "overlijdensdekking", "pensioenreserve_vapz", "vap_riziv_toelage"],
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

    const systemPrompt = `Je bent een precieze data-extractie-assistent voor Belgische pensioendocumenten (Dutch / Nederlands).
Je krijgt een jaarlijks pensioenoverzicht (PDF) en extraheert exact vier bedragen plus de referentiedatum:

1. **Pensioenreserve op datum** — de totale opgebouwde pensioenreserve op de referentiedatum (hoofdcontract, IPT/EIP/groepsverzekering).
2. **Overlijdensdekking op datum** — het kapitaal overlijden / overlijdenswaarborg op de referentiedatum.
3. **Pensioenreserve VAPZ op datum** — opgebouwde reserve in het VAPZ-contract (Vrij Aanvullend Pensioen voor Zelfstandigen).
4. **VAP overeenkomst RIZIV toelage op datum** — de reserve van de VAP/RIZIV-overeenkomst (sociaal statuut / RIZIV-toelage voor artsen).

REGELS:
- Bedragen EXACT overnemen zoals afgedrukt (Belgische notatie "1.234,56" → JSON-getal 1234.56). Niet afronden, niet herberekenen.
- Als een bedrag niet zichtbaar is → 0.
- snapshot_date = de "op datum" / "situatie op" / "waardering per" datum die in het document staat. Indien meerdere → de meest recente.
- year = jaar uit snapshot_date.
- Geef altijd antwoord via de tool call.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraheer de vier pensioenbedragen en de referentiedatum uit deze PDF." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${pdf}` } },
            ],
          },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_pension_snapshot" } },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("AI Gateway error:", res.status, errorText);
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Probeer zo opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "Krediet opgebruikt. Voeg credits toe." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${res.status}`);
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Geen data kunnen extraheren." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("extract-pension error:", err);
    return errorResponse(err, corsHeaders);
  }
});
