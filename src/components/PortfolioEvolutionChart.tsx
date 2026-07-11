import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, LineChart as LineIcon, TrendingUp, TrendingDown } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';

export type EvolutionAsset = {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  quantity: number;
  purchase_date: string;
  purchase_price: number;
  notes: string | null;
};

type RangeKey = '1D' | '1W' | '1M' | '6M' | 'YTD' | '1Y' | '5Y';
const ranges: RangeKey[] = ['1D', '1W', '1M', '6M', 'YTD', '1Y', '5Y'];

const SERIES_COLORS = [
  '#2f9e91', '#1d4f7a', '#8b5cf6', '#f59e0b', '#ef4444',
  '#22c55e', '#ec4899', '#0ea5e9', '#a855f7', '#f97316',
  '#14b8a6', '#eab308',
];

type CandleResp = { s: string; t?: number[]; c?: number[]; currency?: string };

type Point = { date: string } & Record<string, number>;

function getRange(range: RangeKey) {
  const to = Math.floor(Date.now() / 1000);
  const now = new Date();
  const from = new Date(now);
  let interval = '1d';
  if (range === '1D') {
    from.setDate(now.getDate() - 1);
    interval = '5m';
  } else if (range === '1W') {
    from.setDate(now.getDate() - 7);
    interval = '60m';
  } else if (range === '1M') {
    from.setMonth(now.getMonth() - 1);
  } else if (range === '6M') {
    from.setMonth(now.getMonth() - 6);
  } else if (range === 'YTD') {
    from.setMonth(0, 1);
  } else if (range === '1Y') {
    from.setFullYear(now.getFullYear() - 1);
  } else if (range === '5Y') {
    from.setFullYear(now.getFullYear() - 5);
    interval = '1wk';
  }
  from.setHours(0, 0, 0, 0);
  return { from: Math.floor(from.getTime() / 1000), to, interval };
}

function money(v: number) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
}
function compact(v: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);
}
function pct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function fmtDate(d: string, intraday: boolean) {
  if (!d) return '';
  if (intraday) {
    const dt = new Date(d);
    return dt.toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  const dt = new Date(d);
  return dt.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: '2-digit' });
}

type Props = {
  assets: EvolutionAsset[];
  fxRates: Record<string, number>;
};

