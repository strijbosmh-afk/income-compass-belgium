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
  name: "list_portfolio_assets",
  title: "Lijst beursportfolio",
  description: "Haal aandelen/ETF posities uit de portfolio van de arts op.",
  inputSchema: {
    symbol: z.string().optional().describe("Filter op ticker"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ symbol }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet geauthenticeerd" }], isError: true };
    }
    let q = client(ctx)
      .from("portfolio_assets")
      .select("id, symbol, name, asset_type, exchange, mic, currency, quantity, purchase_price, purchase_date, notes")
      .order("symbol");
    if (symbol) q = q.eq("symbol", symbol.toUpperCase());
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
