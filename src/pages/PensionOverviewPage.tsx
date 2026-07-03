import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  FileText,
  Loader2,
  PiggyBank,
  Shield,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useDataVersion } from '@/hooks/useDataVersion';
import { supabase } from '@/integrations/supabase/client';

interface PensionRecord {
  id: string;
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  pensioenreserve_vapz: number;
  vap_riziv_toelage: number;
}

interface IptRecord {
  id: string;
  snapshot_date: string;
  year: number;
  opgebouwde_reserve: number;
  overlijdenskapitaal: number;
  jaarpremie: number;
  winst_uit_beleggingen: number;
}

const fmt = (value: number) => `\u20ac${(value || 0).toLocaleString('nl-BE', { maximumFractionDigits: 0 })}`;
const fmtDate = (value?: string) => (
  value ? new Date(value).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Geen snapshot'
);

function MetricCard({
  icon: Icon,
  label,
  value,
  previous,
  helper,
}: {
  icon: any;
  label: string;
  value: number;
  previous?: number;
  helper?: string;
}) {
  const delta = previous !== undefined ? value - previous : null;
  const percent = delta !== null && previous && previous > 0 ? (delta / previous) * 100 : null;
  const positive = (delta || 0) >= 0;

  return (
    <Card className="border-border/50">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{fmt(value)}</div>
          </div>
          {delta !== null && (
            <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${positive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
              {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span>{positive ? '+' : ''}{percent !== null ? `${percent.toFixed(1)}%` : fmt(delta)}</span>
            </div>
          )}
        </div>
        {helper && <p className="mt-3 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  );
}

export default function PensionOverviewPage() {
  const { user } = useAuth();
  const version = useDataVersion();
  const [records, setRecords] = useState<PensionRecord[]>([]);
  const [iptRecords, setIptRecords] = useState<IptRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      const [{ data: pensionData }, { data: iptData }] = await Promise.all([
        supabase.from('pension_records').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true }),
        supabase.from('pension_ipt_records').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true }),
      ]);

      setRecords((pensionData as PensionRecord[]) || []);
      setIptRecords((iptData as IptRecord[]) || []);
      setLoading(false);
    })();
  }, [user, version]);

  const overview = useMemo(() => {
    const pension = [...records].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const ipt = [...iptRecords].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const latest = pension[pension.length - 1] || null;
    const previous = pension[pension.length - 2] || null;
    const latestIpt = ipt[ipt.length - 1] || null;
    const previousIpt = ipt[ipt.length - 2] || null;

    const years = new Map<number, { year: number; pensioen: number; ipt: number }>();
    for (const row of pension) {
      years.set(row.year, { ...(years.get(row.year) || { year: row.year, pensioen: 0, ipt: 0 }), pensioen: row.pensioenreserve });
    }
    for (const row of ipt) {
      years.set(row.year, { ...(years.get(row.year) || { year: row.year, pensioen: 0, ipt: 0 }), ipt: row.opgebouwde_reserve });
    }

    const chartData = [...years.values()]
      .sort((a, b) => a.year - b.year)
      .map((row) => ({
        year: String(row.year),
        totaal: row.pensioen + row.ipt,
        pensioen: row.pensioen,
        ipt: row.ipt,
      }));

    const total = (latest?.pensioenreserve || 0) + (latestIpt?.opgebouwde_reserve || 0);
    const previousTotal = previous || previousIpt
      ? (previous?.pensioenreserve || 0) + (previousIpt?.opgebouwde_reserve || 0)
      : undefined;

    return { latest, previous, latestIpt, previousIpt, chartData, total, previousTotal };
  }, [records, iptRecords]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData = records.length > 0 || iptRecords.length > 0;
  const latestDate = [overview.latest?.snapshot_date, overview.latestIpt?.snapshot_date].filter(Boolean).sort().pop();
  const totalDelta = overview.previousTotal !== undefined ? overview.total - overview.previousTotal : null;
  const totalDeltaPct = totalDelta !== null && overview.previousTotal && overview.previousTotal > 0
    ? (totalDelta / overview.previousTotal) * 100
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <PiggyBank className="h-4 w-4" />
            <span>Pensioen</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Kernoverzicht</h1>
          <p className="mt-1 text-muted-foreground">Laatste update: {fmtDate(latestDate)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/pensioen/upload"><Upload className="h-4 w-4" /> VAPZ uploaden</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/pensioen/upload-ipt"><Upload className="h-4 w-4" /> IPT uploaden</Link>
          </Button>
        </div>
      </div>

      {!hasData ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <PiggyBank className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">Nog geen pensioendata</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Upload een VAPZ- of IPT-document om je pensioenreserve, overlijdensdekking en evolutie op te volgen.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/pensioen/upload"><Upload className="h-4 w-4" /> VAPZ uploaden</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/pensioen/upload-ipt"><Upload className="h-4 w-4" /> IPT uploaden</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border/50 bg-muted/20">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Zichtbare pensioenwaarde</p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight">{fmt(overview.total)}</p>
                </div>
                {totalDelta !== null && (
                  <div className={`inline-flex w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${totalDelta >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                    {totalDelta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <span>{totalDelta >= 0 ? '+' : ''}{fmt(totalDelta)}{totalDeltaPct !== null ? ` (${totalDeltaPct.toFixed(1)}%)` : ''} sinds vorige snapshot</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Wallet}
              label="VAPZ/RIZIV reserve"
              value={overview.latest?.pensioenreserve || 0}
              previous={overview.previous?.pensioenreserve}
              helper={`${fmt(overview.latest?.pensioenreserve_vapz || 0)} VAPZ + ${fmt(overview.latest?.vap_riziv_toelage || 0)} RIZIV`}
            />
            <MetricCard
              icon={Briefcase}
              label="IPT reserve"
              value={overview.latestIpt?.opgebouwde_reserve || 0}
              previous={overview.previousIpt?.opgebouwde_reserve}
              helper={overview.latestIpt ? `${fmt(overview.latestIpt.jaarpremie)} jaarpremie` : 'Nog geen IPT snapshot'}
            />
            <MetricCard
              icon={Shield}
              label="Overlijdensdekking"
              value={(overview.latest?.overlijdensdekking || 0) + (overview.latestIpt?.overlijdenskapitaal || 0)}
              previous={(overview.previous?.overlijdensdekking || 0) + (overview.previousIpt?.overlijdenskapitaal || 0)}
              helper="VAPZ en IPT samen"
            />
            <MetricCard
              icon={Stethoscope}
              label="IPT beleggingswinst"
              value={overview.latestIpt?.winst_uit_beleggingen || 0}
              previous={overview.previousIpt?.winst_uit_beleggingen}
              helper="Laatste gekende jaar"
            />
          </div>

          {overview.chartData.length >= 2 && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Evolutie pensioenwaarde</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={overview.chartData} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pension-total" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="year" className="text-xs" />
                      <YAxis tickFormatter={(value) => `\u20ac${(Number(value) / 1000).toFixed(0)}k`} className="text-xs" />
                      <Tooltip
                        formatter={(value: number) => fmt(value)}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      />
                      <Area type="monotone" dataKey="totaal" name="Totaal" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#pension-total)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Button asChild variant="outline" className="h-auto justify-between px-4 py-3">
          <Link to="/pensioen/overzicht">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Alle snapshots</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-between px-4 py-3">
          <Link to="/pensioen/dashboard">
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Detailanalyse</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-between px-4 py-3">
          <Link to="/pensioen/upload">
            <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> VAPZ-document</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-between px-4 py-3">
          <Link to="/pensioen/upload-ipt">
            <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> IPT-document</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
