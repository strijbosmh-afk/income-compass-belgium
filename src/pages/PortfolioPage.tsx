import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, AlertTriangle, BarChart3, Building2, Clock3, ExternalLink, FileSpreadsheet, Flame, Landmark, Loader2, Pencil, PieChart as PieIcon, Plus, RefreshCw, Search, ShieldCheck, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

type AllocationDatum = {
  name: string;
  value: number;
  percentage: number;
};

type CashAccount = 'private' | 'bvba';

type CashFormState = {
  account: CashAccount;
  amount: string;
  snapshot_date: string;
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

const emptyCashForm = (): CashFormState => ({
  account: 'private',
  amount: '',
  snapshot_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

const rangeLabels: RangeKey[] = ['1D', '1W', '1M', '6M', 'YTD', '1Y'];
const COLORS = ['#2f9e91', '#1d4f7a', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#64748b', '#ec4899'];
const assetTypeLabels: Record<AssetType, string> = {
  stock: 'Individuele aandelen',
  etf: 'Aandelen-ETF',
  fund: 'Fondsen',
  bond: 'Obligaties',
  crypto: 'Crypto',
  other: 'Cash/andere',
};

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
  const [savingCash, setSavingCash] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [cashForm, setCashForm] = useState<CashFormState>(emptyCashForm);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [range, setRange] = useState<RangeKey>('1M');
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().slice(0, 10));
  const [chartCurrency, setChartCurrency] = useState('EUR');
  const [importingBolero, setImportingBolero] = useState(false);
  const [pensionTotal, setPensionTotal] = useState(0);
  const [pensionSnapshotDate, setPensionSnapshotDate] = useState('');
  const [monthlyNetIncome, setMonthlyNetIncome] = useState(0);
  const [incomeWindowLabel, setIncomeWindowLabel] = useState('');
  const [section, setSection] = useState('cockpit');
  const boleroInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    loadAssets();
    loadFx();
    loadWealthContext();
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

  async function loadWealthContext() {
    if (!user) return;
    await Promise.all([loadIncomeContext(), loadPensionContext()]);
  }

  async function loadIncomeContext() {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from('income_records')
      .select('record_date, netto')
      .eq('user_id', user.id)
      .order('record_date', { ascending: false })
      .limit(400);
    if (error || !data) return;

    const byMonth = new Map<string, number>();
    for (const row of data) {
      const key = String(row.record_date || '').slice(0, 7);
      if (!key) continue;
      byMonth.set(key, (byMonth.get(key) || 0) + Number(row.netto || 0));
    }
    const months = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
    if (months.length === 0) return;
    const average = months.reduce((sum, [, value]) => sum + value, 0) / months.length;
    setMonthlyNetIncome(average);
    setIncomeWindowLabel(`${months.at(-1)?.[0]} tot ${months[0]?.[0]}`);
  }

  async function loadPensionContext() {
    if (!user) return;
    const sources = [
      { table: 'pension_ipt_records', field: 'opgebouwde_reserve' },
      { table: 'vapz_records', field: 'pensioenreserve' },
      { table: 'vapz_riziv_records', field: 'pensioenreserve' },
      { table: 'pensioensparen_records', field: 'pensioenreserve' },
    ];
    const rows = await Promise.all(sources.map(async ({ table, field }) => {
      const { data } = await (supabase as any)
        .from(table)
        .select(`${field}, snapshot_date`)
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { value: Number(data[field] || 0), date: String(data.snapshot_date || '') } : null;
    }));
    const values = rows.filter(Boolean) as { value: number; date: string }[];
    setPensionTotal(values.reduce((sum, row) => sum + row.value, 0));
    setPensionSnapshotDate(values.map((row) => row.date).filter(Boolean).sort().at(-1) || '');
  }


  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (query.trim().length >= 2) searchSymbols(query);
      else setResults([]);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  const analysisAssets = useMemo(() => latestCashSnapshots(assets), [assets]);

  useEffect(() => {
    if (analysisAssets.length === 0) {
      setQuotes({});
      setHistory([]);
      return;
    }
    refreshMarketData();
    const handle = window.setInterval(() => {
      refreshMarketData();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(handle);
  }, [analysisAssets, range, chartCurrency]);

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
    for (const asset of analysisAssets) {
      if (isCashAsset(asset)) continue;
      const quote = quotes[asset.symbol]?.quote;
      const livePrice = Number(quote?.c || 0);
      const isBoleroSnapshot = Boolean(asset.notes?.includes('Bolero Expert snapshot'));
      const currentPrice = livePrice > 0 ? livePrice : (isBoleroSnapshot || isCashAsset(asset) ? asset.purchase_price : 0);
      const cost = asset.quantity * asset.purchase_price;
      const value = currentPrice > 0 ? asset.quantity * currentPrice : 0;
      const prev = groups.get(asset.currency) || { cost: 0, value: 0, gain: 0 };
      groups.set(asset.currency, { cost: prev.cost + cost, value: prev.value + value, gain: prev.gain + value - cost });
    }
    return Array.from(groups.entries()).map(([currency, totals]) => ({ currency, ...totals }));
  }, [analysisAssets, quotes]);

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

  const portfolioRows = useMemo(() => analysisAssets.map((asset) => {
    const quoteEntry = quotes[asset.symbol];
    const quote = quoteEntry?.quote;
    const profile = quoteEntry?.profile || {};
    const livePrice = Number(quote?.c || 0);
    const isBoleroSnapshot = Boolean(asset.notes?.includes('Bolero Expert snapshot'));
    const currentPrice = livePrice > 0 ? livePrice : (isBoleroSnapshot || isCashAsset(asset) ? asset.purchase_price : 0);
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
  }), [analysisAssets, quotes, eurTotals.value, toEur]);

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
  const cashValue = useMemo(() => portfolioRows
    .filter((row) => isCashAsset(row.asset))
    .reduce((sum, row) => sum + toEur(row.currentValue, row.quoteCurrency), 0), [portfolioRows, toEur]);
  const manualCashRows = useMemo(() => portfolioRows
    .filter((row) => isManualCashAsset(row.asset))
    .sort((a, b) => b.asset.purchase_date.localeCompare(a.asset.purchase_date)), [portfolioRows]);
  const privateCashValue = useMemo(() => manualCashRows
    .filter((row) => manualCashAccount(row.asset) === 'private')
    .reduce((sum, row) => sum + toEur(row.currentValue, row.quoteCurrency), 0), [manualCashRows, toEur]);
  const bvbaCashValue = useMemo(() => manualCashRows
    .filter((row) => manualCashAccount(row.asset) === 'bvba')
    .reduce((sum, row) => sum + toEur(row.currentValue, row.quoteCurrency), 0), [manualCashRows, toEur]);
  const debitValue = Math.min(0, cashValue);
  const investmentValue = Math.max(0, eurTotals.value);
  const netWorth = eurTotals.value + cashValue + pensionTotal;
  const bufferTarget = monthlyNetIncome > 0 ? monthlyNetIncome * 6 : 0;
  const bufferMonths = monthlyNetIncome > 0 ? cashValue / monthlyNetIncome : 0;
  const investableCash = Math.max(0, cashValue - bufferTarget);
  const monthlyCapacity = investableCash > 0 ? investableCash / 12 : 0;
  const fireTarget = monthlyNetIncome > 0 ? monthlyNetIncome * 12 * 25 : 0;
  const fireProgress = fireTarget > 0 ? Math.min((netWorth / fireTarget) * 100, 100) : 0;

  const allocationData = useMemo(() => groupRows(portfolioRows, (row) => assetTypeLabels[row.asset.asset_type] || row.asset.asset_type, toEur), [portfolioRows, toEur]);
  const brokerData = useMemo(() => groupRows(portfolioRows, (row) => inferBrokerFromAsset(row.asset), toEur), [portfolioRows, toEur]);
  const currencyData = useMemo(() => groupRows(portfolioRows, (row) => row.quoteCurrency || row.asset.currency || 'EUR', toEur), [portfolioRows, toEur]);
  const regionData = useMemo(() => groupRows(portfolioRows, (row) => inferRegion(row.exchange || row.asset.exchange || row.asset.mic || row.asset.notes || ''), toEur), [portfolioRows, toEur]);
  const sectorData = useMemo(() => groupRows(portfolioRows, (row) => row.industry || assetTypeLabels[row.asset.asset_type] || 'Onbekend', toEur), [portfolioRows, toEur]);

  const riskItems = useMemo(() => buildRiskItems({
    rows: portfolioRows,
    cashValue,
    bufferMonths,
    monthlyNetIncome,
    currencyData,
  }), [portfolioRows, cashValue, bufferMonths, monthlyNetIncome, currencyData]);

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
    const symbols = [...new Set(analysisAssets.filter((asset) => !isCashAsset(asset)).map((asset) => asset.symbol))];
    if (symbols.length === 0) {
      const cashAssets = analysisAssets.filter((asset) => isCashAsset(asset));
      const cashDate = cashAssets.map((asset) => asset.purchase_date).sort().at(-1) || new Date().toISOString().slice(0, 10);
      const chartCashValue = cashAssets
        .filter((asset) => asset.currency === chartCurrency)
        .reduce((sum, asset) => sum + asset.quantity * asset.purchase_price, 0);
      const eurCashValue = cashAssets.reduce((sum, asset) => sum + toEur(asset.quantity * asset.purchase_price, asset.currency), 0);
      setQuotes({});
      setHistory(cashAssets.length > 0 ? [{ date: cashDate, value: chartCashValue }] : []);
      setEurHistory(cashAssets.length > 0 ? [{ date: cashDate, value: eurCashValue }] : []);
      setMarketLoading(false);
      return;
    }
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
    const chartAssets = analysisAssets.filter((asset) => asset.currency === chartCurrency && !isCashAsset(asset));
    for (const asset of chartAssets) {
      for (const [date, value] of buildAssetSeries(asset)) {
        byDate.set(date, (byDate.get(date) || 0) + value);
      }
    }
    for (const cashAsset of analysisAssets.filter((asset) => asset.currency === chartCurrency && isCashAsset(asset))) {
      for (const date of timeline) {
        if (!purchaseGate(cashAsset.purchase_date, date)) continue;
        byDate.set(date, (byDate.get(date) || 0) + cashAsset.quantity * cashAsset.purchase_price);
      }
    }
    setHistory(Array.from(byDate.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)));

    // Cumulative EUR history across ALL currencies (using latest FX rate)
    const eurByDate = new Map<string, number>();
    for (const asset of analysisAssets.filter((item) => !isCashAsset(item))) {
      for (const [date, value] of buildAssetSeries(asset)) {
        eurByDate.set(date, (eurByDate.get(date) || 0) + toEur(value, asset.currency));
      }
    }
    for (const cashAsset of analysisAssets.filter((asset) => isCashAsset(asset))) {
      for (const date of timeline) {
        if (!purchaseGate(cashAsset.purchase_date, date)) continue;
        eurByDate.set(date, (eurByDate.get(date) || 0) + toEur(cashAsset.quantity * cashAsset.purchase_price, cashAsset.currency));
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

  async function saveManualCash() {
    if (!user) return;
    const amount = parseFlexibleNumber(cashForm.amount);
    if (!cashForm.snapshot_date || !cashForm.amount.trim() || !Number.isFinite(amount)) {
      toast.error('Vul een geldige datum en cashbedrag in.');
      return;
    }

    setSavingCash(true);
    const accountLabel = cashAccountLabel(cashForm.account);
    const note = cashForm.notes.trim();
    const payload = {
      user_id: user.id,
      symbol: cashAccountSymbol(cashForm.account),
      name: `Cash ${accountLabel}`,
      asset_type: 'other' as AssetType,
      exchange: accountLabel,
      mic: null,
      currency: 'EUR',
      purchase_date: cashForm.snapshot_date,
      quantity: amount,
      purchase_price: 1,
      notes: `Manual cash snapshot ${cashForm.account}${note ? `; ${note}` : ''}`,
    };

    const { error } = await (supabase as any).from('portfolio_assets').insert(payload);
    setSavingCash(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Cashsnapshot toegevoegd');
    setCashForm(emptyCashForm());
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
    <div className="dashboard-shell mx-auto w-full max-w-[1800px] space-y-4 animate-fade-in md:space-y-6 2xl:space-y-8">
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

      <section className="dashboard-hero 2xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,0.55fr)]">
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
              <PieIcon className="h-7 w-7" />
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

      <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-5">
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
        <MetricCard title="Cash totaal" value={money(cashValue, 'EUR')} sub={`Prive ${money(privateCashValue, 'EUR')} · BVBA ${money(bvbaCashValue, 'EUR')}`} />
        <MetricCard title="Aantal posities" value={String(assets.length)} sub={`${new Set(assets.map((asset) => asset.symbol)).size} unieke tickers`} />
      </div>

      <Tabs value={section} onValueChange={setSection} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="cockpit">Cockpit</TabsTrigger>
          <TabsTrigger value="allocation">Allocatie</TabsTrigger>
          <TabsTrigger value="risk">Risico & fiscaliteit</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        <TabsContent value="cockpit" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-6">
            <MetricCard title="Netto waarde" value={money(netWorth, 'EUR')} sub="Beleggingen + cash + pensioen/IPT" />
            <MetricCard title="Beleggingen" value={money(investmentValue, 'EUR')} sub={`${allocationData.length} activaklasse(n)`} />
            <MetricCard title="Cashbuffer" value={money(cashValue, 'EUR')} sub={debitValue < 0 ? 'Debetstand verlaagt netto waarde' : monthlyNetIncome > 0 ? `${bufferMonths.toFixed(1)} maand(en) netto` : 'Voeg netto inkomsten toe voor buffermaanden'} />
            <MetricCard title="Debetstand" value={money(debitValue, 'EUR')} sub={debitValue < 0 ? 'Negatieve Bolero cash' : 'Geen debetstand'} />
            <MetricCard title="Pensioen/IPT" value={money(pensionTotal, 'EUR')} sub={pensionSnapshotDate ? `Laatste snapshot ${pensionSnapshotDate}` : 'Nog geen pensioenimport'} />
            <MetricCard title="Inlegcapaciteit" value={money(monthlyCapacity, 'EUR')} sub="Per maand boven 6m cashbuffer" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] 2xl:grid-cols-[1.4fr_0.6fr]">
            <Card className="data-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Flame className="h-4 w-4" /> FIRE / pensioenrichting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Indicatieve FIRE-doelwaarde</p>
                    <p className="text-2xl font-semibold">{fireTarget > 0 ? money(fireTarget, 'EUR') : '-'}</p>
                  </div>
                  <Badge variant="outline">{fireTarget > 0 ? `${fireProgress.toFixed(1)}% bereikt` : 'Netto inkomen ontbreekt'}</Badge>
                </div>
                <Progress value={fireProgress} className="h-3" />
                <p className="text-xs text-muted-foreground">
                  Gebaseerd op 25x gemiddeld jaarlijks netto inkomen. Dit is een grove cockpit-indicator, geen financieel advies.
                </p>
              </CardContent>
            </Card>

            <Card className="data-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" /> Inkomstencontext</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Gemiddeld netto/maand</span>
                  <strong>{monthlyNetIncome > 0 ? money(monthlyNetIncome, 'EUR') : '-'}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Periode</span>
                  <span className="text-sm">{incomeWindowLabel || 'Geen recente inkomsten'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">6m bufferdoel</span>
                  <strong>{bufferTarget > 0 ? money(bufferTarget, 'EUR') : '-'}</strong>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="data-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Cashrekeningen</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Rekening</Label>
                    <Select value={cashForm.account} onValueChange={(value) => setCashForm({ ...cashForm, account: value as CashAccount })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">Prive rekening</SelectItem>
                        <SelectItem value="bvba">BVBA rekening</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="Snapshotdatum" type="date" value={cashForm.snapshot_date} onChange={(value) => setCashForm({ ...cashForm, snapshot_date: value })} />
                </div>
                <Field label="Cashbedrag in EUR" value={cashForm.amount} onChange={(value) => setCashForm({ ...cashForm, amount: value })} />
                <Field label="Notitie" value={cashForm.notes} onChange={(value) => setCashForm({ ...cashForm, notes: value })} />
                <Button onClick={saveManualCash} disabled={savingCash} className="w-full">
                  {savingCash && <Loader2 className="h-4 w-4 animate-spin" />}
                  Cashsnapshot bewaren
                </Button>
                <p className="text-xs text-muted-foreground">
                  Elke invoer wordt als snapshot bewaard. Analyses gebruiken per cashrekening automatisch de meest recente datum.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                <MetricCard title="Prive cash" value={money(privateCashValue, 'EUR')} sub={cashSnapshotDate(manualCashRows, 'private') || 'Nog geen snapshot'} />
                <MetricCard title="BVBA cash" value={money(bvbaCashValue, 'EUR')} sub={cashSnapshotDate(manualCashRows, 'bvba') || 'Nog geen snapshot'} />
                <MetricCard title="Cashbuffer totaal" value={money(cashValue, 'EUR')} sub={debitValue < 0 ? 'Inclusief debetstand' : monthlyNetIncome > 0 ? `${bufferMonths.toFixed(1)} maand(en) netto` : 'Voeg netto inkomsten toe voor buffermaanden'} />

                <div className="md:col-span-2 2xl:col-span-3">
                  {manualCashRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                      Nog geen manuele cashsnapshots. Voeg hierboven je prive- of BVBA-rekening toe.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rekening</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead className="text-right">Bedrag</TableHead>
                            <TableHead>Notitie</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {manualCashRows.map((row) => (
                            <TableRow key={row.asset.id}>
                              <TableCell className="font-medium">{cashAccountLabel(manualCashAccount(row.asset) || 'private')}</TableCell>
                              <TableCell>{row.asset.purchase_date}</TableCell>
                              <TableCell className={`text-right ${row.currentValue < 0 ? 'text-destructive' : ''}`}>{money(row.currentValue, row.quoteCurrency)}</TableCell>
                              <TableCell className="max-w-80 truncate text-muted-foreground">{manualCashNote(row.asset.notes)}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" onClick={() => deleteAsset(row.asset.id)}><Trash2 className="h-4 w-4" /></Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocation" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            <AllocationChartCard title="Activaklasse" data={allocationData} />
            <AllocationChartCard title="Broker / bron" data={brokerData} />
            <AllocationChartCard title="Munt" data={currencyData} />
            <AllocationChartCard title="Regio" data={regionData} />
          </div>
          <AllocationBarsCard title="Sector / profiel" data={sectorData} />
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] 2xl:grid-cols-[0.7fr_1.3fr]">
            <Card className="data-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Portfolio-check</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {riskItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen duidelijke aandachtspunten op basis van de huidige posities.</p>
                ) : riskItems.map((item) => (
                  <div key={item.title} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`mt-0.5 h-4 w-4 ${item.tone === 'warn' ? 'text-amber-600' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="data-card">
              <CardHeader>
                <CardTitle className="text-base">Belgische aandachtspunten</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <InfoTile title="TOB" text="Controleer per ETF/aandeel de juiste beurstaks. Belgische registratie kan sterk verschillen." />
                <InfoTile title="Roerende voorheffing" text="Dividendposities kunnen Belgische RV en buitenlandse bronheffing hebben." />
                <InfoTile title="Reynders-tax" text="Fondsen/ETF's met obligatiecomponent vragen extra controle bij verkoop." />
                <InfoTile title="Brokerdata" text="Bolero-import is een snapshot. Live koersen hangen af van ticker/marktdata-herkenning." />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <Card className="data-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Broker-import MVP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Startpunt is Bolero Expert `.xlsx`: bestaande Bolero snapshot-posities worden vervangen en als huidige posities ingeladen.
                Andere brokers blijven voorlopig manueel of via latere CSV-mapping.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => boleroInputRef.current?.click()} disabled={importingBolero}>
                  {importingBolero ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Bolero Expert importeren
                </Button>
                <Badge variant="outline">DEGIRO CSV: gepland</Badge>
                <Badge variant="outline">Saxo CSV: gepland</Badge>
                <Badge variant="outline">Keytrade CSV: gepland</Badge>
                <Badge variant="outline">IBKR CSV: gepland</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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


      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr] 2xl:grid-cols-[minmax(0,1.7fr)_minmax(420px,0.55fr)]">
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
  const isCash = position.type.toLowerCase().includes('cash');
  const cashAmount = position.eurValue || position.currentValue || position.purchaseValue;
  const quantity = isCash
    ? (cashAmount === 0 ? 0.01 : cashAmount)
    : Math.max(position.quantity, 0.0001);
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
    notes: `Bolero Expert snapshot ${fileName}; ${isCash && cashAmount < 0 ? 'debetstand; ' : ''}ISIN ${position.isin || 'n.v.t.'}; originele munt ${position.currency || 'EUR'}; rendement ${position.returnPct || 0}%; originele koers ${position.currentQuote || position.currentValue || 0}.`,
  };
}

function boleroSymbol(position: BoleroPosition) {
  if (position.isin) return position.isin.toUpperCase();
  if (position.type.toLowerCase().includes('cash')) return `CASH-${position.currency || 'EUR'}`;
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
    .replace(/[^\d,.-]/g, '')
    .trim();
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseFlexibleNumber(value: string) {
  const text = value
    .replace(/\u00a0/g, ' ')
    .replace(/\s/g, '')
    .trim();
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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

function AllocationChartCard({ title, data }: { title: string; data: AllocationDatum[] }) {
  return (
    <Card className="data-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
        <div className="h-56">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Geen data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {data.map((entry, idx) => <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => money(Number(value), 'EUR')} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <AllocationTable data={data} />
      </CardContent>
    </Card>
  );
}

function AllocationBarsCard({ title, data }: { title: string; data: AllocationDatum[] }) {
  return (
    <Card className="data-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="h-72">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Geen data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(value) => compactMoney(Number(value))} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => money(Number(value), 'EUR')} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <AllocationTable data={data} />
      </CardContent>
    </Card>
  );
}

function AllocationTable({ data }: { data: AllocationDatum[] }) {
  return (
    <div className="space-y-3">
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen posities om te verdelen.</p>
      ) : data.map((item, idx) => (
        <div key={item.name} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="font-medium">{item.percentage.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{money(item.value, 'EUR')}</span>
            <Progress value={item.percentage} className="h-2 max-w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoTile({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function groupRows(rows: any[], keyFn: (row: any) => string, toEur: (value: number, currency: string) => number): AllocationDatum[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = toEur(Number(row.currentValue || 0), row.quoteCurrency || row.asset?.currency || 'EUR');
    if (value <= 0) continue;
    const key = keyFn(row).trim() || 'Onbekend';
    map.set(key, (map.get(key) || 0) + value);
  }
  const total = Array.from(map.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value, percentage: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function latestCashSnapshots(assets: PortfolioAsset[]) {
  const latest = new Map<string, PortfolioAsset>();
  const regularAssets: PortfolioAsset[] = [];
  for (const asset of assets) {
    if (!isCashAsset(asset)) {
      regularAssets.push(asset);
      continue;
    }
    const key = asset.symbol.toUpperCase();
    const previous = latest.get(key);
    if (!previous || compareCashSnapshots(asset, previous) > 0) {
      latest.set(key, asset);
    }
  }
  return [...regularAssets, ...latest.values()];
}

function compareCashSnapshots(a: PortfolioAsset, b: PortfolioAsset) {
  const dateCompare = a.purchase_date.localeCompare(b.purchase_date);
  if (dateCompare !== 0) return dateCompare;
  return a.id.localeCompare(b.id);
}

function isCashAsset(asset: PortfolioAsset) {
  const haystack = `${asset.symbol} ${asset.name} ${asset.asset_type} ${asset.notes || ''}`.toLowerCase();
  return haystack.includes('cash') || asset.symbol.toUpperCase().startsWith('CASH-');
}

function isManualCashAsset(asset: PortfolioAsset) {
  return manualCashAccount(asset) !== null;
}

function manualCashAccount(asset: PortfolioAsset): CashAccount | null {
  const symbol = asset.symbol.toUpperCase();
  const notes = String(asset.notes || '').toLowerCase();
  if (symbol === 'CASH-PRIVATE' || notes.includes('manual cash snapshot private')) return 'private';
  if (symbol === 'CASH-BVBA' || notes.includes('manual cash snapshot bvba')) return 'bvba';
  return null;
}

function cashAccountSymbol(account: CashAccount) {
  return account === 'private' ? 'CASH-PRIVATE' : 'CASH-BVBA';
}

function cashAccountLabel(account: CashAccount) {
  return account === 'private' ? 'Prive rekening' : 'BVBA rekening';
}

function cashSnapshotDate(rows: Array<{ asset: PortfolioAsset }>, account: CashAccount) {
  return rows.find((row) => manualCashAccount(row.asset) === account)?.asset.purchase_date || '';
}

function manualCashNote(notes: string | null) {
  return String(notes || '').replace(/^Manual cash snapshot (private|bvba);?\s*/i, '') || '-';
}

function inferBrokerFromAsset(asset: PortfolioAsset) {
  const account = manualCashAccount(asset);
  if (account) return cashAccountLabel(account);
  const notes = String(asset.notes || '').toLowerCase();
  if (notes.includes('bolero')) return 'Bolero';
  if (notes.includes('degiro') || notes.includes('de giro')) return 'DEGIRO';
  if (notes.includes('saxo')) return 'Saxo';
  if (notes.includes('keytrade')) return 'Keytrade';
  if (notes.includes('interactive brokers') || notes.includes('ibkr')) return 'Interactive Brokers';
  return 'Manueel';
}

function inferRegion(value: string) {
  const v = value.toLowerCase();
  if (!v) return 'Onbekend';
  if (v.includes('nasdaq') || v.includes('nyse') || v.includes('usa') || v.includes('new york')) return 'Verenigde Staten';
  if (v.includes('euronext') || v.includes('xetra') || v.includes('frankfurt') || v.includes('amsterdam') || v.includes('brussels') || v.includes('paris')) return 'Europa';
  if (v.includes('london') || v.includes('lse')) return 'Verenigd Koninkrijk';
  if (v.includes('tokyo') || v.includes('hong kong') || v.includes('singapore')) return 'Azië';
  return value || 'Onbekend';
}

function buildRiskItems({ rows, cashValue, bufferMonths, monthlyNetIncome, currencyData }: {
  rows: any[];
  cashValue: number;
  bufferMonths: number;
  monthlyNetIncome: number;
  currencyData: AllocationDatum[];
}) {
  const items: { title: string; detail: string; tone: 'info' | 'warn' }[] = [];
  const top = rows.filter((row) => row.currentValue > 0).sort((a, b) => b.allocation - a.allocation)[0];
  if (top && top.allocation > 25) {
    items.push({ title: 'Hoge concentratie', detail: `${top.asset.symbol} weegt ${top.allocation.toFixed(1)}% van de portefeuille.`, tone: 'warn' });
  }
  const crypto = rows.filter((row) => row.asset.asset_type === 'crypto').reduce((sum, row) => sum + row.allocation, 0);
  if (crypto > 5) items.push({ title: 'Crypto boven 5%', detail: `Crypto weegt ongeveer ${crypto.toFixed(1)}%. Beperk speculatieve blootstelling bewust.`, tone: 'warn' });
  const foreign = currencyData.filter((item) => item.name !== 'EUR').reduce((sum, item) => sum + item.percentage, 0);
  if (foreign > 30) items.push({ title: 'Valutarisico', detail: `${foreign.toFixed(1)}% staat niet in EUR. Wisselkoersen beïnvloeden je EUR-netto waarde.`, tone: 'info' });
  const snapshots = rows.filter((row) => row.isBoleroSnapshot).length;
  if (snapshots > 0) items.push({ title: 'Snapshotdata', detail: `${snapshots} positie(s) komen uit Bolero-import. Herimporteer periodiek voor actuele holdings.`, tone: 'info' });
  if (monthlyNetIncome > 0 && bufferMonths < 3) {
    items.push({ title: 'Cashbuffer laag', detail: `Cashbuffer is ${bufferMonths.toFixed(1)} maand(en) netto inkomen. Richtwaarde: 3 tot 6 maanden.`, tone: 'warn' });
  } else if (monthlyNetIncome === 0 && cashValue === 0) {
    items.push({ title: 'Cashbuffer onbekend', detail: 'Voeg cashpositie of recente inkomsten toe om buffermaanden te berekenen.', tone: 'info' });
  }
  return items;
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
