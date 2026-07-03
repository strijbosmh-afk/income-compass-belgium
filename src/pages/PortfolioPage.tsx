import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  DollarSign,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

type AssetType = 'stock' | 'etf' | 'fund' | 'bond' | 'crypto' | 'other';
type RangeKey = '1W' | '1M' | '6M' | 'YTD' | '1Y';

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

type MarketMetric = Record<string, number | string | null | undefined>;

type QuoteEntry = {
  symbol: string;
  quote: MarketQuote;
  metric?: MarketMetric;
  profile?: {
    currency?: string;
    exchange?: string;
    finnhubIndustry?: string;
    logo?: string;
    marketCapitalization?: number;
    name?: string;
    ticker?: string;
    weburl?: string;
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

type PortfolioRow = {
  asset: PortfolioAsset;
  quote?: QuoteEntry;
  currentPrice: number;
  previousClose: number;
  cost: number;
  currentValue: number;
  gain: number;
  gainPct: number;
  dayChange: number;
  dayChangePct: number;
  allocation: number;
  costEur: number;
  currentValueEur: number;
  gainEur: number;
  fxRateToEur: number;
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

const rangeLabels: RangeKey[] = ['1W', '1M', '6M', 'YTD', '1Y'];

export default function PortfolioPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteEntry>>({});
  const [fxRates, setFxRates] = useState<Record<string, number>>({ EUR: 1 });
  const [history, setHistory] = useState<{ date: string; value: number }[]>([]);
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

  useEffect(() => {
    if (!user) return;
    void loadAssets();
  }, [user]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (query.trim().length >= 2) void searchSymbols(query);
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
    void refreshMarketData();
  }, [assets, range, chartCurrency]);

  const currencyGroups = useMemo(() => {
    const groups = new Map<string, { cost: number; value: number; gain: number }>();
    for (const asset of assets) {
      const quote = quotes[asset.symbol]?.quote;
      const current = Number(quote?.c || 0);
      const cost = asset.quantity * asset.purchase_price;
      const value = current > 0 ? asset.quantity * current : cost;
      const prev = groups.get(asset.currency) || { cost: 0, value: 0, gain: 0 };
      groups.set(asset.currency, { cost: prev.cost + cost, value: prev.value + value, gain: prev.gain + value - cost });
    }
    return Array.from(groups.entries()).map(([currency, totals]) => ({ currency, ...totals }));
  }, [assets, quotes]);

  const eurTotals = useMemo(() => {
    return assets.reduce((totals, asset) => {
      const quote = quotes[asset.symbol]?.quote;
      const current = Number(quote?.c || 0);
      const cost = asset.quantity * asset.purchase_price;
      const value = current > 0 ? asset.quantity * current : cost;
      const rate = fxRateToEur(asset.currency, fxRates);
      return {
        cost: totals.cost + cost * rate,
        value: totals.value + value * rate,
      };
    }, { cost: 0, value: 0 });
  }, [assets, quotes, fxRates]);

  const eurGain = eurTotals.value - eurTotals.cost;
  const eurGainPct = eurTotals.cost > 0 ? (eurGain / eurTotals.cost) * 100 : 0;

  useEffect(() => {
    if (currencyGroups.length > 0 && chartCurrency !== 'EUR' && !currencyGroups.some((group) => group.currency === chartCurrency)) {
      setChartCurrency(currencyGroups[0].currency);
    }
  }, [currencyGroups, chartCurrency]);

  const chartCurrencyOptions = useMemo(() => {
    return ['EUR', ...currencyGroups.map((group) => group.currency).filter((currency) => currency !== 'EUR')];
  }, [currencyGroups]);

  const portfolioRows = useMemo<PortfolioRow[]>(() => assets.map((asset) => {
    const quote = quotes[asset.symbol];
    const currentPrice = Number(quote?.quote?.c || 0);
    const previousClose = Number(quote?.quote?.pc || 0);
    const cost = asset.quantity * asset.purchase_price;
    const currentValue = currentPrice > 0 ? asset.quantity * currentPrice : cost;
    const gain = currentValue - cost;
    const dayChange = currentPrice > 0 && previousClose > 0 ? currentPrice - previousClose : 0;
    const dayChangePct = currentPrice > 0 && previousClose > 0 ? (dayChange / previousClose) * 100 : 0;
    const rate = fxRateToEur(asset.currency, fxRates);
    const currentValueEur = currentValue * rate;
    const costEur = cost * rate;
    const gainEur = currentValueEur - costEur;
    return {
      asset,
      quote,
      currentPrice,
      previousClose,
      cost,
      currentValue,
      gain,
      gainPct: cost > 0 ? (gain / cost) * 100 : 0,
      dayChange,
      dayChangePct,
      allocation: eurTotals.value > 0 ? (currentValueEur / eurTotals.value) * 100 : 0,
      costEur,
      currentValueEur,
      gainEur,
      fxRateToEur: rate,
    };
  }), [assets, quotes, eurTotals.value, fxRates]);

  const valueAtDate = useMemo(() => {
    if (history.length === 0) return chartCurrency === 'EUR' ? eurTotals.value : currencyGroups.find((group) => group.currency === chartCurrency)?.value || 0;
    const target = history.filter((point) => point.date <= valuationDate).at(-1);
    return target?.value ?? 0;
  }, [history, valuationDate, currencyGroups, chartCurrency, eurTotals.value]);

  const latestUpdatedAt = useMemo(() => {
    const timestamps = Object.values(quotes).map((entry) => entry.quote.t).filter(Boolean) as number[];
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps) * 1000);
  }, [quotes]);

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

    const nextFxRates = await loadFxRates([...new Set(assets.map((asset) => asset.currency))]);
    setFxRates(nextFxRates);
    await loadHistory(symbols, nextFxRates);
    setMarketLoading(false);
  }

  async function loadFxRates(currencies: string[]) {
    const normalized = [...new Set(currencies.map((currency) => currency.toUpperCase()))];
    if (normalized.length === 0 || normalized.every((currency) => currency === 'EUR')) return { EUR: 1 };
    const { data, error } = await supabase.functions.invoke('market-data', {
      body: { action: 'fx-rates', currencies: normalized },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Wisselkoersen ophalen mislukt');
      return { EUR: 1 };
    }
    return { EUR: 1, ...(data.rates || {}) } as Record<string, number>;
  }

  async function loadHistory(symbols: string[], rates = fxRates) {
    const { from, to } = getRange(range);
    const series = await Promise.all(symbols.map(async (symbol) => {
      const { data } = await supabase.functions.invoke('market-data', {
        body: { action: 'candles', symbol, from, to },
      });
      if (!data || data.s !== 'ok') return { symbol, points: [] as { date: string; close: number }[] };
      const points = (data.t || []).map((ts: number, idx: number) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        close: Number(data.c?.[idx] || 0),
      }));
      return { symbol, points };
    }));

    const byDate = new Map<string, number>();
    const chartAssets = chartCurrency === 'EUR' ? assets : assets.filter((asset) => asset.currency === chartCurrency);
    for (const asset of chartAssets) {
      const symbolSeries = series.find((item) => item.symbol === asset.symbol)?.points || [];
      const rate = chartCurrency === 'EUR' ? fxRateToEur(asset.currency, rates) : 1;
      for (const point of symbolSeries) {
        if (point.date < asset.purchase_date || point.close <= 0) continue;
        byDate.set(point.date, (byDate.get(point.date) || 0) + point.close * asset.quantity * rate);
      }
    }
    setHistory(Array.from(byDate.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)));
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

    const queryBuilder = editingId
      ? (supabase as any).from('portfolio_assets').update(payload).eq('id', editingId)
      : (supabase as any).from('portfolio_assets').insert(payload);
    const { error } = await queryBuilder;
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? 'Positie bijgewerkt' : 'Positie toegevoegd');
    setForm(emptyForm);
    setQuery('');
    setEditingId(null);
    void loadAssets();
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
      void loadAssets();
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-5 md:space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/50 bg-gradient-to-br from-primary/15 via-card to-secondary/10 p-5 shadow-sm md:p-8">
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-secondary">
              <BarChart3 className="h-3.5 w-3.5" /> Beursportfolio
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Beursportfolio</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Volg je posities met koers, dagrange, rendement, allocatie en fundamentele context per aandeel of ETF.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {chartCurrencyOptions.length > 1 && (
              <Select value={chartCurrency} onValueChange={setChartCurrency}>
                <SelectTrigger className="min-h-12 rounded-2xl bg-card/70 sm:w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {chartCurrencyOptions.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} className="min-h-12 rounded-2xl bg-card/70 sm:w-40" />
            <Button variant="outline" onClick={refreshMarketData} disabled={marketLoading || assets.length === 0} className="min-h-12 rounded-2xl bg-card/70">
              {marketLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Ververs
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          title="Totaalwaarde EUR"
          value={money(eurTotals.value, 'EUR')}
          sub={`Resultaat ${money(eurGain, 'EUR')} (${pct(eurGainPct)}) · laatste FX-koersen`}
          icon={eurGain >= 0 ? TrendingUp : TrendingDown}
          tone={eurGain >= 0 ? 'positive' : 'negative'}
        />
        {currencyGroups.length === 0 ? (
          <MetricCard title="Portefeuillewaarde" value="-" sub="Nog geen posities" icon={Wallet} />
        ) : currencyGroups.map((group) => (
          <MetricCard
            key={group.currency}
            title={`Waarde ${group.currency}`}
            value={money(group.value, group.currency)}
            sub={`Resultaat ${money(group.gain, group.currency)} (${pct(group.cost ? (group.gain / group.cost) * 100 : 0)})`}
            icon={group.gain >= 0 ? TrendingUp : TrendingDown}
            tone={group.gain >= 0 ? 'positive' : 'negative'}
          />
        ))}
        <MetricCard title="Waarde op datum" value={money(valueAtDate, chartCurrency)} sub={`${valuationDate} · ${chartCurrency}`} icon={CalendarDays} />
        <MetricCard
          title="Koersstatus"
          value={marketLoading ? 'Bijwerken...' : `${assets.length} posities`}
          sub={latestUpdatedAt ? `Laatste marktupdate ${latestUpdatedAt.toLocaleString('nl-BE')}` : `${new Set(assets.map((asset) => asset.symbol)).size} unieke tickers`}
          icon={Activity}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <Card className="ios-card border-border/50">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Portefeuillewaarde</CardTitle>
            <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <TabsList>
                {rangeLabels.map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="h-80">
            {history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground">
                Geen historische koersdata beschikbaar. Voeg posities toe of ververs de koersen.
              </div>
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
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => compactMoney(Number(value))} />
                  <Tooltip formatter={(value) => money(Number(value), chartCurrency)} />
                  <Area type="monotone" dataKey="value" stroke="hsl(174, 50%, 40%)" fill="url(#portfolioValue)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="ios-card border-border/50">
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

      <Card className="ios-card border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Gevolgde posities</CardTitle>
        </CardHeader>
        <CardContent>
          {portfolioRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <Wallet className="mx-auto h-9 w-9 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-semibold">Nog geen posities</h2>
              <p className="mt-1 text-sm text-muted-foreground">Voeg een aandeel of ETF toe om koersdetails en allocatie te volgen.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {portfolioRows.map((row) => <PositionCard key={row.asset.id} row={row} onEdit={editAsset} onDelete={deleteAsset} />)}
              </div>

              <div className="mt-6 hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Naam</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Allocatie</TableHead>
                      <TableHead className="text-right">Aantal</TableHead>
                      <TableHead className="text-right">Aankoop</TableHead>
                      <TableHead className="text-right">Koers</TableHead>
                      <TableHead className="text-right">Dag</TableHead>
                      <TableHead className="text-right">Waarde</TableHead>
                      <TableHead className="text-right">Resultaat</TableHead>
                      <TableHead className="text-right">Waarde EUR</TableHead>
                      <TableHead className="text-right">Resultaat EUR</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolioRows.map((row) => (
                      <TableRow key={row.asset.id}>
                        <TableCell className="font-medium">{row.asset.symbol}</TableCell>
                        <TableCell>{row.asset.name}</TableCell>
                        <TableCell className="uppercase text-xs text-muted-foreground">{row.asset.asset_type}</TableCell>
                        <TableCell className="text-right">{row.allocation.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{row.asset.quantity.toLocaleString('nl-BE')}</TableCell>
                        <TableCell className="text-right">{money(row.cost, row.asset.currency)}</TableCell>
                        <TableCell className="text-right">{row.currentPrice ? money(row.currentPrice, row.asset.currency) : '-'}</TableCell>
                        <TableCell className={`text-right ${row.dayChangePct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{row.currentPrice ? pct(row.dayChangePct) : '-'}</TableCell>
                        <TableCell className="text-right">{money(row.currentValue, row.asset.currency)}</TableCell>
                        <TableCell className={`text-right ${row.gain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{money(row.gain, row.asset.currency)} · {pct(row.gainPct)}</TableCell>
                        <TableCell className="text-right">{money(row.currentValueEur, 'EUR')}</TableCell>
                        <TableCell className={`text-right ${row.gainEur >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{money(row.gainEur, 'EUR')}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => editAsset(row.asset)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAsset(row.asset.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PositionCard({ row, onEdit, onDelete }: { row: PortfolioRow; onEdit: (asset: PortfolioAsset) => void; onDelete: (id: string) => void }) {
  const { asset, quote, currentPrice, currentValue, cost, gain, gainPct, dayChange, dayChangePct, allocation, currentValueEur, gainEur, fxRateToEur } = row;
  const metric = quote?.metric || {};
  const profile = quote?.profile;
  const currency = asset.currency;
  const high52 = metricNumber(metric, '52WeekHigh');
  const low52 = metricNumber(metric, '52WeekLow');
  const pe = firstMetric(metric, ['peBasicExclExtraTTM', 'peNormalizedAnnual', 'peTTM']);
  const dividendYield = firstMetric(metric, ['dividendYieldIndicatedAnnual', 'currentDividendYieldTTM']);
  const beta = metricNumber(metric, 'beta');
  const avgVolume = firstMetric(metric, ['10DayAverageTradingVolume', '3MonthAverageTradingVolume']);
  const marketCap = Number(profile?.marketCapitalization || metricNumber(metric, 'marketCapitalization') || 0);
  const positive = gain >= 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{asset.symbol}</h3>
            <Badge variant="outline" className="uppercase">{asset.asset_type}</Badge>
            {profile?.exchange && <Badge variant="secondary">{profile.exchange}</Badge>}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{profile?.name || asset.name}</p>
          {profile?.finnhubIndustry && <p className="mt-1 text-xs text-muted-foreground">{profile.finnhubIndustry}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {profile?.weburl && (
            <Button variant="ghost" size="icon" onClick={() => window.open(profile.weburl, '_blank')}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onEdit(asset)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(asset.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Laatste koers</div>
          <div className="mt-1 text-2xl font-semibold font-mono">{currentPrice ? money(currentPrice, currency) : 'Geen koers'}</div>
        </div>
        <div className={`text-right text-sm font-semibold ${dayChangePct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
          {currentPrice ? `${money(dayChange, currency)} · ${pct(dayChangePct)}` : '-'}
          <div className="text-xs font-normal text-muted-foreground">vandaag</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <InfoTile label="Waarde" value={money(currentValue, currency)} strong />
        <InfoTile label="Resultaat" value={`${money(gain, currency)} · ${pct(gainPct)}`} tone={positive ? 'positive' : 'negative'} />
        <InfoTile label="Allocatie" value={`${allocation.toFixed(1)}%`} />
        <InfoTile label="Aantal" value={asset.quantity.toLocaleString('nl-BE')} />
      </div>

      {asset.currency !== 'EUR' && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <InfoTile label="Waarde in EUR" value={money(currentValueEur, 'EUR')} strong />
          <InfoTile label="Resultaat in EUR" value={money(gainEur, 'EUR')} tone={gainEur >= 0 ? 'positive' : 'negative'} />
          <InfoTile label={`FX ${asset.currency}/EUR`} value={fxRateToEur ? fxRateToEur.toFixed(4) : '-'} />
          <InfoTile label="EUR-allocatie" value={`${allocation.toFixed(1)}%`} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        <InfoTile label="Aankoopwaarde" value={money(cost, currency)} />
        <InfoTile label="Open / vorige slot" value={`${priceOrDash(quote?.quote.o, currency)} / ${priceOrDash(quote?.quote.pc, currency)}`} />
        <InfoTile label="Dagrange" value={`${priceOrDash(quote?.quote.l, currency)} - ${priceOrDash(quote?.quote.h, currency)}`} />
        <InfoTile label="52 weken" value={high52 && low52 ? `${priceOrDash(low52, currency)} - ${priceOrDash(high52, currency)}` : '-'} />
        <InfoTile label="P/E" value={pe ? pe.toFixed(2) : '-'} />
        <InfoTile label="Dividendrendement" value={dividendYield ? `${dividendYield.toFixed(2)}%` : '-'} />
        <InfoTile label="Market cap" value={marketCap ? compactMarketCap(marketCap, profile?.currency || currency) : '-'} icon={Building2} />
        <InfoTile label="Beta" value={beta ? beta.toFixed(2) : '-'} icon={Activity} />
        <InfoTile label="Gem. volume" value={avgVolume ? compactNumber(avgVolume) : '-'} icon={DollarSign} />
      </div>

      {asset.notes && <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{asset.notes}</p>}
    </div>
  );
}

function InfoTile({ label, value, tone, strong, icon: Icon }: { label: string; value: string; tone?: 'positive' | 'negative'; strong?: boolean; icon?: typeof Activity }) {
  return (
    <div className="rounded-xl bg-muted/45 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={`mt-1 break-words font-mono ${strong ? 'font-semibold' : 'font-medium'} ${tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-destructive' : ''}`}>{value}</div>
    </div>
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

function MetricCard({ title, value, sub, icon: Icon, tone }: { title: string; value: string; sub: string; icon: typeof Wallet; tone?: 'positive' | 'negative' }) {
  return (
    <Card className="ios-card border-border/50">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold mt-1 font-mono">{value}</p>
            <p className={`text-xs mt-1 ${tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-destructive' : 'text-muted-foreground'}`}>{sub}</p>
          </div>
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
        </div>
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

function getRange(range: RangeKey) {
  const to = Math.floor(Date.now() / 1000);
  const now = new Date();
  const fromDate = new Date(now);
  if (range === '1W') fromDate.setDate(now.getDate() - 7);
  if (range === '1M') fromDate.setMonth(now.getMonth() - 1);
  if (range === '6M') fromDate.setMonth(now.getMonth() - 6);
  if (range === '1Y') fromDate.setFullYear(now.getFullYear() - 1);
  if (range === 'YTD') fromDate.setMonth(0, 1);
  fromDate.setHours(0, 0, 0, 0);
  return { from: Math.floor(fromDate.getTime() / 1000), to };
}

function metricNumber(metric: MarketMetric, key: string) {
  const value = Number(metric[key]);
  return Number.isFinite(value) && value !== 0 ? value : null;
}

function firstMetric(metric: MarketMetric, keys: string[]) {
  for (const key of keys) {
    const value = metricNumber(metric, key);
    if (value !== null) return value;
  }
  return null;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 2 }).format(value || 0);
}

function priceOrDash(value: number | undefined | null, currency: string) {
  const number = Number(value || 0);
  return number > 0 ? money(number, currency) : '-';
}

function compactMoney(value: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function compactMarketCap(value: number, currency: string) {
  const normalized = value < 1_000_000 ? value * 1_000_000 : value;
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(normalized);
}

function fxRateToEur(currency: string, rates: Record<string, number>) {
  const normalized = currency.toUpperCase();
  if (normalized === 'EUR') return 1;
  const rate = Number(rates[normalized] || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function pct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
