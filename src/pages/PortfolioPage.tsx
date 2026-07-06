import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, ArrowDownUp, Euro, FileSpreadsheet, Flame, Landmark, Loader2, PieChart as PieIcon, Plus, ShieldAlert, Target, Trash2, TrendingUp, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';

type PortfolioAsset = {
  id: string;
  user_id: string;
  symbol: string;
  isin: string | null;
  name: string;
  asset_class: string;
  region: string;
  sector: string;
  currency: string;
  broker: string;
  current_price: number;
  target_weight: number;
  expense_ratio: number;
  tax_profile: string;
  is_accumulating: boolean;
  is_ucits: boolean;
  has_bond_component: boolean;
  notes: string | null;
};

type PortfolioTransaction = {
  id: string;
  asset_id: string | null;
  transaction_date: string;
  transaction_type: TxType;
  symbol: string;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  taxes: number;
  currency: string;
  broker: string;
  notes: string | null;
};

type TxType = 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal' | 'fee' | 'tax';

type Position = {
  asset: PortfolioAsset;
  quantity: number;
  invested: number;
  marketValue: number;
  pnl: number;
  pnlPct: number | null;
  dividends: number;
  feesAndTaxes: number;
  weight: number;
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

type PensionRecord = {
  pensioenreserve: number;
  pensioenreserve_vapz: number;
  snapshot_date: string;
};

type PensionIptRecord = {
  opgebouwde_reserve: number;
  snapshot_date: string;
};

const assetClassLabels: Record<string, string> = {
  equity_etf: 'Aandelen-ETF',
  equity_stock: 'Individueel aandeel',
  bond_etf: 'Obligatie-ETF',
  bond: 'Obligatie',
  money_market: 'Geldmarkt',
  cash: 'Cash',
  real_estate: 'Vastgoed',
  commodity: 'Goud/commodities',
  crypto: 'Crypto',
  pension: 'Pensioen/IPT',
  other: 'Andere',
};

const taxProfiles: Record<string, { label: string; tobRate: number; notes: string[] }> = {
  stock: { label: 'Aandeel - TOB indicatief 0,35%', tobRate: 0.0035, notes: ['Dividend? Reken doorgaans met roerende voorheffing.', 'Controleer buitenlandse dividendbronheffing.'] },
  etf_standard: { label: 'ETF standaard - TOB indicatief 0,12%', tobRate: 0.0012, notes: ['Controleer domicilie, UCITS/KID en broker-classificatie.', 'Accumulerend verlaagt dividendcashflow, niet noodzakelijk alle fiscale risico.'] },
  etf_be_registered_acc: { label: 'ETF BE-geregistreerd kapitaliserend - TOB indicatief 1,32%', tobRate: 0.0132, notes: ['Hoge TOB-categorie: verifieer bij broker/FOD.', 'Kan DCA-kosten sterk verhogen.'] },
  bond_or_money_market: { label: 'Obligatie/geldmarkt - TOB indicatief 0,12%', tobRate: 0.0012, notes: ['Let op Reynders-tax bij fondsen met obligatiecomponent.', 'Rente/coupon kan roerende voorheffing activeren.'] },
  cash: { label: 'Cash - geen beursorder', tobRate: 0, notes: ['Geen TOB, wel inflatie- en tegenpartijrisico.'] },
  crypto: { label: 'Crypto - manueel opvolgen', tobRate: 0, notes: ['Fiscale behandeling hangt sterk af van profiel en transactiefrequentie.', 'Gebruik aparte speculatieve limiet.'] },
};

const COLORS = ['#2f9e91', '#1d4f7a', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#64748b', '#ec4899'];
const today = () => new Date().toISOString().slice(0, 10);
const parseNum = (v: string | number | null | undefined) => Number(String(v ?? '').replace(',', '.')) || 0;
const fmt = (v: number, currency = 'EUR') => v.toLocaleString('nl-BE', { style: 'currency', currency });
const pct = (v: number) => `${v.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const emptyAsset = () => ({
  symbol: '',
  isin: '',
  name: '',
  asset_class: 'equity_etf',
  region: 'global',
  sector: 'broad',
  currency: 'EUR',
  broker: '',
  current_price: '0',
  target_weight: '0',
  expense_ratio: '0',
  tax_profile: 'etf_standard',
  is_accumulating: true,
  is_ucits: true,
  has_bond_component: false,
  notes: '',
});

const emptyTx = () => ({
  asset_id: '',
  transaction_date: today(),
  transaction_type: 'buy' as TxType,
  quantity: '0',
  price: '0',
  amount: '0',
  fees: '0',
  taxes: '0',
  notes: '',
});

export default function PortfolioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [incomeRecords, setIncomeRecords] = useState<{ year: number; month: number; netto: number }[]>([]);
  const [pensionRecords, setPensionRecords] = useState<PensionRecord[]>([]);
  const [iptRecords, setIptRecords] = useState<PensionIptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetOpen, setAssetOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [assetForm, setAssetForm] = useState(emptyAsset());
  const [txForm, setTxForm] = useState(emptyTx());
  const [monthlyDca, setMonthlyDca] = useState('2000');
  const [targetFireAmount, setTargetFireAmount] = useState('1500000');
  const [cashBufferMonths, setCashBufferMonths] = useState('6');
  const [csvText, setCsvText] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [assetRes, txRes, incomeRes, pensionRes, iptRes] = await Promise.all([
      supabase.from('portfolio_assets').select('*').eq('user_id', user.id).order('symbol'),
      supabase.from('portfolio_transactions').select('*').eq('user_id', user.id).order('transaction_date', { ascending: false }),
      supabase.from('income_records').select('year, month, netto').eq('user_id', user.id),
      supabase.from('pension_records').select('pensioenreserve, pensioenreserve_vapz, snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(1),
      supabase.from('pension_ipt_records').select('opgebouwde_reserve, snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(1),
    ]);
    if (assetRes.error) toast({ title: 'Portfolio laden mislukt', description: assetRes.error.message, variant: 'destructive' });
    if (txRes.error) toast({ title: 'Transacties laden mislukt', description: txRes.error.message, variant: 'destructive' });
    setAssets((assetRes.data || []) as PortfolioAsset[]);
    setTransactions((txRes.data || []) as PortfolioTransaction[]);
    setIncomeRecords((incomeRes.data || []) as { year: number; month: number; netto: number }[]);
    setPensionRecords((pensionRes.data || []) as PensionRecord[]);
    setIptRecords((iptRes.data || []) as PensionIptRecord[]);
    setLoading(false);
  }, [toast, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const positions = useMemo<Position[]>(() => {
    const totalByAsset = assets.map(asset => {
      const txs = transactions.filter(t => t.asset_id === asset.id || (!t.asset_id && t.symbol.toUpperCase() === asset.symbol.toUpperCase()));
      let quantity = 0;
      let invested = 0;
      let dividends = 0;
      let feesAndTaxes = 0;
      txs.forEach(t => {
        const gross = t.amount || t.quantity * t.price;
        feesAndTaxes += t.fees + t.taxes;
        if (t.transaction_type === 'buy') {
          quantity += t.quantity;
          invested += gross + t.fees + t.taxes;
        } else if (t.transaction_type === 'sell') {
          quantity -= t.quantity;
          invested -= Math.min(invested, gross);
        } else if (t.transaction_type === 'dividend') {
          dividends += gross - t.taxes;
        } else if (t.transaction_type === 'fee' || t.transaction_type === 'tax') {
          invested += gross;
        }
      });
      const marketValue = asset.asset_class === 'cash' ? invested : quantity * asset.current_price;
      const value = marketValue || invested;
      const pnl = value + dividends - invested;
      return {
        asset,
        quantity,
        invested,
        marketValue: value,
        pnl,
        pnlPct: invested > 0 ? (pnl / invested) * 100 : null,
        dividends,
        feesAndTaxes,
        weight: 0,
      };
    }).filter(p => Math.abs(p.marketValue) > 0.01 || Math.abs(p.quantity) > 0.000001);
    const total = totalByAsset.reduce((s, p) => s + p.marketValue, 0);
    return totalByAsset.map(p => ({ ...p, weight: total > 0 ? (p.marketValue / total) * 100 : 0 }));
  }, [assets, transactions]);

  const totalValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalInvested = positions.reduce((s, p) => s + p.invested, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const totalDividends = positions.reduce((s, p) => s + p.dividends, 0);

  const allocationData = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach(p => map.set(assetClassLabels[p.asset.asset_class] || p.asset.asset_class, (map.get(assetClassLabels[p.asset.asset_class] || p.asset.asset_class) || 0) + p.marketValue));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [positions]);

  const regionData = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach(p => map.set(p.asset.region || 'onbekend', (map.get(p.asset.region || 'onbekend') || 0) + p.marketValue));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [positions]);

  const sectorData = useMemo(() => groupPositions(positions, p => p.asset.sector || 'onbekend'), [positions]);
  const currencyData = useMemo(() => groupPositions(positions, p => p.asset.currency || 'EUR'), [positions]);
  const brokerData = useMemo(() => groupPositions(positions, p => p.asset.broker || 'Onbekend'), [positions]);
  const targetTotal = assets.reduce((s, a) => s + a.target_weight, 0);
  const dcaAmount = parseNum(monthlyDca);

  const avgMonthlyNetto = useMemo(() => {
    const buckets = new Map<string, number>();
    incomeRecords.forEach(r => buckets.set(`${r.year}-${r.month}`, (buckets.get(`${r.year}-${r.month}`) || 0) + r.netto));
    const vals = Array.from(buckets.values()).slice(-12);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }, [incomeRecords]);

  const cashValue = positions.filter(p => p.asset.asset_class === 'cash' || p.asset.asset_class === 'money_market').reduce((s, p) => s + p.marketValue, 0);
  const latestPension = pensionRecords[0];
  const latestIpt = iptRecords[0];
  const pensionValue = (latestPension?.pensioenreserve || 0) + (latestPension?.pensioenreserve_vapz || 0) + (latestIpt?.opgebouwde_reserve || 0);
  const investableValue = positions.filter(p => !['cash', 'money_market', 'pension'].includes(p.asset.asset_class)).reduce((s, p) => s + p.marketValue, 0);
  const totalNetWorth = cashValue + investableValue + pensionValue;
  const yearlyDca = dcaAmount * 12;
  const fireTarget = parseNum(targetFireAmount);
  const firePct = fireTarget > 0 ? (totalNetWorth / fireTarget) * 100 : 0;
  const cashTarget = avgMonthlyNetto * parseNum(cashBufferMonths);
  const cashBufferPct = cashTarget > 0 ? (cashValue / cashTarget) * 100 : 0;
  const estimatedYearsToFire = yearlyDca > 0 && fireTarget > totalNetWorth ? (fireTarget - totalNetWorth) / yearlyDca : 0;
  const wealthStackData = [
    { name: 'Cashbuffer', value: cashValue },
    { name: 'Beleggingen', value: investableValue },
    { name: 'Pensioen/IPT', value: pensionValue },
  ].filter(d => d.value > 0);

  const rebalanceRows = useMemo(() => {
    return assets
      .filter(a => a.target_weight > 0)
      .map(asset => {
        const position = positions.find(p => p.asset.id === asset.id);
        const current = position?.marketValue || 0;
        const targetPct = targetTotal > 0 ? asset.target_weight / targetTotal : 0;
        const targetValue = (totalValue + dcaAmount) * targetPct;
        const gap = targetValue - current;
        return { asset, current, targetValue, gap, buySuggestion: Math.max(0, gap) };
      })
      .sort((a, b) => b.buySuggestion - a.buySuggestion);
  }, [assets, positions, totalValue, dcaAmount, targetTotal]);

  const taxWarnings = useMemo(() => {
    const warnings: { title: string; detail: string; tone: 'warn' | 'info' }[] = [];
    assets.forEach(asset => {
      if (!asset.is_ucits && ['equity_etf', 'bond_etf', 'money_market'].includes(asset.asset_class)) {
        warnings.push({ title: `${asset.symbol}: geen UCITS-vlag`, detail: 'Controleer KID/PRIIPs, domicilie en brokerbeschikbaarheid voor retailbeleggers.', tone: 'warn' });
      }
      if (asset.has_bond_component || asset.asset_class === 'bond_etf' || asset.asset_class === 'money_market') {
        warnings.push({ title: `${asset.symbol}: obligatiecomponent`, detail: 'Mogelijke Reynders-tax of rente/couponbehandeling. Verifieer fondsdata en fiscaliteit.', tone: 'warn' });
      }
      if (!asset.is_accumulating && ['equity_etf', 'equity_stock'].includes(asset.asset_class)) {
        warnings.push({ title: `${asset.symbol}: distribuerend/dividend`, detail: 'Dividenden kunnen roerende voorheffing en buitenlandse bronheffing veroorzaken.', tone: 'info' });
      }
      if (asset.tax_profile === 'etf_be_registered_acc') {
        warnings.push({ title: `${asset.symbol}: hoge TOB-categorie`, detail: 'Indicatief 1,32% TOB-profiel geselecteerd. Dit verdient extra controle voor elke aankoop.', tone: 'warn' });
      }
      if (asset.asset_class === 'crypto' && asset.target_weight > 5) {
        warnings.push({ title: `${asset.symbol}: hoge crypto-doelweging`, detail: 'Speculatieve bucket boven 5%. Bewaak concentratie en fiscale documentatie.', tone: 'warn' });
      }
    });
    return warnings;
  }, [assets]);

  const concentration = positions[0] ? Math.max(...positions.map(p => p.weight)) : 0;
  const targetDrift = assets
    .filter(a => a.target_weight > 0 && targetTotal > 0)
    .map(a => {
      const current = positions.find(p => p.asset.id === a.id)?.weight || 0;
      return Math.abs(current - (a.target_weight / targetTotal) * 100);
    })
    .reduce((m, v) => Math.max(m, v), 0);

  const saveAsset = async () => {
    if (!user || !assetForm.symbol.trim()) return;
    const payload = {
      user_id: user.id,
      symbol: assetForm.symbol.trim().toUpperCase(),
      isin: assetForm.isin.trim() || null,
      name: assetForm.name.trim() || assetForm.symbol.trim().toUpperCase(),
      asset_class: assetForm.asset_class,
      region: assetForm.region.trim() || 'global',
      sector: assetForm.sector.trim() || 'broad',
      currency: assetForm.currency.trim().toUpperCase() || 'EUR',
      broker: assetForm.broker.trim(),
      current_price: parseNum(assetForm.current_price),
      target_weight: parseNum(assetForm.target_weight),
      expense_ratio: parseNum(assetForm.expense_ratio),
      tax_profile: assetForm.tax_profile,
      is_accumulating: assetForm.is_accumulating,
      is_ucits: assetForm.is_ucits,
      has_bond_component: assetForm.has_bond_component,
      notes: assetForm.notes.trim() || null,
    };
    const { error } = await supabase.from('portfolio_assets').insert(payload);
    if (error) toast({ title: 'Asset opslaan mislukt', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Asset toegevoegd' });
      setAssetOpen(false);
      setAssetForm(emptyAsset());
      void load();
    }
  };

  const saveTransaction = async () => {
    if (!user || !txForm.asset_id) return;
    const asset = assets.find(a => a.id === txForm.asset_id);
    if (!asset) return;
    const quantity = parseNum(txForm.quantity);
    const price = parseNum(txForm.price);
    const amount = parseNum(txForm.amount) || quantity * price;
    const taxProfile = taxProfiles[asset.tax_profile] || taxProfiles.etf_standard;
    const taxes = parseNum(txForm.taxes) || (txForm.transaction_type === 'buy' || txForm.transaction_type === 'sell' ? amount * taxProfile.tobRate : 0);
    const { error } = await supabase.from('portfolio_transactions').insert({
      user_id: user.id,
      asset_id: asset.id,
      symbol: asset.symbol,
      broker: asset.broker,
      currency: asset.currency,
      transaction_date: txForm.transaction_date,
      transaction_type: txForm.transaction_type,
      quantity,
      price,
      amount,
      fees: parseNum(txForm.fees),
      taxes,
      notes: txForm.notes.trim() || null,
    });
    if (error) toast({ title: 'Transactie opslaan mislukt', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Transactie toegevoegd' });
      setTxOpen(false);
      setTxForm(emptyTx());
      void load();
    }
  };

  const removeTransaction = async (id: string) => {
    const { error } = await supabase.from('portfolio_transactions').delete().eq('id', id);
    if (error) toast({ title: 'Verwijderen mislukt', description: error.message, variant: 'destructive' });
    else void load();
  };

  const importCsv = async () => {
    if (!user) return;
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      toast({ title: 'Geen importdata', variant: 'destructive' });
      return;
    }
    const assetBySymbol = new Map(assets.flatMap(a => [[a.symbol.toUpperCase(), a], [String(a.isin || '').toUpperCase(), a]]));
    const payload = rows.map(row => {
      const normalized = normalizeBrokerRow(row);
      const symbol = normalized.symbol.toUpperCase();
      const asset = assetBySymbol.get(symbol) || assetBySymbol.get(normalized.isin.toUpperCase());
      return {
        user_id: user.id,
        asset_id: asset?.id || null,
        symbol: asset?.symbol || symbol,
        broker: normalized.broker || asset?.broker || '',
        currency: (normalized.currency || asset?.currency || 'EUR').toUpperCase(),
        transaction_date: normalized.date || today(),
        transaction_type: normalized.type,
        quantity: normalized.quantity,
        price: normalized.price,
        amount: normalized.amount,
        fees: normalized.fees,
        taxes: normalized.taxes,
        notes: normalized.notes || null,
      };
    }).filter(row => row.symbol && row.transaction_type);
    const { error } = await supabase.from('portfolio_transactions').insert(payload);
    if (error) toast({ title: 'CSV-import mislukt', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'CSV geïmporteerd', description: `${payload.length} transactie(s) toegevoegd.` });
      setCsvText('');
      setImportOpen(false);
      void load();
    }
  };

  const importBoleroFile = async (file: File) => {
    if (!user) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const positionsFromFile = parseBoleroWorkbook(workbook);
      if (positionsFromFile.length === 0) {
        toast({ title: 'Geen Bolero-posities gevonden', description: 'Kon geen Portfolio Positions-tabel herkennen.', variant: 'destructive' });
        return;
      }

      await supabase
        .from('portfolio_transactions')
        .delete()
        .eq('user_id', user.id)
        .ilike('notes', 'Bolero position snapshot%');

      const importedAssets: PortfolioAsset[] = [];
      for (const position of positionsFromFile) {
        const assetPayload = boleroPositionToAsset(position, user.id);
        const existing = assets.find(a =>
          (position.isin && a.isin === position.isin) ||
          a.symbol.toUpperCase() === assetPayload.symbol.toUpperCase()
        );
        const assetRes = existing
          ? await supabase.from('portfolio_assets').update(assetPayload).eq('id', existing.id).select('*').single()
          : await supabase.from('portfolio_assets').insert(assetPayload).select('*').single();
        if (assetRes.error) throw assetRes.error;
        importedAssets.push(assetRes.data as PortfolioAsset);
      }

      const txPayload = positionsFromFile.map(position => {
        const asset = importedAssets.find(a => a.isin === position.isin || a.symbol === boleroSymbol(position));
        const isCash = position.type.toLowerCase() === 'cash';
        const currentFx = position.currentValue !== 0 ? position.eurValue / position.currentValue : 1;
        const estimatedCostEur = isCash ? position.eurValue : position.purchaseValue * currentFx;
        return {
          user_id: user.id,
          asset_id: asset?.id || null,
          symbol: asset?.symbol || boleroSymbol(position),
          broker: 'Bolero',
          currency: 'EUR',
          transaction_date: today(),
          transaction_type: 'buy' as TxType,
          quantity: isCash ? 1 : position.quantity,
          price: isCash ? position.eurValue : estimatedCostEur / Math.max(position.quantity, 1),
          amount: estimatedCostEur,
          fees: 0,
          taxes: 0,
          notes: `Bolero position snapshot ${file.name}; origineel ${position.currency}; markt ${position.market || 'n.v.t.'}; rendement ${position.returnPct || 0}%`,
        };
      });
      const txRes = await supabase.from('portfolio_transactions').insert(txPayload);
      if (txRes.error) throw txRes.error;

      toast({ title: 'Bolero-portefeuille geïmporteerd', description: `${positionsFromFile.length} positie(s) als huidige portefeuille geladen.` });
      setImportOpen(false);
      void load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import mislukt.';
      toast({ title: 'Bolero-import mislukt', description: message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-muted-foreground mt-1">Beleggingen, allocatie, DCA en Belgische tax-aandachtspunten.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><FileSpreadsheet className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" onClick={() => setTxOpen(true)} className="gap-2" disabled={assets.length === 0}><ArrowDownUp className="h-4 w-4" /> Transactie</Button>
          <Button onClick={() => setAssetOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Asset</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={Euro} label="Portfolio waarde" value={fmt(totalValue)} />
        <MetricCard icon={TrendingUp} label="Resultaat incl. dividend" value={fmt(totalPnl)} sub={totalInvested > 0 ? pct((totalPnl / totalInvested) * 100) : 'Nog geen kostbasis'} tone={totalPnl >= 0 ? 'good' : 'bad'} />
        <MetricCard icon={PieIcon} label="Grootste positie" value={pct(concentration)} sub={concentration > 25 ? 'Concentratierisico' : 'Binnen normale marge'} tone={concentration > 25 ? 'warn' : 'neutral'} />
        <MetricCard icon={Target} label="Grootste target drift" value={pct(targetDrift)} sub={targetDrift > 10 ? 'Herbalanceer met nieuwe inleg' : 'Doelverdeling oké'} tone={targetDrift > 10 ? 'warn' : 'neutral'} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="cockpit">Cockpit</TabsTrigger>
          <TabsTrigger value="overview">Overzicht</TabsTrigger>
          <TabsTrigger value="allocation">Allocatie</TabsTrigger>
          <TabsTrigger value="dca">DCA & rebalancing</TabsTrigger>
          <TabsTrigger value="tax">Tax flags</TabsTrigger>
          <TabsTrigger value="transactions">Transacties</TabsTrigger>
        </TabsList>

        <TabsContent value="cockpit" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard icon={Wallet} label="Netto vermogen" value={fmt(totalNetWorth)} sub="Cash + beleggingen + pensioen/IPT" />
            <MetricCard icon={Landmark} label="Pensioen/IPT" value={fmt(pensionValue)} sub={latestPension || latestIpt ? 'Laatste snapshot' : 'Nog geen pensioenimport'} />
            <MetricCard icon={Target} label="Cashbuffer" value={fmt(cashValue)} sub={`${pct(cashBufferPct)} van ${cashBufferMonths} maanden`} tone={cashBufferPct < 75 ? 'warn' : 'good'} />
            <MetricCard icon={Flame} label="FIRE-voortgang" value={pct(firePct)} sub={estimatedYearsToFire > 0 ? `± ${estimatedYearsToFire.toFixed(1)} jaar met huidige DCA` : 'Doel bereikt of geen doel'} tone={firePct >= 100 ? 'good' : 'neutral'} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Financiële cockpit</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <CockpitLine label="Gemiddeld netto inkomen/maand" value={fmt(avgMonthlyNetto)} />
                <CockpitLine label="Maandelijkse inlegcapaciteit" value={fmt(dcaAmount)} sub={avgMonthlyNetto > 0 ? `${pct((dcaAmount / avgMonthlyNetto) * 100)} van netto` : undefined} />
                <CockpitLine label="Jaarlijkse inlegcapaciteit" value={fmt(yearlyDca)} />
                <CockpitLine label="Cashbuffer-doel" value={fmt(cashTarget)} sub={`${cashBufferMonths} maanden netto inkomen`} />
                <CockpitLine label="FIRE/pensioendoel" value={fmt(fireTarget)} />
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label className="text-xs">Cashbuffer maanden</Label>
                    <Input value={cashBufferMonths} onChange={e => setCashBufferMonths(e.target.value)} inputMode="decimal" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">FIRE/pensioendoel</Label>
                    <Input value={targetFireAmount} onChange={e => setTargetFireAmount(e.target.value)} inputMode="decimal" className="mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <ChartCard title="Vermogensopbouw" data={wealthStackData} />
          </div>
        </TabsContent>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Posities</CardTitle></CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <EmptyPortfolio onAdd={() => setAssetOpen(true)} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Aantal</TableHead>
                      <TableHead className="text-right">Waarde</TableHead>
                      <TableHead className="text-right">Weging</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.sort((a, b) => b.marketValue - a.marketValue).map(p => (
                      <TableRow key={p.asset.id}>
                        <TableCell>
                          <div className="font-medium">{p.asset.symbol}</div>
                          <div className="text-xs text-muted-foreground">{p.asset.name} {p.asset.isin ? `• ${p.asset.isin}` : ''}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{assetClassLabels[p.asset.asset_class] || p.asset.asset_class}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{p.quantity.toLocaleString('nl-BE', { maximumFractionDigits: 4 })}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(p.marketValue, p.asset.currency)}</TableCell>
                        <TableCell className="text-right font-mono">{pct(p.weight)}</TableCell>
                        <TableCell className={`text-right font-mono ${p.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(p.pnl, p.asset.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocation" className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <ChartCard title="Allocatie per activaklasse" data={allocationData} />
          <ChartCard title="Regioverdeling" data={regionData} />
          <ChartCard title="Sectorverdeling" data={sectorData} />
          <ChartCard title="Muntverdeling" data={currencyData} />
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Brokerverdeling</CardTitle></CardHeader>
            <CardContent>
              <AllocationTable data={brokerData} total={totalValue} />
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Doel vs huidige weging</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={assets.map(a => ({
                  symbol: a.symbol,
                  huidig: positions.find(p => p.asset.id === a.id)?.weight || 0,
                  doel: targetTotal > 0 ? (a.target_weight / targetTotal) * 100 : 0,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="symbol" />
                  <YAxis tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: number) => pct(v)} />
                  <Bar dataKey="huidig" fill="#2f9e91" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="doel" fill="#1d4f7a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dca" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Maandelijkse inleg</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">DCA-bedrag</Label>
                <Input value={monthlyDca} inputMode="decimal" onChange={e => setMonthlyDca(e.target.value)} className="mt-1" />
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-xs text-muted-foreground">Gem. netto inkomen/maand</div>
                <div className="text-xl font-semibold">{fmt(avgMonthlyNetto)}</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-xs text-muted-foreground">DCA als % van netto</div>
                <div className="text-xl font-semibold">{avgMonthlyNetto > 0 ? pct((dcaAmount / avgMonthlyNetto) * 100) : 'n.v.t.'}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Koopvolgorde met nieuwe inleg</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Huidig</TableHead>
                    <TableHead className="text-right">Doelwaarde na DCA</TableHead>
                    <TableHead className="text-right">Suggestie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rebalanceRows.map(row => (
                    <TableRow key={row.asset.id}>
                      <TableCell>
                        <div className="font-medium">{row.asset.symbol}</div>
                        <div className="text-xs text-muted-foreground">Doelgewicht {targetTotal > 0 ? pct((row.asset.target_weight / targetTotal) * 100) : '0%'}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmt(row.current, row.asset.currency)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(row.targetValue, row.asset.currency)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{row.buySuggestion > 1 ? fmt(row.buySuggestion, row.asset.currency) : 'Overslaan'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">Suggesties gebruiken alleen nieuwe inleg. Dit voorkomt onnodig verkopen en extra tax/kosten.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax" className="space-y-4 mt-4">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 text-sm text-muted-foreground">
              Indicatieve tax-laag, geen fiscaal advies. Controleer TOB, roerende voorheffing, Reynders-tax en buitenlandse rekeningen bij broker/FOD/boekhouder.
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Transactiekosten & tax impact</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <TaxLine label="Betaalde dividenden netto" value={fmt(totalDividends)} />
                <TaxLine label="Geregistreerde kosten/taksen" value={fmt(positions.reduce((s, p) => s + p.feesAndTaxes, 0))} />
                <TaxLine label="Nieuwe DCA bruto" value={fmt(dcaAmount)} />
                <TaxLine label="Geschatte TOB op voorgestelde DCA" value={fmt(rebalanceRows.reduce((s, row) => s + row.buySuggestion * ((taxProfiles[row.asset.tax_profile] || taxProfiles.etf_standard).tobRate), 0))} />
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Waarschuwingen</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {taxWarnings.length === 0 ? <p className="text-sm text-muted-foreground">Geen opvallende flags op basis van de huidige labels.</p> : taxWarnings.map((w, idx) => (
                  <div key={idx} className={`rounded-lg border p-3 ${w.tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-muted/20'}`}>
                    <div className="flex gap-2 font-medium text-sm"><ShieldAlert className="h-4 w-4 text-amber-600" /> {w.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{w.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Laatste transacties</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Symbool</TableHead>
                    <TableHead className="text-right">Aantal</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                    <TableHead className="text-right">Kosten/taks</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 50).map(t => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.transaction_date).toLocaleDateString('nl-BE')}</TableCell>
                      <TableCell><Badge variant="outline">{t.transaction_type}</Badge></TableCell>
                      <TableCell className="font-medium">{t.symbol}</TableCell>
                      <TableCell className="text-right font-mono">{t.quantity.toLocaleString('nl-BE', { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(t.amount || t.quantity * t.price, t.currency)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(t.fees + t.taxes, t.currency)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTransaction(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AssetDialog open={assetOpen} onOpenChange={setAssetOpen} form={assetForm} setForm={setAssetForm} onSave={saveAsset} />
      <TransactionDialog open={txOpen} onOpenChange={setTxOpen} assets={assets} form={txForm} setForm={setTxForm} onSave={saveTransaction} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} text={csvText} setText={setCsvText} onImport={importCsv} onFileImport={importBoleroFile} />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, tone = 'neutral' }: { icon: LucideIcon; label: string; value: string; sub?: string; tone?: 'neutral' | 'good' | 'bad' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-primary';
  return (
    <div className="stat-card">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className={`h-5 w-5 ${toneClass}`} /></div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function EmptyPortfolio({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="py-12 text-center text-muted-foreground space-y-3">
      <PieIcon className="h-10 w-10 mx-auto opacity-40" />
      <p>Nog geen portfolio-assets. Voeg een ETF, aandeel, cashpositie of obligatie toe.</p>
      <Button variant="outline" onClick={onAdd}>Eerste asset toevoegen</Button>
    </div>
  );
}

function ChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <Card className="border-border/50">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Geen data.</p> : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data} innerRadius={58} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TaxLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 rounded-md border border-border/50 p-3"><span className="text-sm text-muted-foreground">{label}</span><span className="font-mono font-semibold">{value}</span></div>;
}

function CockpitLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className="font-mono font-semibold text-right">{value}</div>
    </div>
  );
}

function AllocationTable({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">Geen data.</p>;
  return (
    <div className="space-y-2">
      {data.map((row, idx) => {
        const weight = total > 0 ? (row.value / total) * 100 : 0;
        return (
          <div key={row.name} className="space-y-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium">{row.name}</span>
              <span className="font-mono">{fmt(row.value)} · {pct(weight)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, weight)}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssetDialog({ open, onOpenChange, form, setForm, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ReturnType<typeof emptyAsset>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyAsset>>>;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Asset toevoegen</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Symbool" value={form.symbol} onChange={v => setForm(f => ({ ...f, symbol: v }))} />
          <Field label="Naam" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
          <Field label="ISIN" value={form.isin} onChange={v => setForm(f => ({ ...f, isin: v }))} />
          <Field label="Broker" value={form.broker} onChange={v => setForm(f => ({ ...f, broker: v }))} />
          <SelectField label="Activaklasse" value={form.asset_class} onChange={v => setForm(f => ({ ...f, asset_class: v }))} options={assetClassLabels} />
          <SelectField label="Tax-profiel" value={form.tax_profile} onChange={v => setForm(f => ({ ...f, tax_profile: v }))} options={Object.fromEntries(Object.entries(taxProfiles).map(([k, v]) => [k, v.label]))} />
          <Field label="Regio" value={form.region} onChange={v => setForm(f => ({ ...f, region: v }))} />
          <Field label="Sector" value={form.sector} onChange={v => setForm(f => ({ ...f, sector: v }))} />
          <Field label="Munt" value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} />
          <Field label="Laatste prijs" value={form.current_price} onChange={v => setForm(f => ({ ...f, current_price: v }))} />
          <Field label="Doelgewicht" value={form.target_weight} onChange={v => setForm(f => ({ ...f, target_weight: v }))} suffix="punten" />
          <Field label="TER" value={form.expense_ratio} onChange={v => setForm(f => ({ ...f, expense_ratio: v }))} suffix="%" />
          <SwitchField label="Accumulerend" checked={form.is_accumulating} onChange={v => setForm(f => ({ ...f, is_accumulating: v }))} />
          <SwitchField label="UCITS/KID oké" checked={form.is_ucits} onChange={v => setForm(f => ({ ...f, is_ucits: v }))} />
          <SwitchField label="Obligatiecomponent" checked={form.has_bond_component} onChange={v => setForm(f => ({ ...f, has_bond_component: v }))} />
          <div className="md:col-span-2">
            <Label className="text-xs">Notities</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button><Button onClick={onSave}>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransactionDialog({ open, onOpenChange, assets, form, setForm, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: PortfolioAsset[];
  form: ReturnType<typeof emptyTx>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyTx>>>;
  onSave: () => void;
}) {
  const selected = assets.find(a => a.id === form.asset_id);
  const gross = parseNum(form.amount) || parseNum(form.quantity) * parseNum(form.price);
  const estimatedTax = selected && ['buy', 'sell'].includes(form.transaction_type) ? gross * ((taxProfiles[selected.tax_profile] || taxProfiles.etf_standard).tobRate) : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transactie toevoegen</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Asset</Label>
            <Select value={form.asset_id} onValueChange={v => setForm(f => ({ ...f, asset_id: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Kies asset" /></SelectTrigger>
              <SelectContent>{assets.map(a => <SelectItem key={a.id} value={a.id}>{a.symbol} - {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum" type="date" value={form.transaction_date} onChange={v => setForm(f => ({ ...f, transaction_date: v }))} />
            <SelectField label="Type" value={form.transaction_type} onChange={v => setForm(f => ({ ...f, transaction_type: v as TxType }))} options={{ buy: 'Koop', sell: 'Verkoop', dividend: 'Dividend', deposit: 'Storting', withdrawal: 'Opname', fee: 'Kost', tax: 'Tax' }} />
            <Field label="Aantal" value={form.quantity} onChange={v => setForm(f => ({ ...f, quantity: v }))} />
            <Field label="Prijs" value={form.price} onChange={v => setForm(f => ({ ...f, price: v }))} />
            <Field label="Bedrag" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} />
            <Field label="Kosten" value={form.fees} onChange={v => setForm(f => ({ ...f, fees: v }))} />
            <Field label="Taks" value={form.taxes} onChange={v => setForm(f => ({ ...f, taxes: v }))} placeholder={estimatedTax ? estimatedTax.toFixed(2) : '0'} />
          </div>
          {estimatedTax > 0 && <p className="text-xs text-muted-foreground flex gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Indicatieve TOB: {fmt(estimatedTax, selected?.currency || 'EUR')}. Laat leeg om automatisch te gebruiken.</p>}
          <div>
            <Label className="text-xs">Notities</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button><Button onClick={onSave}>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, text, setText, onImport, onFileImport }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  setText: (v: string) => void;
  onImport: () => void;
  onFileImport: (file: File) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Brokerbestand importeren</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-3">
          <Label className="text-xs">Bolero Expert portfolio-export (.xlsx)</Label>
          <Input
            type="file"
            accept=".xlsx,.xls"
            className="mt-2"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onFileImport(file);
              e.currentTarget.value = '';
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Herkent de tabel “Portfolio Positions” en gebruikt de posities als huidige portefeuille.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Of plak CSV-transacties van Bolero, DEGIRO, Saxo, Keytrade en Interactive Brokers via kolomnamen zoals datum/date, ISIN, ticker/symbol, buy/sell/type,
          aantal/quantity, prijs/price, kosten/fees, TOB, dividend en roerende voorheffing/withholding tax.
        </p>
        <Textarea value={text} onChange={e => setText(e.target.value)} className="min-h-60 font-mono text-xs" placeholder="Datum;ISIN;Ticker;Type;Aantal;Prijs;Kosten;TOB;Dividend;Roerende voorheffing;Broker&#10;2026-07-01;IE00BK5BQT80;VWCE;BUY;3;110;2,5;0,4;;;Bolero" />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button><Button onClick={onImport}>Importeren</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, suffix, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(options).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(sep).map(v => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
}

function parseBoleroWorkbook(workbook: XLSX.WorkBook): BoleroPosition[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
  const headerIdx = rows.findIndex(row => row.some(cell => normalizeHeader(String(cell)) === 'portfoliopositions'));
  const columnIdx = rows.findIndex((row, idx) => idx > headerIdx && row.some(cell => normalizeHeader(String(cell)) === 'isin') && row.some(cell => normalizeHeader(String(cell)) === 'huidigewaarde'));
  if (columnIdx < 0) return [];
  const header = rows[columnIdx].map(cell => normalizeHeader(String(cell)));
  const idx = (name: string) => header.findIndex(h => h === normalizeHeader(name));
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

  return rows.slice(columnIdx + 1)
    .map(row => ({
      type: String(row[typeIdx] || '').trim(),
      currency: String(row[currencyIdx] || 'EUR').trim() || 'EUR',
      quantity: parseNum(row[quantityIdx]),
      name: String(row[nameIdx] || '').trim(),
      avgPrice: parseNum(row[avgIdx]),
      purchaseValue: parseNum(row[purchaseIdx]),
      currentQuote: parseNum(row[quoteIdx]),
      currentValue: parseNum(row[currentIdx]),
      eurValue: parseNum(row[eurIdx]),
      returnPct: parseNum(row[returnPctIdx]),
      market: String(row[marketIdx] || '').trim(),
      returnValue: parseNum(row[returnValueIdx]),
      isin: String(row[isinIdx] || '').trim(),
    }))
    .filter(row => {
      const t = row.type.toLowerCase();
      if (!t || t.startsWith('bolero') || t.startsWith('mail') || t.startsWith('web')) return false;
      return row.eurValue !== 0 || row.quantity > 0 || t === 'cash';
    });
}

function boleroSymbol(position: BoleroPosition) {
  if (position.isin) return position.isin.toUpperCase();
  if (position.type.toLowerCase() === 'cash') return `CASH-${position.currency || 'EUR'}`;
  return position.name.slice(0, 20).replace(/[^A-Z0-9]+/gi, '_').toUpperCase();
}

function boleroAssetClass(type: string) {
  const t = type.toLowerCase();
  if (t.includes('cash')) return 'cash';
  if (t.includes('etf')) return 'equity_etf';
  if (t.includes('oblig')) return 'bond';
  if (t.includes('fonds')) return 'equity_etf';
  if (t.includes('aandelen') || t.includes('aandeel')) return 'equity_stock';
  return 'other';
}

function boleroTaxProfile(position: BoleroPosition) {
  const assetClass = boleroAssetClass(position.type);
  if (assetClass === 'cash') return 'cash';
  if (assetClass === 'bond') return 'bond_or_money_market';
  if (assetClass === 'equity_stock') return 'stock';
  return 'etf_standard';
}

function boleroRegion(market: string) {
  const m = market.toLowerCase();
  if (m.includes('usa') || m.includes('nasdaq') || m.includes('nyse')) return 'Verenigde Staten';
  if (m.includes('amsterdam') || m.includes('frankfurt') || m.includes('euronext') || m.includes('xetra')) return 'Europa';
  return market || 'Onbekend';
}

function boleroPositionToAsset(position: BoleroPosition, userId: string) {
  const isCash = position.type.toLowerCase() === 'cash';
  const currentPriceEur = isCash ? 1 : position.eurValue / Math.max(position.quantity, 1);
  const name = isCash ? `Bolero cash ${position.currency}` : position.name;
  return {
    user_id: userId,
    symbol: boleroSymbol(position),
    isin: position.isin || null,
    name,
    asset_class: boleroAssetClass(position.type),
    region: boleroRegion(position.market),
    sector: position.type.toLowerCase().includes('etf') ? 'broad' : 'onbekend',
    currency: 'EUR',
    broker: 'Bolero',
    current_price: currentPriceEur,
    target_weight: 0,
    expense_ratio: 0,
    tax_profile: boleroTaxProfile(position),
    is_accumulating: /\bACC\b|\(ACC\)|-K/i.test(position.name),
    is_ucits: position.type.toLowerCase().includes('etf') ? position.isin.startsWith('IE') || position.isin.startsWith('LU') : true,
    has_bond_component: boleroAssetClass(position.type) === 'bond',
    notes: `Geïmporteerd uit Bolero Expert-export. Originele munt: ${position.currency}; markt: ${position.market || 'n.v.t.'}; originele koers: ${position.currentQuote || position.currentValue}.`,
  };
}

function groupPositions(positions: Position[], keyFn: (p: Position) => string) {
  const map = new Map<string, number>();
  positions.forEach(p => {
    const key = keyFn(p).trim() || 'Onbekend';
    map.set(key, (map.get(key) || 0) + p.marketValue);
  });
  return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function pick(row: Record<string, string>, keys: string[]) {
  const normalizedEntries = Object.entries(row).map(([k, v]) => [normalizeHeader(k), v] as const);
  const map = new Map(normalizedEntries);
  for (const key of keys) {
    const val = map.get(normalizeHeader(key));
    if (val != null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

function normalizeHeader(header: string) {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeBrokerRow(row: Record<string, string>) {
  const rawType = pick(row, ['type', 'transaction_type', 'actie', 'transactie', 'transaction', 'omschrijving', 'description']);
  const dividend = parseNum(pick(row, ['dividend', 'gross dividend', 'bruto dividend', 'dividendbedrag']));
  const withholding = parseNum(pick(row, ['roerende voorheffing', 'withholding tax', 'withholding', 'dividend tax', 'bronheffing']));
  const fees = parseNum(pick(row, ['fees', 'fee', 'kosten', 'commissie', 'commission', 'brokerage fees']));
  const tob = parseNum(pick(row, ['tob', 'beurstaks', 'taxe bourse', 'stock exchange tax']));
  const amount = parseNum(pick(row, ['amount', 'bedrag', 'net amount', 'nettobedrag', 'waarde', 'total', 'totaal']));
  const price = parseNum(pick(row, ['price', 'prijs', 'koers', 'execution price', 'trade price']));
  const quantity = parseNum(pick(row, ['quantity', 'aantal', 'qty', 'units', 'effecten']));
  const inferredType = dividend > 0 ? 'dividend' : normalizeTxType(rawType);
  return {
    date: normalizeDate(pick(row, ['date', 'datum', 'trade date', 'transaction date', 'uitvoeringsdatum'])),
    isin: pick(row, ['isin', 'isincode', 'instrument isin']),
    symbol: pick(row, ['symbol', 'ticker', 'symbool', 'instrument', 'product', 'security', 'effect', 'naam']),
    type: inferredType,
    quantity,
    price,
    amount: dividend > 0 ? dividend : amount || quantity * price,
    fees,
    taxes: tob + withholding + parseNum(pick(row, ['taxes', 'tax', 'taks', 'belasting'])),
    currency: pick(row, ['currency', 'munt', 'devies', 'ccy']) || 'EUR',
    broker: pick(row, ['broker', 'platform']) || inferBroker(row),
    notes: pick(row, ['notes', 'notitie', 'comment', 'memo', 'description', 'omschrijving']),
  };
}

function inferBroker(row: Record<string, string>) {
  const joined = Object.values(row).join(' ').toLowerCase();
  if (joined.includes('bolero')) return 'Bolero';
  if (joined.includes('degiro') || joined.includes('de giro')) return 'DEGIRO';
  if (joined.includes('saxo')) return 'Saxo';
  if (joined.includes('keytrade')) return 'Keytrade';
  if (joined.includes('interactive brokers') || joined.includes('ibkr')) return 'Interactive Brokers';
  return '';
}

function normalizeDate(value: string) {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function normalizeTxType(v: string): TxType {
  const s = v.toLowerCase();
  if (['sell', 'verkoop', 'sale'].includes(s)) return 'sell';
  if (['dividend', 'div'].includes(s)) return 'dividend';
  if (['deposit', 'storting'].includes(s)) return 'deposit';
  if (['withdrawal', 'opname'].includes(s)) return 'withdrawal';
  if (['fee', 'kost', 'kosten'].includes(s)) return 'fee';
  if (['tax', 'taks', 'belasting', 'tob'].includes(s)) return 'tax';
  return 'buy';
}
