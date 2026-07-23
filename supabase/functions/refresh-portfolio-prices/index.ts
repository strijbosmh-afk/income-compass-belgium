import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FINNHUB_BASE = "https://finnhub.io/api/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const bearerToken = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!cronSecret || bearerToken !== cronSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const finnhubToken = Deno.env.get("FINNHUB_API_KEY") || "";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Distinct portfolio symbols across all users
    const { data: assets, error } = await admin
      .from("portfolio_assets")
      .select("symbol, currency")
      .gt("quantity", 0);
    if (error) throw error;

    const symbols = [
      ...new Map(
        (assets || [])
          .filter((a) => a.symbol && !/^CASH/i.test(a.symbol))
          .map((a) => [String(a.symbol).toUpperCase(), a]),
      ).values(),
    ];

    // Fetch simple FX (EUR base) from Yahoo
    const fxCache: Record<string, number> = { EUR: 1 };
    async function fxToEur(currency: string): Promise<number> {
      const c = (currency || "EUR").toUpperCase();
      if (fxCache[c] !== undefined) return fxCache[c];
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${c}EUR=X?range=5d&interval=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" } },
        );
        const j = await r.json();
        const meta = j?.chart?.result?.[0]?.meta;
        const rate = Number(meta?.regularMarketPrice || 0);
        fxCache[c] = rate > 0 ? rate : 1;
      } catch {
        fxCache[c] = 1;
      }
      return fxCache[c];
    }

    const inserts: Array<Record<string, unknown>> = [];
    let ok = 0;
    let failed = 0;

    for (const a of symbols) {
      const sym = String(a.symbol).toUpperCase();
      const q = await fetchQuote(sym, finnhubToken);
      if (!q || !q.price || q.price <= 0) {
        failed++;
        continue;
      }
      const currency = q.currency || a.currency || "EUR";
      const rate = await fxToEur(currency);
      const priceEur = currency === "EUR" ? q.price : q.price * rate;
      inserts.push({
        symbol: sym,
        resolved_symbol: q.resolvedSymbol || sym,
        price: q.price,
        currency,
        price_eur: priceEur,
      });
      ok++;
    }

    if (inserts.length > 0) {
      const { error: insErr } = await admin
        .from("portfolio_price_snapshots")
        .insert(inserts);
      if (insErr) throw insErr;
    }

    return json({ ok, failed, inserted: inserts.length });
  } catch (e) {
    console.error("refresh-portfolio-prices error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function fetchQuote(symbol: string, finnhubToken: string) {
  // Try Finnhub first (fast, quote endpoint), fall back to Yahoo.
  if (finnhubToken) {
    try {
      const url = new URL(`${FINNHUB_BASE}/quote`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("token", finnhubToken);
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        const c = Number(j?.c || 0);
        if (c > 0) return { price: c, currency: "", resolvedSymbol: symbol };
      } else {
        await r.body?.cancel();
      }
    } catch { /* fall through */ }
  }

  // Yahoo chart 1d
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) {
      await r.body?.cancel();
      return null;
    }
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice || 0);
    if (price > 0) {
      return { price, currency: String(meta?.currency || ""), resolvedSymbol: symbol };
    }
  } catch { /* ignore */ }

  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
