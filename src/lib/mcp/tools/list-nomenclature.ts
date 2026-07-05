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
  name: "list_nomenclature",
  title: "Lijst RIZIV-nomenclatuurcodes",
  description: "Haal de nomenclatuurcodes van de arts op, optioneel gefilterd op categorie of code.",
  inputSchema: {
    category: z.string().optional(),
    code: z.string().optional().describe("Filter op exacte code"),
    limit: z.number().int().min(1).max(1000).default(500),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, code, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet geauthenticeerd" }], isError: true };
    }
    let q = client(ctx)
      .from("nomenclature_codes")
      .select("id, code, description, category, netto_amount")
      .order("code")
      .limit(limit ?? 500);
    if (category) q = q.eq("category", category);
    if (code) q = q.eq("code", code);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