export function PortfolioEvolutionChart({ assets, fxRates }: Props) {
  const [range, setRange] = useState<RangeKey>('1M');
  const [mode, setMode] = useState<'total' | 'positions'>('total');
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<Record<string, { t: number[]; c: number[]; currency: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const investable = useMemo(
    () => assets.filter((a) => a.quantity > 0 && a.symbol && !/^CASH/i.test(a.symbol)),
    [assets],
  );

  // init selection: top-5 by cost value once
  useEffect(() => {
    if (selected.size > 0 || investable.length === 0) return;
    const top = [...investable]
      .sort((a, b) => b.quantity * b.purchase_price - a.quantity * a.purchase_price)
      .slice(0, 5)
      .map((a) => a.symbol);
    setSelected(new Set(top));
  }, [investable, selected.size]);

  const toEur = (value: number, currency: string) => {
    if (!value) return 0;
    const c = (currency || 'EUR').toUpperCase();
    if (c === 'EUR') return value;
    const r = fxRates[c];
    if (!r || r <= 0) return value;
    return value / r;
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (investable.length === 0) {
        setSeries({});
        return;
      }
      setLoading(true);
      const { from, to, interval } = getRange(range);
      const symbols = [...new Set(investable.map((a) => a.symbol))];

      // 1) Live candles per symbol (Yahoo via edge function)
      const candleResults = await Promise.all(
        symbols.map(async (symbol) => {
          const { data } = await supabase.functions.invoke('market-data', {
            body: { action: 'candles', symbol, from, to, interval },
          });
          const resp = data as CandleResp | undefined;
          if (!resp || resp.s !== 'ok' || !resp.t || !resp.c) return { symbol, t: [] as number[], c: [] as number[] };
          return { symbol, t: resp.t, c: resp.c };
        }),
      );

      // 2) Stored snapshots (refreshed 6x/day) — merged in to fill gaps
      const { data: snaps } = await supabase
        .from('portfolio_price_snapshots')
        .select('symbol, snapshot_at, price')
        .in('symbol', symbols)
        .gte('snapshot_at', new Date(from * 1000).toISOString())
        .lte('snapshot_at', new Date(to * 1000).toISOString())
        .order('snapshot_at', { ascending: true });

      if (cancelled) return;

      const map: Record<string, { t: number[]; c: number[] }> = {};
      candleResults.forEach((r) => (map[r.symbol] = { t: [...r.t], c: [...r.c] }));

      // Merge snapshot rows per symbol (dedupe by ts, prefer existing candle value)
      const snapBySym = new Map<string, Array<{ ts: number; price: number }>>();
      for (const row of snaps || []) {
        const sym = String(row.symbol).toUpperCase();
        const ts = Math.floor(new Date(row.snapshot_at as string).getTime() / 1000);
        const price = Number(row.price);
        if (!Number.isFinite(price) || price <= 0) continue;
        const arr = snapBySym.get(sym) || [];
        arr.push({ ts, price });
        snapBySym.set(sym, arr);
      }

      for (const sym of symbols) {
        const existing = map[sym] || { t: [], c: [] };
        const known = new Set(existing.t);
        const extra = snapBySym.get(sym) || [];
        for (const { ts, price } of extra) {
          if (known.has(ts)) continue;
          existing.t.push(ts);
          existing.c.push(price);
          known.add(ts);
        }
        // sort chronologically
        const zipped = existing.t.map((t, i) => ({ t, c: existing.c[i] })).sort((a, b) => a.t - b.t);
        map[sym] = { t: zipped.map((z) => z.t), c: zipped.map((z) => z.c) };
      }

      setSeries(map);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range, investable]);

  const intraday = range === '1D' || range === '1W';

  const { chartData, totalStart, totalEnd, perSymbolStats } = useMemo(() => {
    const bySymbol = new Map<string, EvolutionAsset[]>();
    for (const a of investable) {
      const arr = bySymbol.get(a.symbol) || [];
      arr.push(a);
      bySymbol.set(a.symbol, arr);
    }

    // Baseline (cost) value per symbol in EUR — from Bolero snapshot
    const baselineEur = new Map<string, number>();
    // Weighted avg cost price per symbol (in symbol currency) — for pre-market fallback
    const avgCostPrice = new Map<string, { price: number; currency: string }>();
    for (const [sym, holdings] of bySymbol) {
      let cost = 0;
      let qty = 0;
      let currency = holdings[0]?.currency || 'EUR';
      for (const h of holdings) {
        cost += toEur(h.quantity * h.purchase_price, h.currency);
        qty += h.quantity;
      }
      baselineEur.set(sym, cost);
      const totalCostSymCur = holdings.reduce((s, h) => s + h.quantity * h.purchase_price, 0);
      avgCostPrice.set(sym, { price: qty > 0 ? totalCostSymCur / qty : 0, currency });
    }

    // Union of all timestamps
    const allTs = new Set<number>();
    for (const s of Object.values(series)) {
      s.t.forEach((ts) => allTs.add(ts));
    }
    let timeline = [...allTs].sort((a, b) => a - b);

    // If no market data at all: synthesize a flat baseline over the selected range
    if (timeline.length === 0) {
      const { from, to } = getRange(range);
      timeline = [from, to];
    }

    // Per-symbol forward-fill map, seeded with cost price so early points are filled
    const filled: Record<string, Map<number, number>> = {};
    for (const sym of bySymbol.keys()) {
      const s = series[sym];
      const byTs = new Map<number, number>();
      if (s) {
        s.t.forEach((ts, i) => {
          const v = s.c[i];
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) byTs.set(ts, v);
        });
      }
      const out = new Map<number, number>();
      // Seed with cost price so timestamps before first market tick still get a value
      let last = avgCostPrice.get(sym)?.price || 0;
      for (const ts of timeline) {
        const v = byTs.get(ts);
        if (v !== undefined) last = v;
        if (last > 0) out.set(ts, last);
      }
      filled[sym] = out;
    }

    const rows: Point[] = timeline.map((ts) => {
      const dateKey = intraday
        ? new Date(ts * 1000).toISOString().slice(0, 16)
        : new Date(ts * 1000).toISOString().slice(0, 10);
      const row: Point = { date: dateKey } as Point;
      let total = 0;
      for (const [sym, holdings] of bySymbol) {
        const close = filled[sym]?.get(ts);
        let symValue = 0;
        if (close && close > 0) {
          for (const h of holdings) {
            symValue += toEur(h.quantity * close, h.currency);
          }
        } else {
          // Ultimate fallback: cost baseline from Bolero snapshot
          symValue = baselineEur.get(sym) || 0;
        }
        if (symValue > 0) {
          row[sym] = symValue;
          total += symValue;
        }
      }
      row.__total = total;
      return row;
    });

    const firstRow = rows[0];
    const lastRow = rows[rows.length - 1];
    const stats: Record<string, { start: number; end: number }> = {};
    for (const sym of Object.keys(series)) {
      stats[sym] = { start: Number(firstRow?.[sym] || 0), end: Number(lastRow?.[sym] || 0) };
    }

    return {
      chartData: rows,
      totalStart: Number(firstRow?.__total || 0),
      totalEnd: Number(lastRow?.__total || 0),
      perSymbolStats: stats,
    };
  }, [series, investable, intraday, fxRates, range]);

  const totalChange = totalEnd - totalStart;
  const totalChangePct = totalStart > 0 ? (totalChange / totalStart) * 100 : 0;

  const symbolMeta = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    const symbols = [...new Set(investable.map((a) => a.symbol))];
    symbols.forEach((sym, i) => {
      const a = investable.find((x) => x.symbol === sym);
      m.set(sym, { name: a?.name || sym, color: SERIES_COLORS[i % SERIES_COLORS.length] });
    });
    return m;
  }, [investable]);

  const shownSymbols = useMemo(() => {
    return [...symbolMeta.keys()].filter((s) => selected.has(s));
  }, [symbolMeta, selected]);

  function toggleSymbol(sym: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }

  const noData = chartData.length === 0;

  return (
    <Card className="data-card">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <LineIcon className="h-4 w-4" /> Evolutie portefeuille
          </CardTitle>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-2xl font-semibold tabular-nums">{money(totalEnd)}</span>
            <Badge variant="outline" className={`gap-1 ${totalChange >= 0 ? 'text-green-600 border-green-500/30' : 'text-red-600 border-red-500/30'}`}>
              {totalChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {money(totalChange)} · {pct(totalChangePct)}
            </Badge>
            <span className="text-xs text-muted-foreground">Baseline: Bolero-snapshot · {investable.length} posities</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'total' | 'positions')}>
            <TabsList>
              <TabsTrigger value="total">Totaal</TabsTrigger>
              <TabsTrigger value="positions">Per positie</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <TabsList>
              {ranges.map((r) => (
                <TabsTrigger key={r} value={r}>{r === '5Y' ? '5J' : r === '1Y' ? '1J' : r}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'positions' && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(symbolMeta.keys()))}>Alles</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Geen</Button>
            {[...symbolMeta.entries()].map(([sym, meta]) => {
              const isSel = selected.has(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleSymbol(sym)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                    isSel ? 'bg-primary/5 border-primary/40' : 'bg-background border-border text-muted-foreground hover:text-foreground'
                  }`}
                  title={meta.name}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color, opacity: isSel ? 1 : 0.35 }} />
                  <span className="font-medium">{sym}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="h-80 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {noData ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {investable.length === 0
                ? 'Importeer je Bolero-portefeuille om de evolutie te tonen.'
                : 'Geen historische marktdata voor deze periode.'}
            </div>
          ) : mode === 'total' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="evoTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtDate(String(v), intraday)} minTickGap={40} />
                <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => compact(Number(v))} domain={['dataMin', 'dataMax']} />
                <Tooltip
                  formatter={(v: any) => money(Number(v))}
                  labelFormatter={(l) => fmtDate(String(l), intraday)}
                  contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="__total" name="Totaal" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#evoTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtDate(String(v), intraday)} minTickGap={40} />
                <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => compact(Number(v))} domain={['dataMin', 'dataMax']} />
                <Tooltip
                  formatter={(v: any, n: any) => [money(Number(v)), String(n)]}
                  labelFormatter={(l) => fmtDate(String(l), intraday)}
                  contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {shownSymbols.map((sym) => (
                  <Line
                    key={sym}
                    type="monotone"
                    dataKey={sym}
                    name={sym}
                    stroke={symbolMeta.get(sym)?.color}
                    strokeWidth={1.8}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {mode === 'positions' && shownSymbols.length > 0 && !noData && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {shownSymbols.map((sym) => {
              const s = perSymbolStats[sym];
              const change = (s?.end || 0) - (s?.start || 0);
              const changePct = s?.start ? (change / s.start) * 100 : 0;
              const meta = symbolMeta.get(sym);
              return (
                <div key={sym} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta?.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{sym}</div>
                    <div className="text-muted-foreground tabular-nums">{money(s?.end || 0)}</div>
                  </div>
                  <div className={`tabular-nums font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {pct(changePct)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
