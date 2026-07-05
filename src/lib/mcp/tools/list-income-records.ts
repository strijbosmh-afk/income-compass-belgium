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
  name: "list_income_records",
  title: "Lijst inkomsten-records",
  description:
    "Haal inkomsten-records op voor de ingelogde arts. Filter optioneel op jaar, maand en/of income_type (Ambulant of Gehospitaliseerd).",
  inputSchema: {
    year: z.number().int().min(2000).max(2100).optional().describe("Filter op jaar"),
    month: z.number().int().min(1).max(12).optional().describe("Filter op maand (1-12)"),
    income_type: z.enum(["Ambulant", "Gehospitaliseerd"]).optional(),
    limit: z.number().int().min(1).max(500).default(100).describe("Max aantal rijen"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ year, month, income_type, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet geauthenticeerd" }], isError: true };
    }
    let q = client(ctx)
      .from("income_records")
      .select("id, record_date, year, month, income_type, nomenclature_code, description, quantity, unit_amount, total_amount, aandeel_arts, mif, bouwfonds, netto")
      .order("record_date", { ascending: false })
      .limit(limit ?? 100);
    if (year != null) q = q.eq("year", year);
    if (month != null) q = q.eq("month", month);
    if (income_type) q = q.eq("income_type", income_type);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
