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
  const direct = await quoteFromProviders(token, symbol);
  if (Number(direct.quote?.c || 0) > 0 || !looksLikeIsin(symbol)) {
    return {
      ...direct,
      symbol,
      resolvedSymbol: symbol,
      status: Number(direct.quote?.c || 0) > 0 ? "live" : "unresolved",
    };
  }

  const search = await finnhub(token, "/search", { q: symbol }).catch(() => ({ result: [] }));
  const candidates = ((search.result || []) as Array<{ symbol?: string; displaySymbol?: string }>)
    .flatMap((item) => [item.symbol, item.displaySymbol])
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item) => item && item !== symbol);

  for (const candidate of [...new Set(candidates)].slice(0, 8)) {
    const resolved = await quoteFromProviders(token, candidate);
    if (Number(resolved.quote?.c || 0) > 0) {
      return {
        ...resolved,
        symbol,
        resolvedSymbol: candidate,
        status: "live",
      };
    }
  }

  return { ...direct, symbol, resolvedSymbol: symbol, status: "unresolved" };
}

async function quoteFromProviders(token: string, symbol: string) {
  const [quoteResult, profileResult, metricResult] = await Promise.allSettled([
    finnhub(token, "/quote", { symbol }),
    finnhub(token, "/stock/profile2", { symbol }),
    finnhub(token, "/stock/metric", { symbol, metric: "all" }),
  ]);

  if (quoteResult.status === "fulfilled") {
    const profile = profileResult.status === "fulfilled" ? profileResult.value : {};
    const metric = metricResult.status === "fulfilled" ? metricResult.value?.metric || {} : {};
    return {
      symbol,
      quote: quoteResult.value,
      profile: {
        ...profile,
        averageVolume: Number(metric["10DayAverageTradingVolume"] || metric["3MonthAverageTradingVolume"] || 0),
        beta: Number(metric.beta || 0),
        dividendYield: Number(metric.dividendYieldIndicatedAnnual || metric.currentDividendYieldTTM || 0),
        fiftyTwoWeekHigh: Number(metric["52WeekHigh"] || 0),
        fiftyTwoWeekLow: Number(metric["52WeekLow"] || 0),
        pe: Number(metric.peBasicExclExtraTTM || metric.peNormalizedAnnual || metric.peTTM || 0),
      },
    };
  }

  return yahooQuote(symbol);
}

function looksLikeIsin(value: string) {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value);
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

    const [payload, summary] = await Promise.all([
      response.json(),
      yahooSummary(symbol),
    ]);
    const result = payload?.chart?.result?.[0];
    const meta = result?.meta || {};
    const price = summary?.price || {};
    const summaryDetail = summary?.summaryDetail || {};
    const defaultKeyStatistics = summary?.defaultKeyStatistics || {};
    const summaryProfile = summary?.summaryProfile || {};
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
        d: Number.isFinite(current - previous) ? current - previous : 0,
        dp: previous > 0 && Number.isFinite(current) ? ((current - previous) / previous) * 100 : 0,
        h: Number(meta.regularMarketDayHigh || 0),
        l: Number(meta.regularMarketDayLow || 0),
        o: Number(meta.regularMarketOpen || 0),
        t: Number(meta.regularMarketTime || 0),
      },
      profile: {
        currency: meta.currency,
        exchange: meta.exchangeName || meta.fullExchangeName || meta.exchange,
        averageVolume: rawNumber(summaryDetail.averageVolume) || rawNumber(summaryDetail.averageDailyVolume10Day),
        beta: rawNumber(defaultKeyStatistics.beta),
        dividendYield: rawNumber(summaryDetail.dividendYield) * 100,
        fiftyTwoWeekHigh: Number(meta.fiftyTwoWeekHigh || rawNumber(summaryDetail.fiftyTwoWeekHigh) || 0),
        fiftyTwoWeekLow: Number(meta.fiftyTwoWeekLow || rawNumber(summaryDetail.fiftyTwoWeekLow) || 0),
        finnhubIndustry: summaryProfile.industry || summaryProfile.sector,
        marketCap: Number(meta.marketCap || rawNumber(price.marketCap) || 0),
        name: meta.longName || meta.shortName || price.longName || price.shortName || symbol,
        pe: rawNumber(summaryDetail.trailingPE),
        regularMarketVolume: Number(meta.regularMarketVolume || rawNumber(price.regularMarketVolume) || 0),
        shortName: meta.shortName || price.shortName,
        ticker: symbol,
        weburl: summaryProfile.website,
      },
    };
  } catch (_error) {
    return { symbol, quote: {}, profile: {} };
  }
}

async function yahooSummary(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
  url.searchParams.set("modules", "summaryProfile,defaultKeyStatistics,summaryDetail,price");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MedIncome/1.0)",
        "Accept": "application/json",
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return {};
    }
    const payload = await response.json();
    return payload?.quoteSummary?.result?.[0] || {};
  } catch (_error) {
    return {};
  }
}

function rawNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return 0;
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
  if (symbols.length > 50) throw new HttpError("Request at most 50 symbols at once", 400);
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
