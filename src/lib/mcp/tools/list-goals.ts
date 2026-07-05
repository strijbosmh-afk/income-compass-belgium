import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_goals",
  title: "Lijst doelstellingen",
  description: "Haal inkomstendoelen (jaar/kwartaal/maand) van de arts op, optioneel gefilterd op jaar.",
  inputSchema: {
    year: z.number().int().min(2000).max(2100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ year }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet geauthenticeerd" }], isError: true };
    }
    let q = client(ctx)
      .from("income_goals")
      .select("id, year, period_type, period_value, period_start, period_end, income_type, metric, amount, note")
      .order("year", { ascending: false })
      .order("sort_order");
    if (year != null) q = q.eq("year", year);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
