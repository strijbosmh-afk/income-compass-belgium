import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("FINNHUB_API_KEY");
    if (!token) throw new HttpError("FINNHUB_API_KEY is not configured", 500);

    const body = await req.json();
    const action = String(body.action || "");

    if (action === "search") {
      const query = String(body.query || "").trim();
      if (query.length < 2) throw new HttpError("Search query is too short", 400);
      const data = await finnhub(token, "/search", { q: query });
      return json({ results: (data.result || []).slice(0, 12) });
    }

    if (action === "quotes") {
      const symbols = normalizeSymbols(body.symbols);
      const quotes = await Promise.all(symbols.map(async (symbol) => {
        const [quote, profile] = await Promise.all([
          finnhub(token, "/quote", { symbol }),
          finnhub(token, "/stock/profile2", { symbol }).catch(() => ({})),
        ]);
        return { symbol, quote, profile };
      }));
      return json({ quotes });
    }

    if (action === "candles") {
      const symbol = String(body.symbol || "").trim().toUpperCase();
      if (!symbol) throw new HttpError("Symbol is required", 400);
      const from = Number(body.from);
      const to = Number(body.to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
        throw new HttpError("Invalid candle range", 400);
      }
      const data = await yahooCandles(symbol, Math.floor(from), Math.floor(to));
      return json(data);
    }


    throw new HttpError("Unsupported market data action", 400);
  } catch (error: unknown) {
    console.error("market-data error:", error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, status);
  }
});

async function finnhub(token: string, path: string, params: Record<string, string>) {
  const url = new URL(`${FINNHUB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("token", token);

  const response = await fetch(url);
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    throw new HttpError("Market data provider returned invalid JSON", 502);
  }

  if (!response.ok) {
    throw new HttpError(data.error || `Market data provider error: ${response.status}`, response.status);
  }

  return data;
}

async function yahooCandles(symbol: string, from: number, to: number) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(from));
  url.searchParams.set("period2", String(to));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "history");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MedIncome/1.0)",
        "Accept": "application/json",
      },
    });
  } catch (_error) {
    return { s: "no_data", t: [], c: [] };
  }

  if (!response.ok) {
    await response.body?.cancel();
    return { s: "no_data", t: [], c: [] };
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch (_error) {
    return { s: "no_data", t: [], c: [] };
  }

  const result = payload?.chart?.result?.[0];
  const timestamps: number[] | undefined = result?.timestamp;
  const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;

  if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length === 0) {
    return { s: "no_data", t: [], c: [] };
  }

  const t: number[] = [];
  const c: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (typeof close === "number" && Number.isFinite(close)) {
      t.push(timestamps[i]);
      c.push(close);
    }
  }

  if (t.length === 0) return { s: "no_data", t: [], c: [] };
  return { s: "ok", t, c };
}


function normalizeSymbols(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError("Symbols must be an array", 400);
  const symbols = [...new Set(value.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))];
  if (symbols.length === 0) throw new HttpError("At least one symbol is required", 400);
  if (symbols.length > 20) throw new HttpError("Request at most 20 symbols at once", 400);
  return symbols;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
