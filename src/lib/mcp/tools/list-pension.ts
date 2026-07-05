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
  name: "list_pension_records",
  title: "Lijst pensioen-snapshots",
  description:
    "Haal pensioen- en IPT-snapshots op. Kies bron 'pension' (VAPZ/hoofdcontract) of 'ipt' (IPT).",
  inputSchema: {
    source: z.enum(["pension", "ipt"]).default("pension"),
    year: z.number().int().min(1990).max(2100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ source, year }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet geauthenticeerd" }], isError: true };
    }
    const sb = client(ctx);
    const table = source === "ipt" ? "pension_ipt_records" : "pension_records";
    let q = sb.from(table).select("*").order("snapshot_date", { ascending: false });
    if (year != null) q = q.eq("year", year);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
