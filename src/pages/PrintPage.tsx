import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Briefcase, FileText, Loader2, PiggyBank, Printer, Search, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PrintSection = 'income' | 'portfolio' | 'pension' | 'total' | 'queries';

type IncomeRecord = {
  id: string;
  record_date: string;
  income_type: string;
  nomenclature_code: string;
  description: string | null;
  quantity: number;
  total_amount: number;
  netto: number;
};

type PortfolioAsset = {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  currency: string;
  quantity: number;
  purchase_price: number;
  purchase_date: string;
  notes: string | null;
};

type PensionRecord = {
  snapshot_date: string;
  pensioenreserve: number;
  overlijdensdekking: number;
  pensioenreserve_vapz: number;
  vap_riziv_toelage: number;
};

type IptRecord = {
  snapshot_date: string;
  opgebouwde_reserve: number;
  overlijdenskapitaal: number;
  jaarpremie: number;
};

type QuoteEntry = {
  symbol: string;
  resolvedSymbol?: string;
  quote?: { c?: number; pc?: number };
  profile?: { currency?: string; name?: string };
};

const SECTION_OPTIONS: Array<{ key: PrintSection; label: string; icon: any }> = [
  { key: 'income', label: 'Inkomen', icon: BarChart3 },
  { key: 'portfolio', label: 'Beleggingen', icon: Briefcase },
  { key: 'pension', label: 'Pensioen', icon: PiggyBank },
  { key: 'total', label: 'Totaal', icon: Wallet },
  { key: 'queries', label: 'Queries', icon: Search },
];

const START_OF_YEAR = `${new Date().getFullYear()}-01-01`;
const TODAY = new Date().toISOString().slice(0, 10);

