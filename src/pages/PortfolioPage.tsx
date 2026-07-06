import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, BarChart3, Building2, Clock3, ExternalLink, FileSpreadsheet, Loader2, Pencil, PieChart, Plus, RefreshCw, Search, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

type AssetType = 'stock' | 'etf' | 'fund' | 'bond' | 'crypto' | 'other';
type RangeKey = '1D' | '1W' | '1M' | '6M' | 'YTD' | '1Y';

type PortfolioAsset = {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  exchange: string | null;
  mic: string | null;
  currency: string;
  purchase_date: string;
  quantity: number;
  purchase_price: number;
  notes: string | null;
};

type SymbolResult = {
  description?: string;
  displaySymbol?: string;
  symbol: string;
  type?: string;
};

type MarketQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type QuoteEntry = {
  symbol: string;
  quote: MarketQuote;
  profile?: {
    country?: string;
    currency?: string;
    exchange?: string;
    finnhubIndustry?: string;
    averageVolume?: number;
    beta?: number;
    dividendYield?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    logo?: string;
    marketCapitalization?: number;
    marketCap?: number;
    name?: string;
    regularMarketVolume?: number;
    shareOutstanding?: number;
    shortName?: string;
    ticker?: string;
    weburl?: string;
    pe?: number;
  };
};

type FormState = {
  symbol: string;
  name: string;
  asset_type: AssetType;
  exchange: string;
  mic: string;
  currency: string;
  purchase_date: string;
  quantity: string;
  purchase_price: string;
  notes: string;
};

type BoleroPosition = {
  type: string;
  currency: string;
  quantity: number;
  name: string;
  avgPrice: number;
  purchaseValue: number;
  currentQuote: number;
  currentValue: number;
  eurValue: number;
  returnPct: number;
  market: string;
  returnValue: number;
  isin: string;
};

const emptyForm: FormState = {
  symbol: '',
  name: '',
  asset_type: 'etf',
  exchange: '',
  mic: '',
  currency: 'EUR',
  purchase_date: new Date().toISOString().slice(0, 10),
  quantity: '',
  purchase_price: '',
  notes: '',
};

const rangeLabels: RangeKey[] = ['1D', '1W', '1M', '6M', 'YTD', '1Y'];

