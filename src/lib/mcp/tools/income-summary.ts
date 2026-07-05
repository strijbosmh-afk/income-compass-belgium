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
  name: "income_summary",
  title: "Inkomsten samenvatting",
  description:
    "Bereken totalen (bruto, aandeel arts, MIF, bouwfonds, netto) per income_type voor een jaar of specifieke maand.",
  inputSchema: {
    year: z.number().int().min(2000).max(2100).describe("Jaar"),
    month: z.number().int().min(1).max(12).optional().describe("Optionele maand"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ year, month }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet geauthenticeerd" }], isError: true };
    }
    let q = client(ctx)
      .from("income_records")
      .select("income_type, total_amount, aandeel_arts, mif, bouwfonds, netto")
      .eq("year", year);
    if (month != null) q = q.eq("month", month);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const totals: Record<string, { count: number; total_amount: number; aandeel_arts: number; mif: number; bouwfonds: number; netto: number }> = {};
    for (const r of data ?? []) {
      const t = (totals[r.income_type] ??= { count: 0, total_amount: 0, aandeel_arts: 0, mif: 0, bouwfonds: 0, netto: 0 });
      t.count += 1;
      t.total_amount += Number(r.total_amount ?? 0);
      t.aandeel_arts += Number(r.aandeel_arts ?? 0);
      t.mif += Number(r.mif ?? 0);
      t.bouwfonds += Number(r.bouwfonds ?? 0);
      t.netto += Number(r.netto ?? 0);
    }
    const summary = { year, month: month ?? null, by_income_type: totals };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
