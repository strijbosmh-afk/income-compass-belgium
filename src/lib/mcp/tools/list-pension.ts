import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const TABLES = {
  ipt: "pension_ipt_records",
  vapz: "vapz_records",
  vapz_riziv: "vapz_riziv_records",
  pensioensparen: "pensioensparen_records",
} as const;

export default defineTool({
  name: "list_pension_records",
  title: "Lijst pensioen-snapshots",
  description:
    "Haal pensioen-snapshots op. Kies bron: 'ipt' (Individuele Pensioentoezegging), 'vapz', 'vapz_riziv' (RIZIV sociaal statuut) of 'pensioensparen' (3de pijler).",
  inputSchema: {
    source: z.enum(["ipt", "vapz", "vapz_riziv", "pensioensparen"]).default("ipt"),
    year: z.number().int().min(1990).max(2100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ source, year }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet geauthenticeerd" }], isError: true };
    }
    const sb = client(ctx);
    let q = sb.from(TABLES[source]).select("*").order("snapshot_date", { ascending: false });
    if (year != null) q = q.eq("year", year);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