export default function PrintPage() {
  const { user } = useAuth();
  const [sections, setSections] = useState<Record<PrintSection, boolean>>({
    income: true,
    portfolio: true,
    pension: true,
    total: true,
    queries: true,
  });
  const [fromDate, setFromDate] = useState(START_OF_YEAR);
  const [toDate, setToDate] = useState(TODAY);
  const [queryCode, setQueryCode] = useState('');
  const [queryType, setQueryType] = useState('all');
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteEntry>>({});
  const [pensionRecords, setPensionRecords] = useState<PensionRecord[]>([]);
  const [iptRecords, setIptRecords] = useState<IptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadReportData();
  }, [user, fromDate, toDate]);

  useEffect(() => {
    if (!queryCode && incomeRecords.length > 0) {
      const first = [...new Set(incomeRecords.map((record) => record.nomenclature_code).filter(Boolean))].sort()[0];
      if (first) setQueryCode(first);
    }
  }, [incomeRecords, queryCode]);

  async function loadReportData() {
    if (!user) return;
    setLoading(true);
    const [incomeRes, assetRes, pensionRes, iptRes] = await Promise.all([
      supabase.from('income_records')
        .select('id, record_date, income_type, nomenclature_code, description, quantity, total_amount, netto')
        .eq('user_id', user.id)
        .gte('record_date', fromDate)
        .lte('record_date', toDate)
        .order('record_date', { ascending: true }),
      (supabase as any).from('portfolio_assets')
        .select('id, symbol, name, asset_type, currency, quantity, purchase_price, purchase_date, notes')
        .eq('user_id', user.id)
        .order('purchase_date', { ascending: false }),
      (supabase as any).from('pension_records')
        .select('snapshot_date, pensioenreserve, overlijdensdekking, pensioenreserve_vapz, vap_riziv_toelage')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: true }),
      supabase.from('pension_ipt_records')
        .select('snapshot_date, opgebouwde_reserve, overlijdenskapitaal, jaarpremie')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: true }),
    ]);

    setIncomeRecords(((incomeRes.data as IncomeRecord[]) || []).map(normalizeIncome));
    const nextAssets = ((assetRes.data as PortfolioAsset[]) || []).map(normalizeAsset);
    setAssets(nextAssets);
    setPensionRecords(((pensionRes.data as PensionRecord[]) || []).map(normalizePension));
    setIptRecords(((iptRes.data as IptRecord[]) || []).map(normalizeIpt));
    setLoading(false);
    void loadQuotes(nextAssets);
  }

  async function loadQuotes(nextAssets = assets) {
    const symbols = [...new Set(nextAssets.filter((asset) => !isCash(asset)).map((asset) => asset.symbol))];
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    setQuoteLoading(true);
    const { data } = await supabase.functions.invoke('market-data', {
      body: { action: 'quotes', symbols },
    });
    const nextQuotes: Record<string, QuoteEntry> = {};
    (data?.quotes || []).forEach((entry: QuoteEntry) => {
      nextQuotes[entry.symbol] = entry;
    });
    setQuotes(nextQuotes);
    setQuoteLoading(false);
  }

  const selectedSections = SECTION_OPTIONS.filter((section) => sections[section.key]);
  const availableCodes = useMemo(() => [...new Set(incomeRecords.map((record) => record.nomenclature_code).filter(Boolean))].sort(), [incomeRecords]);

  const incomeSummary = useMemo(() => {
    const totalNetto = incomeRecords.reduce((sum, record) => sum + record.netto, 0);
    const totalBruto = incomeRecords.reduce((sum, record) => sum + record.total_amount, 0);
    const totalQuantity = incomeRecords.reduce((sum, record) => sum + record.quantity, 0);
    const byType = groupSum(incomeRecords, (record) => typeLabel(record.income_type), (record) => record.netto);
    const byCode = groupSum(incomeRecords, (record) => record.nomenclature_code, (record) => record.quantity)
      .slice(0, 8);
    return { totalNetto, totalBruto, totalQuantity, byType, byCode };
  }, [incomeRecords]);

  const portfolioRows = useMemo(() => assets.map((asset) => {
    const quote = quotes[asset.symbol]?.quote;
    const livePrice = Number(quote?.c || 0);
    const referenceValue = asset.quantity * asset.purchase_price;
    const currentPrice = livePrice > 0 ? livePrice : asset.purchase_price;
    const currentValue = asset.quantity * currentPrice;
    return {
      asset,
      currentPrice,
      currentValue,
      referenceValue,
      gain: currentValue - referenceValue,
      live: livePrice > 0,
    };
  }), [assets, quotes]);

  const portfolioSummary = useMemo(() => {
    const reference = portfolioRows.reduce((sum, row) => sum + row.referenceValue, 0);
    const current = portfolioRows.reduce((sum, row) => sum + row.currentValue, 0);
    const liveCount = portfolioRows.filter((row) => row.live).length;
    return { reference, current, gain: current - reference, liveCount };
  }, [portfolioRows]);

  const pensionSummary = useMemo(() => {
    const pension = pensionRecords[pensionRecords.length - 1] || null;
    const ipt = iptRecords[iptRecords.length - 1] || null;
    const reserve = (pension?.pensioenreserve || 0) + (ipt?.opgebouwde_reserve || 0);
    const deathCoverage = (pension?.overlijdensdekking || 0) + (ipt?.overlijdenskapitaal || 0);
    const latestDate = [pension?.snapshot_date, ipt?.snapshot_date].filter(Boolean).sort().pop() || '';
    return { pension, ipt, reserve, deathCoverage, latestDate };
  }, [pensionRecords, iptRecords]);

  const queryRows = useMemo(() => incomeRecords.filter((record) =>
    record.nomenclature_code === queryCode &&
    (queryType === 'all' || record.income_type === queryType)
  ), [incomeRecords, queryCode, queryType]);

  const querySummary = useMemo(() => ({
    quantity: queryRows.reduce((sum, record) => sum + record.quantity, 0),
    netto: queryRows.reduce((sum, record) => sum + record.netto, 0),
    bruto: queryRows.reduce((sum, record) => sum + record.total_amount, 0),
  }), [queryRows]);

  const totalSummary = {
    liquid: portfolioSummary.current,
    pension: pensionSummary.reserve,
    netWorth: portfolioSummary.current + pensionSummary.reserve,
    periodIncome: incomeSummary.totalNetto,
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in print-page">
      <div className="no-print flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Printoverzicht</h1>
          <p className="mt-1 text-muted-foreground">Kies welke onderdelen je in een grafisch rapport wilt afdrukken.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => loadQuotes()} disabled={quoteLoading || assets.length === 0}>
            {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Koersen verversen
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print rapport
          </Button>
        </div>
      </div>

      <Card className="no-print border-border/50">
        <CardContent className="grid gap-4 pt-6 lg:grid-cols-[1fr_1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Van</Label>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tot</Label>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Query code</Label>
              <Select value={queryCode} onValueChange={setQueryCode}>
                <SelectTrigger><SelectValue placeholder="Kies nomenclatuur" /></SelectTrigger>
                <SelectContent>
                  {availableCodes.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Query type</Label>
              <Select value={queryType} onValueChange={setQueryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle types</SelectItem>
                  <SelectItem value="ambulatory">Ambulant</SelectItem>
                  <SelectItem value="hospitalized">Hospitalisatie</SelectItem>
                  <SelectItem value="associatie">Associatie</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECTION_OPTIONS.map(({ key, label, icon: Icon }) => (
              <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <Checkbox checked={sections[key]} onCheckedChange={(checked) => setSections((prev) => ({ ...prev, [key]: checked === true }))} />
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <article className="print-report overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
        <header className="print-cover bg-primary p-8 text-primary-foreground">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium opacity-75">MyFinState rapport</p>
              <h2 className="mt-2 text-4xl font-semibold tracking-tight">Financieel overzicht</h2>
              <p className="mt-2 opacity-80">{fromDate} tot {toDate}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 text-sm">
              {new Date().toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' })}
            </div>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            <CoverMetric label="Inkomen" value={money(incomeSummary.totalNetto)} />
            <CoverMetric label="Beleggingen" value={money(portfolioSummary.current)} />
            <CoverMetric label="Pensioen" value={money(pensionSummary.reserve)} />
            <CoverMetric label="Totaal" value={money(totalSummary.netWorth)} />
          </div>
        </header>

        <div className="space-y-8 p-6 md:p-8">
          {sections.income && (
            <ReportSection title="Overzicht inkomen" icon={<BarChart3 className="h-5 w-5" />}>
              <MetricGrid>
                <ReportMetric label="Netto inkomen" value={money(incomeSummary.totalNetto)} />
                <ReportMetric label="Bruto totaal" value={money(incomeSummary.totalBruto)} />
                <ReportMetric label="Prestaties" value={incomeSummary.totalQuantity.toLocaleString('nl-BE')} />
                <ReportMetric label="Records" value={String(incomeRecords.length)} />
              </MetricGrid>
              <TwoColumn>
                <MiniTable title="Netto per type" rows={incomeSummary.byType.map((row) => [row.label, money(row.value)])} />
                <MiniTable title="Top nomenclatuur op aantal" rows={incomeSummary.byCode.map((row) => [row.label, row.value.toLocaleString('nl-BE')])} />
              </TwoColumn>
            </ReportSection>
          )}

          {sections.portfolio && (
            <ReportSection title="Beleggingen" icon={<Briefcase className="h-5 w-5" />}>
              <MetricGrid>
                <ReportMetric label="Actuele waarde" value={money(portfolioSummary.current)} />
                <ReportMetric label="Referentiewaarde" value={money(portfolioSummary.reference)} />
                <ReportMetric label="Resultaat" value={money(portfolioSummary.gain)} tone={portfolioSummary.gain >= 0 ? 'positive' : 'negative'} />
                <ReportMetric label="Live posities" value={`${portfolioSummary.liveCount}/${portfolioRows.length}`} />
              </MetricGrid>
              <DataTable
                columns={['Ticker', 'Naam', 'Aantal', 'Waarde', 'Status']}
                rows={portfolioRows.slice(0, 12).map((row) => [
                  row.asset.symbol,
                  row.asset.name,
                  row.asset.quantity.toLocaleString('nl-BE'),
                  money(row.currentValue),
                  row.live ? 'Live' : 'Snapshot',
                ])}
              />
            </ReportSection>
          )}

          {sections.pension && (
            <ReportSection title="Pensioen" icon={<PiggyBank className="h-5 w-5" />}>
              <MetricGrid>
                <ReportMetric label="Totale reserve" value={money(pensionSummary.reserve)} />
                <ReportMetric label="Overlijdensdekking" value={money(pensionSummary.deathCoverage)} />
                <ReportMetric label="VAPZ/RIZIV" value={money(pensionSummary.pension?.pensioenreserve || 0)} />
                <ReportMetric label="IPT" value={money(pensionSummary.ipt?.opgebouwde_reserve || 0)} />
              </MetricGrid>
              <p className="text-sm text-muted-foreground">Laatste pensioensnapshot: {pensionSummary.latestDate || 'nog geen data'}</p>
            </ReportSection>
          )}

          {sections.total && (
            <ReportSection title="Totaal overzicht" icon={<Wallet className="h-5 w-5" />}>
              <MetricGrid>
                <ReportMetric label="Beleggingen" value={money(totalSummary.liquid)} />
                <ReportMetric label="Pensioenreserve" value={money(totalSummary.pension)} />
                <ReportMetric label="Netto vermogen" value={money(totalSummary.netWorth)} />
                <ReportMetric label="Inkomen periode" value={money(totalSummary.periodIncome)} />
              </MetricGrid>
            </ReportSection>
          )}

          {sections.queries && (
            <ReportSection title="Queries" icon={<Search className="h-5 w-5" />}>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="outline">Code {queryCode || '-'}</Badge>
                <Badge variant="outline">{queryType === 'all' ? 'Alle types' : typeLabel(queryType)}</Badge>
                <Badge variant="outline">{queryRows.length} record(s)</Badge>
              </div>
              <MetricGrid>
                <ReportMetric label="Aantal prestaties" value={querySummary.quantity.toLocaleString('nl-BE')} />
                <ReportMetric label="Netto" value={money(querySummary.netto)} />
                <ReportMetric label="Bruto" value={money(querySummary.bruto)} />
                <ReportMetric label="Gemiddeld netto" value={money(queryRows.length ? querySummary.netto / queryRows.length : 0)} />
              </MetricGrid>
              <DataTable
                columns={['Datum', 'Type', 'Aantal', 'Netto']}
                rows={queryRows.slice(0, 20).map((row) => [
                  row.record_date,
                  typeLabel(row.income_type),
                  row.quantity.toLocaleString('nl-BE'),
                  money(row.netto),
                ])}
              />
            </ReportSection>
          )}

          {selectedSections.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              Selecteer minstens een onderdeel om te printen.
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function ReportSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="print-section break-inside-avoid rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-slate-900">
        {icon}
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function ReportMetric({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-700' : 'text-slate-950'}`}>{value}</p>
    </div>
  );
}

function CoverMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-4">
      <p className="text-xs opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function TwoColumn({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function MiniTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 ? <div className="px-3 py-3 text-sm text-slate-500">Geen data</div> : rows.map((row) => (
          <div key={row.join('|')} className="flex justify-between gap-4 px-3 py-2 text-sm">
            <span>{row[0]}</span>
            <strong>{row[1]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>{columns.map((column) => <th key={column} className="px-3 py-2 text-left font-medium text-slate-600">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td className="px-3 py-4 text-center text-slate-500" colSpan={columns.length}>Geen data</td></tr>
          ) : rows.map((row, index) => (
            <tr key={`${index}-${row.join('|')}`}>{row.map((cell, idx) => <td key={`${idx}-${cell}`} className="px-3 py-2">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function normalizeIncome(row: IncomeRecord): IncomeRecord {
  return {
    ...row,
    quantity: Number(row.quantity || 0),
    total_amount: Number(row.total_amount || 0),
    netto: Number(row.netto || 0),
  };
}

function normalizeAsset(row: PortfolioAsset): PortfolioAsset {
  return {
    ...row,
    quantity: Number(row.quantity || 0),
    purchase_price: Number(row.purchase_price || 0),
  };
}

function normalizePension(row: PensionRecord): PensionRecord {
  return {
    ...row,
    pensioenreserve: Number(row.pensioenreserve || 0),
    overlijdensdekking: Number(row.overlijdensdekking || 0),
    pensioenreserve_vapz: Number(row.pensioenreserve_vapz || 0),
    vap_riziv_toelage: Number(row.vap_riziv_toelage || 0),
  };
}

function normalizeIpt(row: IptRecord): IptRecord {
  return {
    ...row,
    opgebouwde_reserve: Number(row.opgebouwde_reserve || 0),
    overlijdenskapitaal: Number(row.overlijdenskapitaal || 0),
    jaarpremie: Number(row.jaarpremie || 0),
  };
}

function groupSum<T>(rows: T[], labelFn: (row: T) => string, valueFn: (row: T) => number) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = labelFn(row) || 'Onbekend';
    map.set(label, (map.get(label) || 0) + valueFn(row));
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function typeLabel(type: string) {
  if (type === 'ambulatory') return 'Ambulant';
  if (type === 'hospitalized') return 'Hospitalisatie';
  if (type === 'associatie') return 'Associatie';
  return type || 'Onbekend';
}

function isCash(asset: PortfolioAsset) {
  return asset.symbol.toUpperCase().startsWith('CASH-') || `${asset.name} ${asset.notes || ''}`.toLowerCase().includes('cash');
}

function money(value: number) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0);
}
