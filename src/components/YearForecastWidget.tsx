import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

type MonthTotals = {
  month: string;
  ambulant: number;
  gehospitaliseerd: number;
  associatie: number;
  netto: number;
};

const fmt = (value: number) => `€${value.toLocaleString('nl-BE', { maximumFractionDigits: 0 })}`;
const pct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export function YearForecastWidget({
  year,
  monthlyData,
  previousYearTotal,
}: {
  year: number;
  monthlyData: MonthTotals[];
  previousYearTotal: number;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const elapsedMonths = year < currentYear ? 12 : year > currentYear ? 0 : currentMonth;
  const completedMonths = monthlyData.filter((m, idx) => m.netto > 0 && (year !== currentYear || idx + 1 <= currentMonth));
  const yearToDate = monthlyData.reduce((sum, month) => sum + month.netto, 0);
  const activeAverage = completedMonths.length > 0 ? yearToDate / completedMonths.length : 0;
  const calendarAverage = elapsedMonths > 0 ? yearToDate / elapsedMonths : 0;
  const projectedYear = year >= currentYear && completedMonths.length > 0
    ? yearToDate + activeAverage * Math.max(0, 12 - elapsedMonths)
    : yearToDate;
  const conservativeYear = year >= currentYear && elapsedMonths > 0
    ? calendarAverage * 12
    : projectedYear;
  const previousDelta = previousYearTotal > 0 ? projectedYear - previousYearTotal : null;
  const previousDeltaPct = previousDelta !== null ? (previousDelta / previousYearTotal) * 100 : null;
  const projectedMonthly = projectedYear / 12;
  const trendPositive = (previousDelta ?? 0) >= 0;

  if (completedMonths.length === 0 && yearToDate === 0) {
    return (
      <Card className="data-card border-dashed">
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            <p className="font-medium">Nog geen forecast mogelijk</p>
            <p className="text-sm text-muted-foreground">Voeg inkomsten toe om een jaarprojectie voor {year} te zien.</p>
          </div>
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="data-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            Jaarprojectie {year}
          </CardTitle>
          {previousDeltaPct !== null && (
            <Badge className={`${trendPositive ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' : 'bg-red-500/15 text-red-700 border-red-500/30'} gap-1`}>
              {trendPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {pct(previousDeltaPct)} vs vorig jaar
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-4">
          <ForecastMetric label="Projectie netto" value={fmt(projectedYear)} helper={`${completedMonths.length} actieve maand${completedMonths.length === 1 ? '' : 'en'}`} highlight />
          <ForecastMetric label="Tot nu toe" value={fmt(yearToDate)} helper={`Gemiddeld ${fmt(activeAverage)} / actieve maand`} />
          <ForecastMetric label="Conservatief" value={fmt(conservativeYear)} helper="Op kalendergemiddelde" />
          <ForecastMetric label="Maandtempo" value={fmt(projectedMonthly)} helper="Nodig voor dit projectiepad" />
        </div>
        <div className="mt-4 rounded-2xl bg-muted/50 p-3 text-sm text-muted-foreground">
          <Wallet className="mr-2 inline h-4 w-4 text-primary" />
          Projectie gebruikt je huidige actieve maandgemiddelde. Maanden zonder data tellen mee in het conservatieve scenario.
        </div>
      </CardContent>
    </Card>
  );
}

function ForecastMetric({ label, value, helper, highlight = false }: { label: string; value: string; helper: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? 'border-primary/20 bg-primary/5' : 'border-border/50 bg-card/80'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
