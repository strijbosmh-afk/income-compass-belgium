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
        snapshot_date: { type: "string", description: "Referentiedatum (einde overzichtsjaar) in YYYY-MM-DD. Bv. 'Jaaroverzicht 2024' → '2024-12-31'." },
        year: { type: "integer", description: "Kalenderjaar van het overzicht (bv. 2024)." },
        beginkapitaal: { type: "number", description: "Beginkapitaal = 'Uw spaartegoed/kapitaal op 01/01/<jaar>' in EUR." },
        eindkapitaal: { type: "number", description: "Eindkapitaal = 'Uw spaartegoed/kapitaal op 01/01/<jaar+1>' in EUR." },
        opgebouwde_reserve: { type: "number", description: "Opgebouwde reserve op einddatum (meestal = eindkapitaal)." },
        jaarpremie: { type: "number", description: "Jaarpremie / som van stortingen dit jaar in EUR. 0 indien niet zichtbaar." },
        overlijdenskapitaal: { type: "number", description: "Overlijdenskapitaal in EUR op einddatum." },
        gewaarborgd_rendement: { type: "number", description: "Gewaarborgd rendementspercentage (bv. 1.75). 0 indien niet zichtbaar." },
        winst_uit_beleggingen: { type: "number", description: "Beleggingswinst in EUR. Herken als 'Prestatie van de eenheden' of 'Nettorendement van de fondsen'." },
        inkomende_bewegingen: { type: "number", description: "Som van inkomende bewegingen in EUR (positief)." },
        uitgaande_bewegingen: { type: "number", description: "Som van uitgaande bewegingen in EUR. NEGATIEF indien uitstroom (bv. -10615.41)." },
        kosten_taksen: { type: "number", description: "Som van 'Kosten en taksen' / 'Taksen en kosten' in EUR (negatief indien zo getoond)." },
        kosten_overlijden: { type: "number", description: "Kosten van de overlijdensdekking in EUR (negatief indien zo getoond)." },
      },
      required: ["snapshot_date", "year", "beginkapitaal", "eindkapitaal", "opgebouwde_reserve", "jaarpremie", "overlijdenskapitaal", "gewaarborgd_rendement", "winst_uit_beleggingen", "inkomende_bewegingen", "uitgaande_bewegingen", "kosten_taksen", "kosten_overlijden"],
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

    const systemPrompt = `Je bent een precieze data-extractie-assistent voor Belgische IPT-jaaroverzichten (Individuele Pensioentoezegging, Nederlands).

Extraheer per jaar:
1. year + snapshot_date — herken "Jaaroverzicht <jaar>"; snapshot_date = <jaar>-12-31.
2. beginkapitaal — "Uw spaartegoed op 01/01/<jaar>" of "Uw kapitaal op 01/01/<jaar>".
3. eindkapitaal — "Uw spaartegoed op 01/01/<jaar+1>" of "Uw kapitaal op 01/01/<jaar+1>".
4. opgebouwde_reserve — totale opgebouwde IPT-reserve op einddatum (meestal = eindkapitaal).
5. jaarpremie — jaarlijkse premie / som stortingen.
6. overlijdenskapitaal — kapitaal bij overlijden op einddatum.
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
- Antwoord ALTIJD via de tool call.`;

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
