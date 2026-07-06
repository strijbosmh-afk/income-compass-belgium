import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDataVersion } from '@/hooks/useDataVersion';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Banknote, Briefcase, Landmark, Loader2, PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SIMPLE_CATEGORIES } from '@/lib/pensionCategories';

type RetirementInputs = {
  annualCompanyProfit: number;
  monthlyGrossSalary: number;
  salaryNetRate: number;
  annualDividendGross: number;
  dividendTaxRate: number;
  annualLiquidationReserveGross: number;
  liquidationSetupTaxRate: number;
  liquidationDistributionTaxRate: number;
  liquidationWaitYears: number;
  annualIptContribution: number;
  iptReturnRate: number;
  iptNetPayoutRate: number;
  privateSavingsRate: number;
  extraPrivateContribution: number;
  privateReturnRate: number;
  companyReserveReturnRate: number;
  corporateTaxRate: number;
  legalPensionMonthly: number;
  withdrawalRate: number;
  drawdownYears: number;
  inflationRate: number;
};

type RetirementContext = {
  iptReserve: number;
  otherPensionReserve: number;
  privatePortfolio: number;
  latestPensionDate: string;
  monthlyNetIncome: number;
};

type ProjectionYear = {
  year: number;
  age: number;
  privateCapital: number;
  iptGross: number;
  iptNet: number;
  liquidationNet: number;
  totalCapital: number;
  monthlyBudget: number;
  todayMonthlyBudget: number;
};

type Projection = {
  yearsToRetirement: number;
  retirementYear: number;
  retirementDate: Date;
  ageNow: number;
  final: ProjectionYear;
  chartData: ProjectionYear[];
  annualNetSalary: number;
  annualNetDividend: number;
  annualPrivateContribution: number;
  annualCompanyTax: number;
  annualCompanyFreeCash: number;
  allocation: { name: string; value: number }[];
  warning: string | null;
};

type PolicyRow = {
  note?: string | null;
  snapshot_date?: string | null;
};

type IptContextRow = PolicyRow & {
  opgebouwde_reserve?: number | null;
  eindkapitaal?: number | null;
};

type SimplePensionContextRow = PolicyRow & {
  pensioenreserve?: number | null;
};

type PortfolioContextRow = {
  symbol?: string | null;
  name?: string | null;
  quantity?: number | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  notes?: string | null;
};

type IncomeContextRow = {
  record_date?: string | null;
  netto?: number | null;
};

const BIRTH_DATE = '1976-04-14';
const RETIREMENT_AGE = 67;

const DEFAULT_INPUTS: RetirementInputs = {
  annualCompanyProfit: 180_000,
  monthlyGrossSalary: 5_500,
  salaryNetRate: 52,
  annualDividendGross: 20_000,
  dividendTaxRate: 30,
  annualLiquidationReserveGross: 25_000,
  liquidationSetupTaxRate: 10,
  liquidationDistributionTaxRate: 9.8,
  liquidationWaitYears: 3,
  annualIptContribution: 18_000,
  iptReturnRate: 2.2,
  iptNetPayoutRate: 85,
  privateSavingsRate: 35,
  extraPrivateContribution: 0,
  privateReturnRate: 4,
  companyReserveReturnRate: 2,
  corporateTaxRate: 20,
  legalPensionMonthly: 2_250,
  withdrawalRate: 3.5,
  drawdownYears: 25,
  inflationRate: 2,
};

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6'];