export default function PortfolioPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteEntry>>({});
  const [history, setHistory] = useState<{ date: string; value: number }[]>([]);
  const [eurHistory, setEurHistory] = useState<{ date: string; value: number }[]>([]);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ EUR: 1 });
  const [fxUpdated, setFxUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [marketLoading, setMarketLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [range, setRange] = useState<RangeKey>('1M');
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().slice(0, 10));
  const [chartCurrency, setChartCurrency] = useState('EUR');
  const [importingBolero, setImportingBolero] = useState(false);
  const boleroInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    loadAssets();
    loadFx();
  }, [user]);

  async function loadFx() {
    try {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
      const data = await res.json();
      if (data?.rates) {
        setFxRates({ EUR: 1, ...data.rates });
        setFxUpdated(data.date || '');
      }
    } catch (_err) {
      // keep default EUR=1
    }
  }


  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (query.trim().length >= 2) searchSymbols(query);
      else setResults([]);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (assets.length === 0) {
      setQuotes({});
      setHistory([]);
      return;
    }
    refreshMarketData();
    const handle = window.setInterval(() => {
      refreshMarketData();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(handle);
  }, [assets, range, chartCurrency]);

  const toEur = useMemo(() => {
    return (value: number, currency: string) => {
      if (!value) return 0;
      const ccy = (currency || 'EUR').toUpperCase();
      if (ccy === 'EUR') return value;
      const rate = fxRates[ccy];
      if (!rate || rate <= 0) return value;
      return value / rate;
    };
  }, [fxRates]);

  const currencyGroups = useMemo(() => {
    const groups = new Map<string, { cost: number; value: number; gain: number }>();
    for (const asset of assets) {
      const quote = quotes[asset.symbol]?.quote;
      const livePrice = Number(quote?.c || 0);
      const isBoleroSnapshot = Boolean(asset.notes?.includes('Bolero Expert snapshot'));
      const currentPrice = livePrice > 0 ? livePrice : (isBoleroSnapshot ? asset.purchase_price : 0);
      const cost = asset.quantity * asset.purchase_price;
      const value = currentPrice > 0 ? asset.quantity * currentPrice : 0;
      const prev = groups.get(asset.currency) || { cost: 0, value: 0, gain: 0 };
      groups.set(asset.currency, { cost: prev.cost + cost, value: prev.value + value, gain: prev.gain + value - cost });
    }
    return Array.from(groups.entries()).map(([currency, totals]) => ({ currency, ...totals }));
  }, [assets, quotes]);

  const eurTotals = useMemo(() => {
    let cost = 0;
    let value = 0;
    for (const group of currencyGroups) {
      cost += toEur(group.cost, group.currency);
      value += toEur(group.value, group.currency);
    }
    return { cost, value, gain: value - cost };
  }, [currencyGroups, toEur]);

  useEffect(() => {
    if (currencyGroups.length > 0 && !currencyGroups.some((group) => group.currency === chartCurrency)) {
      setChartCurrency(currencyGroups[0].currency);
    }
  }, [currencyGroups, chartCurrency]);

  const portfolioRows = useMemo(() => assets.map((asset) => {
    const quoteEntry = quotes[asset.symbol];
    const quote = quoteEntry?.quote;
    const profile = quoteEntry?.profile || {};
    const livePrice = Number(quote?.c || 0);
    const isBoleroSnapshot = Boolean(asset.notes?.includes('Bolero Expert snapshot'));
    const currentPrice = livePrice > 0 ? livePrice : (isBoleroSnapshot ? asset.purchase_price : 0);
    const previousClose = Number(quote?.pc || 0);
    const cost = asset.quantity * asset.purchase_price;
    const currentValue = currentPrice > 0 ? asset.quantity * currentPrice : 0;
    const gain = currentValue - cost;
    const dayChangeAmount = Number(quote?.d ?? (currentPrice - previousClose));
    const dayChange = Number(quote?.dp ?? (currentPrice > 0 && previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0));
    const quoteCurrency = (profile.currency || asset.currency || 'EUR').toUpperCase();
    const dayLow = Number(quote?.l || 0);
    const dayHigh = Number(quote?.h || 0);
    const open = Number(quote?.o || 0);
    const weekLow = Number(profile.fiftyTwoWeekLow || 0);
    const weekHigh = Number(profile.fiftyTwoWeekHigh || 0);
    const marketCap = Number(profile.marketCap || (profile.marketCapitalization ? profile.marketCapitalization * 1_000_000 : 0));
    const volume = Number(profile.regularMarketVolume || 0);
    const averageVolume = Number(profile.averageVolume || 0);
    const allocation = eurTotals.value > 0 && currentValue > 0 ? (toEur(currentValue, quoteCurrency) / eurTotals.value) * 100 : 0;
    const dividendYield = Number(profile.dividendYield || 0);
    const gainPct = cost > 0 && currentValue > 0 ? (gain / cost) * 100 : 0;
    const updatedAt = quote?.t ? new Date(Number(quote.t) * 1000).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : '';
    return {
      allocation,
      asset,
      averageVolume,
      beta: Number(profile.beta || 0),
      currentPrice,
      cost,
      currentValue,
      dayChange,
      dayChangeAmount,
      dayHigh,
      dayLow,
      dividendYield,
      exchange: profile.exchange || asset.exchange || '',
      gain,
      gainPct,
      industry: profile.finnhubIndustry || '',
      marketCap,
      name: profile.name || profile.shortName || asset.name,
      open,
      pe: Number(profile.pe || 0),
      previousClose,
      quoteCurrency,
      updatedAt,
      volume,
      website: profile.weburl || '',
      weekHigh,
      weekLow,
      isBoleroSnapshot,
    };
  }), [assets, quotes, eurTotals.value, toEur]);

  const valueAtDate = useMemo(() => {
    if (history.length === 0) return currencyGroups.find((group) => group.currency === chartCurrency)?.value || 0;
    const target = history.filter((point) => point.date <= valuationDate).at(-1);
    return target?.value ?? 0;
  }, [history, valuationDate, currencyGroups, chartCurrency]);

  const eurValueAtDate = useMemo(() => {
    if (eurHistory.length === 0) return eurTotals.value;
    const target = eurHistory.filter((point) => point.date <= valuationDate).at(-1);
    return target?.value ?? eurTotals.value;
  }, [eurHistory, valuationDate, eurTotals]);

  const bestPerformer = useMemo(() => {
    return portfolioRows
      .filter((row) => row.currentValue > 0)
      .sort((a, b) => b.gainPct - a.gainPct)[0] || null;
  }, [portfolioRows]);

  const topHolding = useMemo(() => {
    return portfolioRows
      .filter((row) => row.currentValue > 0)
      .sort((a, b) => b.allocation - a.allocation)[0] || null;
  }, [portfolioRows]);

  const totalReturnPct = eurTotals.cost > 0 ? (eurTotals.gain / eurTotals.cost) * 100 : 0;

  async function loadAssets() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('portfolio_assets')
      .select('*')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false });
    if (error) toast.error(error.message);
    else setAssets((data || []).map(normalizeAsset));
    setLoading(false);
  }

  async function searchSymbols(term: string) {
    setSearching(true);
    const { data, error } = await supabase.functions.invoke('market-data', {
      body: { action: 'search', query: term },
    });
    setSearching(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Ticker zoeken mislukt');
      return;
    }
    setResults(data.results || []);
  }

  async function refreshMarketData() {
    setMarketLoading(true);
    const symbols = [...new Set(assets.map((asset) => asset.symbol))];
    const { data, error } = await supabase.functions.invoke('market-data', {
      body: { action: 'quotes', symbols },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Koersen ophalen mislukt');
      setMarketLoading(false);
      return;
    }

    const nextQuotes: Record<string, QuoteEntry> = {};
    (data.quotes || []).forEach((entry: QuoteEntry) => {
      nextQuotes[entry.symbol] = entry;
    });
    setQuotes(nextQuotes);
    await loadHistory(symbols);
    setMarketLoading(false);
  }

  async function loadHistory(symbols: string[]) {
    const { from, to, interval } = getRange(range);
    const intraday = interval !== '1d';
    const series = await Promise.all(symbols.map(async (symbol) => {
      const { data } = await supabase.functions.invoke('market-data', {
        body: { action: 'candles', symbol, from, to, interval },
      });
      if (!data || data.s !== 'ok') return { symbol, points: [] as { date: string; close: number }[] };
      const points = (data.t || []).map((ts: number, idx: number) => ({
        date: intraday
          ? new Date(ts * 1000).toISOString().slice(0, 16)
          : new Date(ts * 1000).toISOString().slice(0, 10),
        close: Number(data.c?.[idx] || 0),
      }));
      return { symbol, points };
    }));

    const purchaseGate = (assetDate: string, pointKey: string) =>
      intraday ? pointKey.slice(0, 10) >= assetDate : pointKey >= assetDate;

    // Union of all timeline keys across every symbol → shared x-axis
    const allDates = new Set<string>();
    for (const item of series) {
      for (const point of item.points) {
        if (point.close > 0) allDates.add(point.date);
      }
    }
    const timeline = Array.from(allDates).sort((a, b) => a.localeCompare(b));

    // For each asset, carry the last known close forward over the timeline so a
    // missing candle (weekend, holiday, delayed provider update) doesn't drop the
    // asset out of the cumulative sum.
    const buildAssetSeries = (asset: PortfolioAsset) => {
      const symbolPoints = series.find((item) => item.symbol === asset.symbol)?.points || [];
      const closeByDate = new Map<string, number>();
      for (const point of symbolPoints) {
        if (point.close > 0) closeByDate.set(point.date, point.close);
      }
      const values = new Map<string, number>();
      let last = 0;
      for (const date of timeline) {
        const next = closeByDate.get(date);
        if (next !== undefined) last = next;
        if (last <= 0) continue;
        if (!purchaseGate(asset.purchase_date, date)) continue;
        values.set(date, last * asset.quantity);
      }
      return values;
    };

    const byDate = new Map<string, number>();
    const chartAssets = assets.filter((asset) => asset.currency === chartCurrency);
    for (const asset of chartAssets) {
      for (const [date, value] of buildAssetSeries(asset)) {
        byDate.set(date, (byDate.get(date) || 0) + value);
      }
    }
    setHistory(Array.from(byDate.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)));

    // Cumulative EUR history across ALL currencies (using latest FX rate)
    const eurByDate = new Map<string, number>();
    for (const asset of assets) {
      for (const [date, value] of buildAssetSeries(asset)) {
        eurByDate.set(date, (eurByDate.get(date) || 0) + toEur(value, asset.currency));
      }
    }
    setEurHistory(Array.from(eurByDate.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)));
  }

  function selectSymbol(result: SymbolResult) {
    setForm((prev) => ({
      ...prev,
      symbol: result.symbol,
      name: result.description || result.displaySymbol || result.symbol,
      asset_type: inferAssetType(result.type),
    }));
    setQuery(result.displaySymbol || result.symbol);
    setResults([]);
  }

  async function saveAsset() {
    if (!user) return;
    const symbol = form.symbol.trim().toUpperCase();
    const quantity = Number(form.quantity);
    const purchasePrice = Number(form.purchase_price);
    if (!symbol || !form.purchase_date || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(purchasePrice) || purchasePrice < 0) {
      toast.error('Vul minstens ticker, aankoopdatum, aantal en aankoopprijs correct in.');
      return;
    }

    setSaving(true);
    const payload = {
      user_id: user.id,
      symbol,
      name: form.name.trim() || symbol,
      asset_type: form.asset_type,
      exchange: form.exchange.trim() || null,
      mic: form.mic.trim() || null,
      currency: form.currency.trim().toUpperCase() || 'EUR',
      purchase_date: form.purchase_date,
      quantity,
      purchase_price: purchasePrice,
      notes: form.notes.trim() || null,
    };

    const query = editingId
      ? (supabase as any).from('portfolio_assets').update(payload).eq('id', editingId)
      : (supabase as any).from('portfolio_assets').insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? 'Positie bijgewerkt' : 'Positie toegevoegd');
    setForm(emptyForm);
    setQuery('');
    setEditingId(null);
    loadAssets();
  }

  function editAsset(asset: PortfolioAsset) {
    setEditingId(asset.id);
    setQuery(asset.symbol);
    setForm({
      symbol: asset.symbol,
      name: asset.name,
      asset_type: asset.asset_type,
      exchange: asset.exchange || '',
      mic: asset.mic || '',
      currency: asset.currency,
      purchase_date: asset.purchase_date,
      quantity: String(asset.quantity),
      purchase_price: String(asset.purchase_price),
      notes: asset.notes || '',
    });
  }

  async function deleteAsset(id: string) {
    if (!confirm('Deze positie verwijderen?')) return;
    const { error } = await (supabase as any).from('portfolio_assets').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Positie verwijderd');
      loadAssets();
    }
  }

  async function importBoleroFile(file: File) {
    if (!user) return;
    setImportingBolero(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const positions = parseBoleroWorkbook(workbook, XLSX);
      if (positions.length === 0) {
        toast.error('Geen Bolero-posities gevonden in dit bestand.');
        return;
      }

      // Wis alle bestaande portfolio-posities bij een nieuwe import
      const { error: deleteError } = await (supabase as any)
        .from('portfolio_assets')
        .delete()
        .eq('user_id', user.id);
      if (deleteError) throw deleteError;

      const payload = positions.map((position) => boleroPositionToAsset(position, user.id, file.name));
      const { error } = await (supabase as any).from('portfolio_assets').insert(payload);
      if (error) throw error;

      toast.success('Bolero-portefeuille geïmporteerd', {
        description: `${payload.length} positie(s) als huidige snapshot geladen.`,
      });
      await loadAssets();
      setChartCurrency('EUR');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import mislukt.';
      toast.error('Bolero-import mislukt', { description: message });
    } finally {
      setImportingBolero(false);
      if (boleroInputRef.current) boleroInputRef.current.value = '';
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="dashboard-shell max-w-7xl mx-auto space-y-4 animate-fade-in md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="hidden text-xs font-semibold uppercase tracking-[0.25em] text-secondary md:block">Vermogen cockpit</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Beursportfolio</h1>
          <p className="text-muted-foreground mt-1">Portefeuillewaarde, rendement en posities meteen zichtbaar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {currencyGroups.length > 1 && (
            <Select value={chartCurrency} onValueChange={setChartCurrency}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currencyGroups.map((group) => <SelectItem key={group.currency} value={group.currency}>{group.currency}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} className="w-40" />
          <Button variant="outline" onClick={refreshMarketData} disabled={marketLoading || assets.length === 0}>
            {marketLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Ververs
          </Button>
          <input
            ref={boleroInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBoleroFile(file);
            }}
          />
          <Button variant="outline" onClick={() => boleroInputRef.current?.click()} disabled={importingBolero}>
            {importingBolero ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Bolero import
          </Button>
        </div>
      </div>

      <section className="dashboard-hero">
        <div className="dashboard-hero-main wealth-hero">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-foreground/75">Totale waarde in EUR</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-primary-foreground md:text-5xl">{money(eurTotals.value, 'EUR')}</p>
              <p className={`mt-2 text-sm ${eurTotals.gain >= 0 ? 'text-emerald-100' : 'text-red-100'}`}>
                Resultaat {money(eurTotals.gain, 'EUR')} ({pct(totalReturnPct)})
              </p>
            </div>
            <div className="hidden rounded-2xl bg-white/10 p-3 text-primary-foreground shadow-inner md:block">
              <PieChart className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-3">
            <div className="dashboard-hero-pill">
              <span>Ingelegd</span>
              <strong>{money(eurTotals.cost, 'EUR')}</strong>
            </div>
            <div className="dashboard-hero-pill">
              <span>Op datum</span>
              <strong>{money(eurValueAtDate, 'EUR')}</strong>
            </div>
            <div className="dashboard-hero-pill">
              <span>Posities</span>
              <strong>{assets.length}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-hero-side">
          <div className="dashboard-insight-card">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4 text-secondary" />
              Toppositie
            </div>
            <p className="mt-2 text-2xl font-semibold">{topHolding?.asset.symbol || '-'}</p>
            <p className="text-xs text-muted-foreground">{topHolding ? `${topHolding.allocation.toFixed(1)}% allocatie` : 'Nog geen actuele waarde'}</p>
          </div>
          <div className="dashboard-insight-card">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {totalReturnPct >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
              Rendement
            </div>
            <p className={`mt-2 text-2xl font-semibold ${totalReturnPct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{pct(totalReturnPct)}</p>
            <p className="text-xs text-muted-foreground">{money(eurTotals.gain, 'EUR')} totaal</p>
          </div>
          <div className="dashboard-insight-card md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Beste performer</p>
                <p className="mt-1 text-2xl font-semibold">{bestPerformer?.asset.symbol || '-'}</p>
                <p className="text-xs text-muted-foreground">{bestPerformer ? `${bestPerformer.name} · ${pct(bestPerformer.gainPct)}` : 'Nog geen koersdata'}</p>
              </div>
              <div className="rounded-xl bg-secondary/10 px-3 py-2 text-right text-xs text-muted-foreground">
                ECB{fxUpdated ? ` · ${fxUpdated}` : ''}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {currencyGroups.length === 0 ? (
          <MetricCard title="Portefeuillewaarde" value="-" sub="Nog geen posities" />
        ) : currencyGroups.map((group) => (
          <MetricCard
            key={group.currency}
            title={`Waarde ${group.currency}`}
            value={money(group.value, group.currency)}
            sub={`≈ ${money(toEur(group.value, group.currency), 'EUR')} · Resultaat ${money(group.gain, group.currency)} (${pct(group.cost ? (group.gain / group.cost) * 100 : 0)})`}
          />
        ))}
        <MetricCard title="Waarde op datum" value={money(valueAtDate, chartCurrency)} sub={`${valuationDate} · ${chartCurrency}`} />
        <MetricCard title="Aantal posities" value={String(assets.length)} sub={`${new Set(assets.map((asset) => asset.symbol)).size} unieke tickers`} />
      </div>

      <Card className="data-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Cumulatief verloop (EUR)</CardTitle>
          <span className="text-xs text-muted-foreground">Alle valuta's omgerekend met huidige ECB-koers</span>
        </CardHeader>
        <CardContent className="h-72">
          {eurHistory.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Geen historische data beschikbaar.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={eurHistory}>
                <defs>
                  <linearGradient id="portfolioEur" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={80} domain={[(min: number) => min - Math.max(Math.abs(min) * 0.01, 1), (max: number) => max + Math.max(Math.abs(max) * 0.01, 1)]} allowDataOverflow tickFormatter={(value) => compactMoney(Number(value))} />

                <Tooltip formatter={(value) => money(Number(value), 'EUR')} />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#portfolioEur)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>


      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <Card className="data-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Portefeuillewaarde</CardTitle>
            <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <TabsList>
                {rangeLabels.map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="h-80">
            {history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Geen historische koersdata beschikbaar.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="portfolioValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(174, 50%, 40%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(174, 50%, 40%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={80} domain={[(min: number) => min - Math.max(Math.abs(min) * 0.01, 1), (max: number) => max + Math.max(Math.abs(max) * 0.01, 1)]} allowDataOverflow tickFormatter={(value) => compactMoney(Number(value))} />
                  <Tooltip formatter={(value) => money(Number(value), chartCurrency)} />
                  <Area type="monotone" dataKey="value" stroke="hsl(174, 50%, 40%)" fill="url(#portfolioValue)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="data-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> {editingId ? 'Positie bewerken' : 'Positie toevoegen'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative space-y-2">
              <Label>Zoek ticker of naam</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="bv. IWDA, Apple, VUSA" className="pl-9" />
              </div>
              {searching && <div className="text-xs text-muted-foreground">Zoeken...</div>}
              {results.length > 0 && (
                <div className="absolute z-20 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-auto">
                  {results.map((result) => (
                    <button key={`${result.symbol}-${result.description}`} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => selectSymbol(result)}>
                      <span className="font-medium">{result.displaySymbol || result.symbol}</span>
                      <span className="text-muted-foreground"> · {result.description || result.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Ticker" value={form.symbol} onChange={(value) => setForm({ ...form, symbol: value.toUpperCase() })} />
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.asset_type} onValueChange={(value) => setForm({ ...form, asset_type: value as AssetType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="etf">ETF</SelectItem>
                    <SelectItem value="stock">Aandeel</SelectItem>
                    <SelectItem value="fund">Fonds</SelectItem>
                    <SelectItem value="bond">Obligatie</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="other">Andere</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Field label="Naam" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Aankoopdatum" type="date" value={form.purchase_date} onChange={(value) => setForm({ ...form, purchase_date: value })} />
              <Field label="Valuta" value={form.currency} onChange={(value) => setForm({ ...form, currency: value.toUpperCase() })} />
              <Field label="Aantal" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
              <Field label="Aankoopprijs" type="number" value={form.purchase_price} onChange={(value) => setForm({ ...form, purchase_price: value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Beurs" value={form.exchange} onChange={(value) => setForm({ ...form, exchange: value })} />
              <Field label="MIC" value={form.mic} onChange={(value) => setForm({ ...form, mic: value })} />
            </div>
            <Field label="Notitie" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
            <div className="flex gap-2">
              <Button onClick={saveAsset} disabled={saving} className="flex-1">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'Bijwerken' : 'Toevoegen'}
              </Button>
              {editingId && <Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); setQuery(''); }}>Annuleer</Button>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="data-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Naam</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Aantal</TableHead>
                  <TableHead className="text-right">Aankoop</TableHead>
                  <TableHead className="text-right">Koers</TableHead>
                  <TableHead className="text-right">Waarde</TableHead>
                  <TableHead className="text-right">Resultaat</TableHead>
                  <TableHead className="text-right">Marktinfo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolioRows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">Nog geen posities toegevoegd.</TableCell></TableRow>
                ) : portfolioRows.map((row) => (
                  <TableRow key={row.asset.id} className="align-top">
                    <TableCell className="min-w-40">
                      <div className="font-semibold">{row.asset.symbol}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.exchange || row.asset.mic || 'Beurs onbekend'} · {row.quoteCurrency}</div>
                      {row.isBoleroSnapshot && <div className="mt-1 text-xs font-medium text-secondary">Bolero snapshot</div>}
                    </TableCell>
                    <TableCell className="min-w-80">
                      <div className="font-medium">{row.name}</div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <InfoLine icon={<Building2 className="h-3.5 w-3.5" />} value={row.industry || row.asset.asset_type.toUpperCase()} />
                        <InfoLine icon={<Clock3 className="h-3.5 w-3.5" />} value={row.updatedAt ? `Update ${row.updatedAt}` : 'Geen update'} />
                      </div>
                      {row.website && (
                        <a
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          href={row.website}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Website <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">{row.asset.asset_type}</TableCell>
                    <TableCell className="text-right">{row.asset.quantity.toLocaleString('nl-BE')}</TableCell>
                    <TableCell className="text-right">
                      <div>{money(row.cost, row.asset.currency)}</div>
                      <div className="text-xs text-muted-foreground">{money(row.asset.purchase_price, row.asset.currency)} / stuk</div>
                    </TableCell>
                    <TableCell className="min-w-52 text-right">
                      <div className="font-semibold">{row.currentPrice ? money(row.currentPrice, row.quoteCurrency) : '-'}</div>
                      <div className={`text-xs ${row.dayChange >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {row.currentPrice && !row.isBoleroSnapshot ? `${money(row.dayChangeAmount, row.quoteCurrency)} (${pct(row.dayChange)}) vandaag` : row.isBoleroSnapshot ? 'Waarde uit import' : 'Geen koers'}
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        <span>Open {row.open ? money(row.open, row.quoteCurrency) : '-'}</span>
                        <span>Vorige slot {row.previousClose ? money(row.previousClose, row.quoteCurrency) : '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>{row.currentValue ? money(row.currentValue, row.quoteCurrency) : '-'}</div>
                      <div className="text-xs text-muted-foreground">{row.allocation ? `${row.allocation.toFixed(1)}% allocatie` : '-'}</div>
                    </TableCell>
                    <TableCell className={`text-right ${row.gain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      <div>{row.currentValue ? money(row.gain, row.quoteCurrency) : '-'}</div>
                      <div className="text-xs">{row.currentValue ? pct(row.gainPct) : '-'}</div>
                    </TableCell>
                    <TableCell className="min-w-72 text-right">
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <InfoLine align="right" icon={<Activity className="h-3.5 w-3.5" />} value={`Dag ${rangeText(row.dayLow, row.dayHigh, row.quoteCurrency)}`} />
                        <InfoLine align="right" icon={<BarChart3 className="h-3.5 w-3.5" />} value={`52w ${rangeText(row.weekLow, row.weekHigh, row.quoteCurrency)}`} />
                        <div>Volume {row.volume ? compactNumber(row.volume) : '-'}</div>
                        <div>Gem. volume {row.averageVolume ? compactNumber(row.averageVolume) : '-'}</div>
                        <div>Market cap {row.marketCap ? `${compactMoney(row.marketCap)} ${row.quoteCurrency}` : '-'}</div>
                        <div>P/E {row.pe ? row.pe.toFixed(2) : '-'}</div>
                        <div>Dividend {row.dividendYield ? `${row.dividendYield.toFixed(2)}%` : '-'}</div>
                        <div>Beta {row.beta ? row.beta.toFixed(2) : '-'}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => editAsset(row.asset)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAsset(row.asset.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function parseBoleroWorkbook(workbook: any, XLSX: any): BoleroPosition[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as string[][];
  const headerIdx = table.findIndex((row) => row.some((cell) => normalizeHeader(String(cell)) === 'portfoliopositions'));
  const columnIdx = table.findIndex((row, idx) =>
    idx > headerIdx &&
    row.some((cell) => normalizeHeader(String(cell)) === 'isin') &&
    row.some((cell) => normalizeHeader(String(cell)) === 'huidigewaarde')
  );
  if (columnIdx < 0) return [];

  const header = table[columnIdx].map((cell) => normalizeHeader(String(cell)));
  const idx = (name: string) => header.findIndex((h) => h === normalizeHeader(name));
  const typeIdx = idx('Type');
  const currencyIdx = idx('Munt');
  const quantityIdx = idx('Aantal');
  const nameIdx = idx('Naam');
  const avgIdx = idx('Gem. aankoopkoers');
  const purchaseIdx = idx('Totale aankoopwaarde');
  const quoteIdx = idx('Koers');
  const currentIdx = idx('Huidige waarde');
  const eurIdx = idx('Waarde in EUR');
  const returnPctIdx = idx('Rendement %');
  const marketIdx = idx('Markt');
  const returnValueIdx = idx('Rendement ( in munt)');
  const isinIdx = idx('ISIN');

  return table.slice(columnIdx + 1)
    .map((row) => ({
      type: String(row[typeIdx] || '').trim(),
      currency: String(row[currencyIdx] || 'EUR').trim() || 'EUR',
      quantity: parseBoleroNumber(row[quantityIdx]),
      name: String(row[nameIdx] || '').trim(),
      avgPrice: parseBoleroNumber(row[avgIdx]),
      purchaseValue: parseBoleroNumber(row[purchaseIdx]),
      currentQuote: parseBoleroNumber(row[quoteIdx]),
      currentValue: parseBoleroNumber(row[currentIdx]),
      eurValue: parseBoleroNumber(row[eurIdx]),
      returnPct: parseBoleroNumber(row[returnPctIdx]),
      market: String(row[marketIdx] || '').trim(),
      returnValue: parseBoleroNumber(row[returnValueIdx]),
      isin: String(row[isinIdx] || '').trim(),
    }))
    .filter((row) => {
      const type = row.type.toLowerCase();
      if (!type || type.startsWith('bolero') || type.startsWith('mail') || type.startsWith('web')) return false;
      return row.eurValue !== 0 || row.currentValue !== 0 || row.quantity > 0 || type === 'cash';
    });
}

function boleroPositionToAsset(position: BoleroPosition, userId: string, fileName: string) {
  const isCash = position.type.toLowerCase() === 'cash';
  const quantity = isCash ? Math.max(Math.abs(position.eurValue || position.currentValue), 0.01) : Math.max(position.quantity, 0.0001);
  const eurValue = Math.abs(position.eurValue || position.currentValue || position.purchaseValue);
  const snapshotPrice = isCash ? 1 : eurValue / quantity;
  const symbol = boleroSymbol(position);
  return {
    user_id: userId,
    symbol,
    name: isCash ? `Bolero cash ${position.currency || 'EUR'}` : position.name || symbol,
    asset_type: boleroAssetType(position.type),
    exchange: position.market || null,
    mic: null,
    currency: 'EUR',
    purchase_date: new Date().toISOString().slice(0, 10),
    quantity,
    purchase_price: snapshotPrice,
    notes: `Bolero Expert snapshot ${fileName}; ISIN ${position.isin || 'n.v.t.'}; originele munt ${position.currency || 'EUR'}; rendement ${position.returnPct || 0}%; originele koers ${position.currentQuote || position.currentValue || 0}.`,
  };
}

function boleroSymbol(position: BoleroPosition) {
  if (position.isin) return position.isin.toUpperCase();
  if (position.type.toLowerCase() === 'cash') return `CASH-${position.currency || 'EUR'}`;
  return (position.name || 'BOLERO')
    .slice(0, 20)
    .replace(/[^A-Z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function boleroAssetType(type: string): AssetType {
  const value = type.toLowerCase();
  if (value.includes('etf')) return 'etf';
  if (value.includes('fonds')) return 'fund';
  if (value.includes('oblig')) return 'bond';
  if (value.includes('aandeel') || value.includes('stock')) return 'stock';
  if (value.includes('crypto')) return 'crypto';
  return 'other';
}

function parseBoleroNumber(value: unknown) {
  const text = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\d,.\-]/g, '')
    .trim();
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(header: string) {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function InfoLine({ icon, value, align = 'left' }: { icon: JSX.Element; value: string; align?: 'left' | 'right' }) {
  return (
    <span className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
      {icon}
      {value}
    </span>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} step={type === 'number' ? '0.0001' : undefined} />
    </div>
  );
}

function MetricCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card className="data-card transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

function normalizeAsset(asset: any): PortfolioAsset {
  return {
    ...asset,
    quantity: Number(asset.quantity) || 0,
    purchase_price: Number(asset.purchase_price) || 0,
  };
}

function inferAssetType(type: string | undefined): AssetType {
  const value = String(type || '').toLowerCase();
  if (value.includes('etf')) return 'etf';
  if (value.includes('fund')) return 'fund';
  if (value.includes('crypto')) return 'crypto';
  return 'stock';
}

function getRange(range: RangeKey): { from: number; to: number; interval: string } {
  const to = Math.floor(Date.now() / 1000);
  const now = new Date();
  const fromDate = new Date(now);
  let interval = '1d';
  if (range === '1D') {
    fromDate.setDate(now.getDate() - 1);
    interval = '5m';
    return { from: Math.floor(fromDate.getTime() / 1000), to, interval };
  }
  if (range === '1W') fromDate.setDate(now.getDate() - 7);
  if (range === '1M') fromDate.setMonth(now.getMonth() - 1);
  if (range === '6M') fromDate.setMonth(now.getMonth() - 6);
  if (range === '1Y') fromDate.setFullYear(now.getFullYear() - 1);
  if (range === 'YTD') fromDate.setMonth(0, 1);
  fromDate.setHours(0, 0, 0, 0);
  return { from: Math.floor(fromDate.getTime() / 1000), to, interval };
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 2 }).format(value || 0);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function pct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function rangeText(low: number, high: number, currency: string) {
  if (!low || !high) return '-';
  return `${money(low, currency)} - ${money(high, currency)}`;
}
