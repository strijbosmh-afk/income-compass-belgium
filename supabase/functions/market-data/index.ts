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
        return quoteWithFallback(token, symbol);
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
      const interval = String(body.interval || "1d");
      const data = await yahooCandles(symbol, Math.floor(from), Math.floor(to), interval);
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

async function quoteWithFallback(token: string, symbol: string) {
  const [quoteResult, profileResult] = await Promise.allSettled([
    finnhub(token, "/quote", { symbol }),
    finnhub(token, "/stock/profile2", { symbol }),
  ]);

  if (quoteResult.status === "fulfilled") {
    return {
      symbol,
      quote: quoteResult.value,
      profile: profileResult.status === "fulfilled" ? profileResult.value : {},
    };
  }

  return yahooQuote(symbol);
}

async function yahooQuote(symbol: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MedIncome/1.0)",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      await response.body?.cancel();
      return { symbol, quote: {}, profile: {} };
    }

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const validCloses = Array.isArray(closes)
      ? closes.filter((close: unknown) => typeof close === "number" && Number.isFinite(close))
      : [];
    const current = Number(meta.regularMarketPrice ?? validCloses.at(-1) ?? 0);
    const previous = Number(meta.previousClose ?? validCloses.at(-2) ?? current);

    return {
      symbol,
      quote: {
        c: Number.isFinite(current) ? current : 0,
        pc: Number.isFinite(previous) ? previous : 0,
        t: Number(meta.regularMarketTime || 0),
      },
      profile: {
        currency: meta.currency,
        exchange: meta.exchangeName || meta.fullExchangeName || meta.exchange,
        name: meta.longName || meta.shortName || symbol,
        ticker: symbol,
      },
    };
  } catch (_error) {
    return { symbol, quote: {}, profile: {} };
  }
}

async function yahooCandles(symbol: string, from: number, to: number, interval = "1d") {
  const allowed = new Set(["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]);
  const safeInterval = allowed.has(interval) ? interval : "1d";
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(from));
  url.searchParams.set("period2", String(to));
  url.searchParams.set("interval", safeInterval);
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
