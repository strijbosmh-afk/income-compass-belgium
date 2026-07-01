import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Pencil, Plus, RefreshCw, Search, Trash2, TrendingUp, Wallet } from 'lucide-react';
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
  pc?: number;
  t?: number;
};

type QuoteEntry = {
  symbol: string;
  quote: MarketQuote;
  profile?: {
    currency?: string;
    exchange?: string;
    name?: string;
    ticker?: string;
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
    loadAssets();
  }, [user]);

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
  }, [assets, range, chartCurrency]);

  const currencyGroups = useMemo(() => {
    const groups = new Map<string, { cost: number; value: number; gain: number }>();
    for (const asset of assets) {
      const quote = quotes[asset.symbol]?.quote;
      const current = Number(quote?.c || 0);
      const cost = asset.quantity * asset.purchase_price;
      const value = current > 0 ? asset.quantity * current : 0;
      const prev = groups.get(asset.currency) || { cost: 0, value: 0, gain: 0 };
      groups.set(asset.currency, { cost: prev.cost + cost, value: prev.value + value, gain: prev.gain + value - cost });
    }
    return Array.from(groups.entries()).map(([currency, totals]) => ({ currency, ...totals }));
  }, [assets, quotes]);

  useEffect(() => {
    if (currencyGroups.length > 0 && !currencyGroups.some((group) => group.currency === chartCurrency)) {
      setChartCurrency(currencyGroups[0].currency);
    }
  }, [currencyGroups, chartCurrency]);

  const portfolioRows = useMemo(() => assets.map((asset) => {
    const quote = quotes[asset.symbol]?.quote;
    const currentPrice = Number(quote?.c || 0);
    const previousClose = Number(quote?.pc || 0);
    const cost = asset.quantity * asset.purchase_price;
    const currentValue = currentPrice > 0 ? asset.quantity * currentPrice : 0;
    const gain = currentValue - cost;
    const dayChange = currentPrice > 0 && previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
    return { asset, currentPrice, cost, currentValue, gain, dayChange };
  }), [assets, quotes]);

  const valueAtDate = useMemo(() => {
    if (history.length === 0) return currencyGroups.find((group) => group.currency === chartCurrency)?.value || 0;
    const target = history.filter((point) => point.date <= valuationDate).at(-1);
    return target?.value ?? 0;
  }, [history, valuationDate, currencyGroups, chartCurrency]);

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
    const chartAssets = assets.filter((asset) => asset.currency === chartCurrency);
    for (const asset of chartAssets) {
      const symbolSeries = series.find((item) => item.symbol === asset.symbol)?.points || [];
      for (const point of symbolSeries) {
        if (point.date < asset.purchase_date || point.close <= 0) continue;
        byDate.set(point.date, (byDate.get(point.date) || 0) + point.close * asset.quantity);
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aandelen</h1>
          <p className="text-muted-foreground mt-1">Beheer aandelen, ETF's en andere beursgenoteerde posities.</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {currencyGroups.length === 0 ? (
          <MetricCard title="Portefeuillewaarde" value="-" sub="Nog geen posities" />
        ) : currencyGroups.map((group) => (
          <MetricCard
            key={group.currency}
            title={`Waarde ${group.currency}`}
            value={money(group.value, group.currency)}
            sub={`Resultaat ${money(group.gain, group.currency)} (${pct(group.cost ? (group.gain / group.cost) * 100 : 0)})`}
          />
        ))}
        <MetricCard title="Waarde op datum" value={money(valueAtDate, chartCurrency)} sub={`${valuationDate} · ${chartCurrency}`} />
        <MetricCard title="Aantal posities" value={String(assets.length)} sub={`${new Set(assets.map((asset) => asset.symbol)).size} unieke tickers`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <Card className="border-border/50">
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
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => compactMoney(Number(value))} />
                  <Tooltip formatter={(value) => money(Number(value), chartCurrency)} />
                  <Area type="monotone" dataKey="value" stroke="hsl(174, 50%, 40%)" fill="url(#portfolioValue)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
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

      <Card className="border-border/50">
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
                  <TableHead className="text-right">Dag</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolioRows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">Nog geen posities toegevoegd.</TableCell></TableRow>
                ) : portfolioRows.map(({ asset, currentPrice, cost, currentValue, gain, dayChange }) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.symbol}</TableCell>
                    <TableCell>{asset.name}</TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">{asset.asset_type}</TableCell>
                    <TableCell className="text-right">{asset.quantity.toLocaleString('nl-BE')}</TableCell>
                    <TableCell className="text-right">{money(cost, asset.currency)}</TableCell>
                    <TableCell className="text-right">{currentPrice ? money(currentPrice, asset.currency) : '-'}</TableCell>
                    <TableCell className="text-right">{currentValue ? money(currentValue, asset.currency) : '-'}</TableCell>
                    <TableCell className={`text-right ${gain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{currentValue ? money(gain, asset.currency) : '-'}</TableCell>
                    <TableCell className={`text-right ${dayChange >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{currentPrice ? pct(dayChange) : '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => editAsset(asset)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAsset(asset.id)}><Trash2 className="h-4 w-4" /></Button>
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
    <Card className="border-border/50">
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

function money(value: number, currency: string) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 2 }).format(value || 0);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function pct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
