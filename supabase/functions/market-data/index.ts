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
        const [quote, profile, metric] = await Promise.all([
          finnhub(token, "/quote", { symbol }),
          finnhub(token, "/stock/profile2", { symbol }).catch(() => ({})),
          finnhub(token, "/stock/metric", { symbol, metric: "all" }).catch(() => ({})),
        ]);
        return { symbol, quote, profile, metric: metric.metric || {} };
      }));
      return json({ quotes });
    }

    if (action === "fx-rates") {
      const currencies = normalizeCurrencies(body.currencies);
      const rates: Record<string, number> = { EUR: 1 };
      await Promise.all(currencies.filter((currency) => currency !== "EUR").map(async (currency) => {
        const data = await finnhub(token, "/forex/rates", { base: currency });
        const eurRate = Number(data.quote?.EUR || 0);
        if (Number.isFinite(eurRate) && eurRate > 0) rates[currency] = eurRate;
      }));
      return json({ base: "EUR", rates });
    }

    if (action === "candles") {
      const symbol = String(body.symbol || "").trim().toUpperCase();
      if (!symbol) throw new HttpError("Symbol is required", 400);
      const from = Number(body.from);
      const to = Number(body.to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
        throw new HttpError("Invalid candle range", 400);
      }
      const data = await finnhub(token, "/stock/candle", {
        symbol,
        resolution: "D",
        from: String(Math.floor(from)),
        to: String(Math.floor(to)),
      });
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
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    throw new HttpError("Market data provider returned invalid JSON", 502);
  }

  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data ? String(data.error) : `Market data provider error: ${response.status}`;
    throw new HttpError(message, response.status);
  }

  return data as Record<string, any>;
}

function normalizeSymbols(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError("Symbols must be an array", 400);
  const symbols = [...new Set(value.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))];
  if (symbols.length === 0) throw new HttpError("At least one symbol is required", 400);
  if (symbols.length > 20) throw new HttpError("Request at most 20 symbols at once", 400);
  return symbols;
}

function normalizeCurrencies(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError("Currencies must be an array", 400);
  const currencies = [...new Set(value.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))];
  if (currencies.length === 0) throw new HttpError("At least one currency is required", 400);
  if (currencies.length > 12) throw new HttpError("Request at most 12 currencies at once", 400);
  return currencies;
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
