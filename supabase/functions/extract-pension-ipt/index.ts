import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        snapshot_date: { type: "string", description: "Reference date in YYYY-MM-DD format (the 'op datum' / valuation date)" },
        year: { type: "integer", description: "Year of the snapshot date" },
        opgebouwde_reserve: { type: "number", description: "Opgebouwde reserve op datum in EUR (accumulated IPT reserve)" },
        jaarpremie: { type: "number", description: "Jaarpremie in EUR (annual premium paid for this IPT contract)" },
        overlijdenskapitaal: { type: "number", description: "Overlijdenskapitaal in EUR (death benefit capital)" },
        gewaarborgd_rendement: { type: "number", description: "Gewaarborgd rendement in percent (guaranteed return rate, e.g. 1.75)" },
        winst_uit_beleggingen: { type: "number", description: "Winst uit beleggingen in EUR (investment profit / winstdeelname for this year). 0 if not shown." },
      },
      required: ["snapshot_date", "year", "opgebouwde_reserve", "jaarpremie", "overlijdenskapitaal", "gewaarborgd_rendement", "winst_uit_beleggingen"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { pdf, mimeType } = await req.json();
    if (!pdf) throw new Error("No PDF provided");

    const systemPrompt = `Je bent een precieze data-extractie-assistent voor Belgische IPT-documenten (Individuele Pensioentoezegging, Dutch / Nederlands).
Je krijgt een jaarlijks IPT-overzicht (PDF) en extraheert vijf waarden plus de referentiedatum:

1. **Opgebouwde reserve op datum** — de totale opgebouwde IPT-reserve / pensioenkapitaal op de referentiedatum.
2. **Jaarpremie** — de jaarlijkse premie / storting voor dit IPT-contract (in EUR).
3. **Overlijdenskapitaal** — het kapitaal bij overlijden / overlijdenswaarborg op de referentiedatum.
4. **Gewaarborgd rendement** — het gewaarborgde rendementspercentage van het contract (bv. 1,75 of 2,25).
5. **Winst uit beleggingen** — de winst uit beleggingen / winstdeelname / beleggingsopbrengst toegekend voor dit boekjaar (in EUR). Soms ook genoemd "winstdeling", "rendement beleggingen", "toegekende winst". Als niet aanwezig → 0.

REGELS:
- Bedragen EXACT overnemen (Belgische notatie "1.234,56" → JSON-getal 1234.56). Niet afronden.
- Percentages als getal (bv. "1,75 %" → 1.75).
- Als een waarde niet zichtbaar is → 0.
- snapshot_date = de "op datum" / "situatie op" / "waardering per" datum. Indien meerdere → de meest recente.
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
              { type: "text", text: "Extraheer de IPT-waarden en de referentiedatum uit deze PDF." },
              { type: "image_url", image_url: { url: `data:${mimeType || "application/pdf"};base64,${pdf}` } },
            ],
          },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_ipt_snapshot" } },
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
  } catch (err: any) {
    console.error("extract-pension-ipt error:", err);
    return new Response(JSON.stringify({ error: err.message || "Onbekende fout" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