export function RetirementBvbaSimulator() {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [context, setContext] = useState<RetirementContext>({
    iptReserve: 0,
    otherPensionReserve: 0,
    privatePortfolio: 0,
    latestPensionDate: '',
    monthlyNetIncome: 0,
  });
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<RetirementInputs>(DEFAULT_INPUTS);

  const loadContext = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const iptPromise = supabase
      .from('pension_ipt_records')
      .select('*')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true })
      .then(({ data }) => (data || []) as IptContextRow[]);
    const portfolioPromise = supabase
      .from('portfolio_assets')
      .select('symbol,name,quantity,purchase_price,purchase_date,notes')
      .eq('user_id', user.id)
      .then(({ data }) => (data || []) as PortfolioContextRow[]);
    const incomePromise = supabase
      .from('income_records')
      .select('record_date, netto')
      .eq('user_id', user.id)
      .order('record_date', { ascending: false })
      .limit(400)
      .then(({ data }) => (data || []) as IncomeContextRow[]);
    const simplePromises = SIMPLE_CATEGORIES.map((category) => supabase
      .from(category.table)
      .select('*')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true })
      .then(({ data }) => (data || []) as SimplePensionContextRow[]));

    const [iptRows, portfolioRows, incomeRows, ...simpleRows] = await Promise.all([
      iptPromise,
      portfolioPromise,
      incomePromise,
      ...simplePromises,
    ]);

    const iptReserve = latestPerPolicy(iptRows, (row) => Number(row.opgebouwde_reserve || row.eindkapitaal || 0))
      .reduce((sum, value) => sum + value, 0);

    let otherPensionReserve = 0;
    let latestPensionDate = latestDate(iptRows);
    simpleRows.forEach((rows) => {
      otherPensionReserve += latestPerPolicy(rows, (row) => Number(row.pensioenreserve || 0))
        .reduce((sum, value) => sum + value, 0);
      const pensionDates = [latestPensionDate, latestDate(rows)].filter(Boolean).sort();
      latestPensionDate = pensionDates[pensionDates.length - 1] || '';
    });

    const privatePortfolio = estimatePortfolioValue(portfolioRows);
    const monthlyNetIncome = averageRecentMonthlyNet(incomeRows);
    setContext({ iptReserve, otherPensionReserve, privatePortfolio, latestPensionDate, monthlyNetIncome });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadContext();
  }, [user, dataVersion, loadContext]);

  const projection = useMemo(() => calculateProjection(inputs, context), [inputs, context]);

  const update = (key: keyof RetirementInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-secondary/10">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Geboren {formatDate(BIRTH_DATE)}</Badge>
                <Badge variant="outline">Nu {projection.ageNow} jaar</Badge>
                <Badge variant="outline">Pensioenstart {projection.retirementDate.toLocaleDateString('nl-BE')}</Badge>
                <Badge variant="outline">{projection.yearsToRetirement} jaar te gaan</Badge>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">BVBA & pensioen cockpit</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Simuleer loon, dividenden, liquidatiereserve, IPT-stortingen en privebeleggingen tot je wettelijke pensioenstart.
                Dit is een planningsmodel met aanpasbare aannames, geen fiscaal advies.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[620px]">
              <Metric title="Netto maandbudget op pensioen" value={money(projection.final.monthlyBudget)} sub={`Vandaag: ${money(projection.final.todayMonthlyBudget)}`} />
              <Metric title="Kapitaal op pensioen" value={money(projection.final.totalCapital)} sub={`Jaar ${projection.retirementYear}`} />
              <Metric title="Bestaande data" value={money(context.iptReserve + context.otherPensionReserve + context.privatePortfolio)} sub={context.latestPensionDate || `Gem. netto ${money(context.monthlyNetIncome)}/m`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {projection.warning && (
        <Card className="border-amber-300 bg-amber-50/70">
          <CardContent className="flex gap-3 pt-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{projection.warning}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.75fr)_minmax(0,1.25fr)]">
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Briefcase className="h-4 w-4" /> BVBA cashflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <SliderField label="Vrije BVBA winst voor verloning" value={inputs.annualCompanyProfit} min={0} max={400000} step={5000} prefix="EUR " onChange={(v) => update('annualCompanyProfit', v)} />
              <SliderField label="Bruto loon per maand" value={inputs.monthlyGrossSalary} min={0} max={20000} step={250} prefix="EUR " onChange={(v) => update('monthlyGrossSalary', v)} />
              <SliderField label="Netto loonpercentage" value={inputs.salaryNetRate} min={30} max={75} step={1} suffix="%" onChange={(v) => update('salaryNetRate', v)} />
              <SliderField label="Vennootschapsbelasting" value={inputs.corporateTaxRate} min={0} max={35} step={1} suffix="%" onChange={(v) => update('corporateTaxRate', v)} />
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" /> Uitkeringen & reserves</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <SliderField label="Gewoon bruto dividend per jaar" value={inputs.annualDividendGross} min={0} max={150000} step={2500} prefix="EUR " onChange={(v) => update('annualDividendGross', v)} />
              <SliderField label="Dividend RV" value={inputs.dividendTaxRate} min={0} max={35} step={1} suffix="%" onChange={(v) => update('dividendTaxRate', v)} />
              <SliderField label="Liquidatiereserve per jaar" value={inputs.annualLiquidationReserveGross} min={0} max={150000} step={2500} prefix="EUR " onChange={(v) => update('annualLiquidationReserveGross', v)} />
              <SliderField label="Aanslag aanleg liquidatiereserve" value={inputs.liquidationSetupTaxRate} min={0} max={15} step={1} suffix="%" onChange={(v) => update('liquidationSetupTaxRate', v)} />
              <SliderField label="RV bij uitkering liquidatiereserve" value={inputs.liquidationDistributionTaxRate} min={0} max={30} step={0.1} suffix="%" onChange={(v) => update('liquidationDistributionTaxRate', v)} />
              <SliderField label="Wachttijd liquidatiereserve" value={inputs.liquidationWaitYears} min={0} max={7} step={1} suffix=" jaar" onChange={(v) => update('liquidationWaitYears', v)} />
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><PiggyBank className="h-4 w-4" /> IPT & priveopbouw</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <SliderField label="IPT-storting per jaar" value={inputs.annualIptContribution} min={0} max={60000} step={1000} prefix="EUR " onChange={(v) => update('annualIptContribution', v)} />
              <SliderField label="IPT rendement" value={inputs.iptReturnRate} min={0} max={7} step={0.1} suffix="%" onChange={(v) => update('iptReturnRate', v)} />
              <SliderField label="IPT nettofactor bij opname" value={inputs.iptNetPayoutRate} min={70} max={95} step={1} suffix="%" onChange={(v) => update('iptNetPayoutRate', v)} />
              <SliderField label="Prive spaarquote op netto loon + dividend" value={inputs.privateSavingsRate} min={0} max={100} step={1} suffix="%" onChange={(v) => update('privateSavingsRate', v)} />
              <SliderField label="Extra prive inleg per jaar" value={inputs.extraPrivateContribution} min={0} max={100000} step={1000} prefix="EUR " onChange={(v) => update('extraPrivateContribution', v)} />
              <SliderField label="Prive beleggingsrendement" value={inputs.privateReturnRate} min={0} max={9} step={0.1} suffix="%" onChange={(v) => update('privateReturnRate', v)} />
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" /> Pensioenbudget</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <SliderField label="Wettelijk pensioen netto/maand" value={inputs.legalPensionMonthly} min={0} max={5000} step={50} prefix="EUR " onChange={(v) => update('legalPensionMonthly', v)} />
              <SliderField label="Onttrekkingsratio privevermogen" value={inputs.withdrawalRate} min={1} max={6} step={0.1} suffix="%" onChange={(v) => update('withdrawalRate', v)} />
              <SliderField label="Spreiding IPT + liquidatiereserve" value={inputs.drawdownYears} min={10} max={35} step={1} suffix=" jaar" onChange={(v) => update('drawdownYears', v)} />
              <SliderField label="Inflatie voor koopkracht vandaag" value={inputs.inflationRate} min={0} max={5} step={0.1} suffix="%" onChange={(v) => update('inflationRate', v)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric title="Netto loon/jaar" value={money(projection.annualNetSalary)} sub={`${inputs.salaryNetRate}% van bruto`} />
            <Metric title="Netto dividend/jaar" value={money(projection.annualNetDividend)} sub={`${inputs.dividendTaxRate}% RV`} />
            <Metric title="Prive inleg/jaar" value={money(projection.annualPrivateContribution)} sub="Uit loon/dividend + extra" />
            <Metric title="BVBA vrije cash/jaar" value={money(projection.annualCompanyFreeCash)} sub="Na gekozen stromen" tone={projection.annualCompanyFreeCash < 0 ? 'bad' : 'good'} />
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" /> Projectie tot pensioen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projection.chartData}>
                    <defs>
                      <linearGradient id="privateCapital" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="iptCapital" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => compactMoney(Number(value))} tick={{ fontSize: 12 }} width={80} />
                    <Tooltip formatter={(value) => money(Number(value))} />
                    <Area type="monotone" dataKey="privateCapital" name="Privevermogen" stroke="#2563eb" fill="url(#privateCapital)" stackId="1" />
                    <Area type="monotone" dataKey="iptNet" name="IPT netto" stroke="#10b981" fill="url(#iptCapital)" stackId="1" />
                    <Area type="monotone" dataKey="liquidationNet" name="Liquidatiereserve netto" stroke="#f59e0b" fill="#f59e0b33" stackId="1" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> Kapitaalmix op pensioen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={projection.allocation} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}>
                        {projection.allocation.map((item, idx) => <Cell key={item.name} fill={COLORS[idx % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value) => money(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {projection.allocation.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />{item.name}</span>
                      <strong>{money(item.value)}</strong>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Maandbudget in pensioen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Wettelijk', value: inputs.legalPensionMonthly },
                      { name: 'Prive', value: (projection.final.privateCapital * inputs.withdrawalRate / 100) / 12 },
                      { name: 'IPT', value: annuityAnnual(projection.final.iptNet, inputs.drawdownYears) / 12 },
                      { name: 'Liquidatie', value: annuityAnnual(projection.final.liquidationNet, inputs.drawdownYears) / 12 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => compactMoney(Number(value))} tick={{ fontSize: 12 }} width={70} />
                      <Tooltip formatter={(value) => money(Number(value))} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {COLORS.map((color, idx) => <Cell key={color} fill={color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">80%-regel indicatie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Indicatieve jaarlijkse pensioenrente uit IPT + 2de pijler</span>
                <strong>{money(annuityAnnual(projection.final.iptNet + context.otherPensionReserve, inputs.drawdownYears))}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">80% van bruto jaarbezoldiging</span>
                <strong>{money(inputs.monthlyGrossSalary * 12 * 0.8)}</strong>
              </div>
              <Progress value={Math.min(estimateEightyPercentUsage(projection, inputs, context), 100)} />
              <p className="text-xs text-muted-foreground">
                Vereenvoudigde check: de echte 80%-regel houdt rekening met alle aanvullende pensioenplannen en moet door boekhouder/makelaar gevalideerd worden.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-muted/20">
            <CardContent className="grid gap-3 pt-4 text-xs text-muted-foreground md:grid-cols-2">
              <p>Defaults: pensioenstart eerste maand na 67 jaar, dividend RV 30%, liquidatiereserve 10% aanleg en 9,8% uitkering na 3 jaar voor nieuwe reserves, IPT nettofactor 85%.</p>
              <p>De simulator rekent nominale bedragen uit en toont ook koopkracht vandaag via inflatie. Pas de percentages aan als je boekhouder andere aannames gebruikt.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function calculateProjection(inputs: RetirementInputs, context: RetirementContext): Projection {
  const now = new Date();
  const retirementDate = getRetirementDate();
  const yearsToRetirement = Math.max(1, retirementDate.getFullYear() - now.getFullYear());
  const annualGrossSalary = inputs.monthlyGrossSalary * 12;
  const annualNetSalary = annualGrossSalary * (inputs.salaryNetRate / 100);
  const annualNetDividend = inputs.annualDividendGross * (1 - inputs.dividendTaxRate / 100);
  const annualPrivateContribution = ((annualNetSalary + annualNetDividend) * (inputs.privateSavingsRate / 100)) + inputs.extraPrivateContribution;
  const taxableCompanyProfit = Math.max(0, inputs.annualCompanyProfit - annualGrossSalary - inputs.annualIptContribution);
  const annualCompanyTax = taxableCompanyProfit * (inputs.corporateTaxRate / 100);
  const annualCompanyFreeCash = inputs.annualCompanyProfit
    - annualGrossSalary
    - inputs.annualIptContribution
    - annualCompanyTax
    - inputs.annualDividendGross
    - inputs.annualLiquidationReserveGross
    - (inputs.annualLiquidationReserveGross * inputs.liquidationSetupTaxRate / 100);

  let privateCapital = context.privatePortfolio;
  let iptGross = context.iptReserve;
  const reserveEntries: { amount: number; createdIndex: number }[] = [];
  const chartData: ProjectionYear[] = [];

  for (let index = 1; index <= yearsToRetirement; index += 1) {
    privateCapital = (privateCapital + annualPrivateContribution) * (1 + inputs.privateReturnRate / 100);
    iptGross = (iptGross + inputs.annualIptContribution) * (1 + inputs.iptReturnRate / 100);
    reserveEntries.push({
      amount: inputs.annualLiquidationReserveGross * (1 - inputs.liquidationSetupTaxRate / 100),
      createdIndex: index,
    });

    const liquidationNet = reserveEntries.reduce((sum, entry) => {
      const age = index - entry.createdIndex;
      const gross = entry.amount * Math.pow(1 + inputs.companyReserveReturnRate / 100, Math.max(age, 0));
      const taxRate = age >= inputs.liquidationWaitYears ? inputs.liquidationDistributionTaxRate : inputs.dividendTaxRate;
      return sum + gross * (1 - taxRate / 100);
    }, 0);
    const iptNet = iptGross * (inputs.iptNetPayoutRate / 100);
    const monthlyBudget = inputs.legalPensionMonthly
      + (privateCapital * inputs.withdrawalRate / 100) / 12
      + annuityAnnual(iptNet, inputs.drawdownYears) / 12
      + annuityAnnual(liquidationNet, inputs.drawdownYears) / 12;

    chartData.push({
      year: now.getFullYear() + index,
      age: ageAtYear(now.getFullYear() + index),
      privateCapital,
      iptGross,
      iptNet,
      liquidationNet,
      totalCapital: privateCapital + iptNet + liquidationNet + context.otherPensionReserve,
      monthlyBudget,
      todayMonthlyBudget: monthlyBudget / Math.pow(1 + inputs.inflationRate / 100, index),
    });
  }

  const final = chartData[chartData.length - 1];
  const allocation = [
    { name: 'Privevermogen', value: final.privateCapital },
    { name: 'IPT netto', value: final.iptNet },
    { name: 'Liquidatiereserve', value: final.liquidationNet },
    { name: 'Andere pensioenreserves', value: context.otherPensionReserve },
  ].filter((item) => item.value > 0);

  const warning = annualCompanyFreeCash < 0
    ? `De gekozen loon/dividend/IPT/liquidatiereserve vraagt ${money(Math.abs(annualCompanyFreeCash))} meer BVBA-cash per jaar dan de ingestelde winst toelaat.`
    : null;

  return {
    yearsToRetirement,
    retirementYear: retirementDate.getFullYear(),
    retirementDate,
    ageNow: ageNow(),
    final,
    chartData,
    annualNetSalary,
    annualNetDividend,
    annualPrivateContribution,
    annualCompanyTax,
    annualCompanyFreeCash,
    allocation,
    warning,
  };
}

function SliderField({ label, value, min, max, step, prefix = '', suffix = '', onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs">{label}</Label>
        <Input
          type="number"
          value={Number.isInteger(value) ? value : value.toFixed(1)}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          className="h-8 w-28 text-right text-xs"
        />
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next)} />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{prefix}{formatPlain(min)}{suffix}</span>
        <strong>{prefix}{formatPlain(value)}{suffix}</strong>
        <span>{prefix}{formatPlain(max)}{suffix}</span>
      </div>
    </div>
  );
}

function Metric({ title, value, sub, tone = 'neutral' }: { title: string; value: string; sub: string; tone?: 'neutral' | 'good' | 'bad' }) {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className={`mt-1 text-xl font-semibold ${tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-destructive' : ''}`}>{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function estimatePortfolioValue(rows: PortfolioContextRow[]) {
  const latestCash = new Map<string, PortfolioContextRow>();
  let total = 0;
  rows.forEach((row) => {
    const symbol = String(row.symbol || '').toUpperCase();
    const value = Number(row.quantity || 0) * Number(row.purchase_price || 0);
    const isCash = symbol.startsWith('CASH-') || `${row.name || ''} ${row.notes || ''}`.toLowerCase().includes('cash');
    if (!isCash) {
      total += value;
      return;
    }
    const previous = latestCash.get(symbol);
    if (!previous || String(row.purchase_date || '').localeCompare(String(previous.purchase_date || '')) >= 0) {
      latestCash.set(symbol, row);
    }
  });
  latestCash.forEach((row) => {
    total += Number(row.quantity || 0) * Number(row.purchase_price || 0);
  });
  return total;
}

function latestPerPolicy<T extends PolicyRow>(rows: T[], reserveFn: (row: T) => number) {
  const byPolicy = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = String(row.note || '__default__');
    byPolicy.set(key, [...(byPolicy.get(key) || []), row]);
  });
  return [...byPolicy.values()].map((items) => {
    const sortedItems = items.sort((a, b) => String(a.snapshot_date || '').localeCompare(String(b.snapshot_date || '')));
    const latest = sortedItems[sortedItems.length - 1];
    return latest ? reserveFn(latest) : 0;
  });
}

function latestDate<T extends PolicyRow>(rows: T[]) {
  const dates = rows.map((row) => String(row.snapshot_date || '')).filter(Boolean).sort();
  return dates[dates.length - 1] || '';
}

function averageRecentMonthlyNet(rows: IncomeContextRow[]) {
  const byMonth = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(row.record_date || '').slice(0, 7);
    if (!key) return;
    byMonth.set(key, (byMonth.get(key) || 0) + Number(row.netto || 0));
  });
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  if (months.length === 0) return 0;
  return months.reduce((sum, [, value]) => sum + value, 0) / months.length;
}

function getRetirementDate() {
  const birth = new Date(`${BIRTH_DATE}T00:00:00`);
  const retirement = new Date(birth);
  retirement.setFullYear(birth.getFullYear() + RETIREMENT_AGE);
  return new Date(retirement.getFullYear(), retirement.getMonth() + 1, 1);
}

function ageNow() {
  const now = new Date();
  const birth = new Date(`${BIRTH_DATE}T00:00:00`);
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function ageAtYear(year: number) {
  return year - new Date(`${BIRTH_DATE}T00:00:00`).getFullYear();
}

function annuityAnnual(capital: number, years: number) {
  if (years <= 0) return 0;
  return capital / years;
}

function estimateEightyPercentUsage(projection: Projection, inputs: RetirementInputs, context: RetirementContext) {
  const cap = inputs.monthlyGrossSalary * 12 * 0.8;
  if (cap <= 0) return 0;
  const secondPillarAnnual = annuityAnnual(projection.final.iptNet + context.otherPensionReserve, inputs.drawdownYears);
  return (secondPillarAnnual / cap) * 100;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function money(value: number) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatPlain(value: number) {
  return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: value % 1 === 0 ? 0 : 1 }).format(value || 0);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('nl-BE');
}
