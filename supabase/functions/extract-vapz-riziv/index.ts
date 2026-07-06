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
        snapshot_date: { type: "string", description: "Referentiedatum YYYY-MM-DD" },
        year: { type: "integer", description: "Kalenderjaar" },
        pensioenreserve: { type: "number", description: "Opgebouwde reserve VAP RIZIV / sociaal statuut op datum (EUR)" },
        overlijdensdekking: { type: "number", description: "Overlijdenskapitaal op datum (EUR)" },
        jaarpremie: { type: "number", description: "RIZIV-toelage / jaarlijkse storting (EUR). 0 indien niet zichtbaar." },
      },
      required: ["snapshot_date", "year", "pensioenreserve", "overlijdensdekking", "jaarpremie"],
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

    const systemPrompt = `Je bent een data-extractie-assistent voor Belgische VAP RIZIV / sociaal statuut arts overeenkomsten (Nederlands).

Dit is de aanvullende pensioentoezegging gefinancierd door de RIZIV-toelage voor zorgverleners.

Extraheer:
1. snapshot_date + year — "op datum" / einde overzichtsjaar.
2. pensioenreserve — opgebouwde reserve VAP RIZIV / sociaal statuut op die datum (EUR).
3. overlijdensdekking — kapitaal bij overlijden op die datum (EUR).
4. jaarpremie — RIZIV-toelage of totaal storting dit jaar (EUR); 0 indien onzichtbaar.

REGELS:
- "1.234,56" → 1234.56. Niet afronden.
- Niet zichtbaar → 0.
- Antwoord ALTIJD via de tool call.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
            { type: "text", text: "Extraheer de VAP RIZIV-waarden en referentiedatum uit deze PDF." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${pdf}` } },
          ]},
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_vapz_riziv_snapshot" } },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("AI Gateway error:", res.status, errorText);
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limited." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "Krediet opgebruikt." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${res.status}`);
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Geen data kunnen extraheren." }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    console.error("extract-vapz-riziv error:", err);
    return errorResponse(err, corsHeaders);
  }
});
