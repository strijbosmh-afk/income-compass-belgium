import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDF_MIME_TYPES, errorResponse, requireAiCaller, validateBase64Payload } from "../_shared/security.ts";

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
        snapshot_date: { type: "string", description: "Referentiedatum YYYY-MM-DD ('op datum' / 'situatie op' / einde overzichtsjaar)" },
        year: { type: "integer", description: "Kalenderjaar van snapshot" },
        pensioenreserve: { type: "number", description: "Opgebouwde VAPZ-reserve op referentiedatum in EUR" },
        overlijdensdekking: { type: "number", description: "Overlijdensdekking/kapitaal bij overlijden op referentiedatum in EUR" },
        jaarpremie: { type: "number", description: "Jaarpremie / totaal stortingen in dit jaar in EUR. 0 indien niet zichtbaar." },
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

    const systemPrompt = `Je bent een data-extractie-assistent voor Belgische VAPZ-jaaroverzichten (Vrij Aanvullend Pensioen Zelfstandigen, Nederlands).

Extraheer exact:
1. snapshot_date + year — de "op datum" / "situatie op" / einde overzichtsjaar.
2. pensioenreserve — de opgebouwde VAPZ-reserve op die datum (EUR).
3. overlijdensdekking — kapitaal bij overlijden op die datum (EUR).
4. jaarpremie — jaarlijkse premie of som stortingen dit jaar (EUR); 0 als niet zichtbaar.

REGELS:
- Belgische notatie "1.234,56" → 1234.56. Niet afronden.
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
            { type: "text", text: "Extraheer de VAPZ-waarden en referentiedatum uit deze PDF." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${pdf}` } },
          ]},
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_vapz_snapshot" } },
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
    console.error("extract-vapz error:", err);
    return errorResponse(err, corsHeaders);
  }
});
