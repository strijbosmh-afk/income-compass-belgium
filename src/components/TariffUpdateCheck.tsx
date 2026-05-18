import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, RefreshCw, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { bumpDataVersion } from '@/hooks/useDataVersion';
import { ASSOCIATIE_SHARE } from '@/lib/incomeTypes';

interface NomCode {
  id: string;
  code: string;
  description: string;
  netto_amount: number;
  last_verified_at: string | null;
}

interface Suggestion {
  id: string;
  code: string;
  description: string;
  current: number;
  suggested: number;
  diff: number;
  diffPct: number;
  lastSeen: string; // ISO date
  recordCount: number;
}

const STALE_DAYS = 365;
const MIN_DIFF_PCT = 0.5; // 0.5% threshold

const fmt = (v: number) => `€ ${v.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TariffUpdateCheck({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<NomCode[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [codesRes, recRes] = await Promise.all([
      supabase.from('nomenclature_codes').select('id, code, description, netto_amount, last_verified_at').eq('user_id', user.id),
      supabase.from('income_records').select('nomenclature_code, income_type, unit_amount, record_date').eq('user_id', user.id),
    ]);
    const codeList = ((codesRes.data as any[]) || []) as NomCode[];
    const records = ((recRes.data as any[]) || []);

    // Bereken meest recente effectieve unit_amount per code
    // Associatie-bedragen worden in DB als 50% opgeslagen → terugrekenen naar bruto.
    const latestByCode = new Map<string, { amount: number; date: string; count: number }>();
    for (const r of records) {
      const raw = Number(r.unit_amount || 0);
      if (raw <= 0) continue;
      const bruto = r.income_type === 'associatie' ? raw / ASSOCIATIE_SHARE : raw;
      const prev = latestByCode.get(r.nomenclature_code);
      const count = (prev?.count || 0) + 1;
      if (!prev || r.record_date > prev.date) {
        latestByCode.set(r.nomenclature_code, { amount: bruto, date: r.record_date, count });
      } else {
        latestByCode.set(r.nomenclature_code, { ...prev, count });
      }
    }

    const sugs: Suggestion[] = [];
    for (const c of codeList) {
      const latest = latestByCode.get(c.code);
      if (!latest) continue;
      const current = Number(c.netto_amount || 0);
      const suggested = Math.round(latest.amount * 100) / 100;
      if (current === 0 && suggested === 0) continue;
      const diff = suggested - current;
      const denom = current > 0 ? current : suggested;
      const diffPct = denom > 0 ? Math.abs(diff) / denom * 100 : 0;
      if (diffPct < MIN_DIFF_PCT) continue;
      sugs.push({
        id: c.id, code: c.code, description: c.description,
        current, suggested, diff, diffPct,
        lastSeen: latest.date, recordCount: latest.count,
      });
    }
    sugs.sort((a, b) => b.diffPct - a.diffPct);

    setCodes(codeList);
    setSuggestions(sugs);
    setSelected(new Set(sugs.map(s => s.id)));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // Stale codes (niet geverifieerd in > 12 maanden of nooit)
  const staleCodes = useMemo(() => {
    const cutoff = Date.now() - STALE_DAYS * 86400 * 1000;
    return codes.filter(c => !c.last_verified_at || new Date(c.last_verified_at).getTime() < cutoff);
  }, [codes]);

  const applyBulk = async () => {
    if (!user || selected.size === 0) return;
    setApplying(true);
    const nowIso = new Date().toISOString();
    const toUpdate = suggestions.filter(s => selected.has(s.id));
    let okCount = 0;
    for (const s of toUpdate) {
      const { error } = await supabase
        .from('nomenclature_codes')
        .update({ netto_amount: s.suggested, last_verified_at: nowIso } as any)
        .eq('id', s.id)
        .eq('user_id', user.id);
      if (!error) okCount++;
    }
    setApplying(false);
    toast({
      title: 'Bedragen bijgewerkt',
      description: `${okCount} van ${toUpdate.length} codes aangepast naar de meest recente waarde.`,
    });
    setOpen(false);
    bumpDataVersion();
    onChanged?.();
    await load();
  };

  const markAllVerified = async () => {
    if (!user) return;
    setVerifyingAll(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('nomenclature_codes')
      .update({ last_verified_at: nowIso } as any)
      .eq('user_id', user.id);
    setVerifyingAll(false);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Alle codes geverifieerd', description: 'Verificatiedatum bijgewerkt.' });
    await load();
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return null;
  if (suggestions.length === 0 && staleCodes.length === 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-4 flex items-center gap-3 text-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">RIZIV-tarieven zijn up-to-date.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            RIZIV tarief-controle
            <Badge variant="outline" className="ml-1 text-amber-700 dark:text-amber-400 border-amber-500/40">
              {suggestions.length} afwijking{suggestions.length !== 1 ? 'en' : ''}
              {staleCodes.length > 0 && ` · ${staleCodes.length} verouderd`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {suggestions.length > 0 && (
              <p>
                Voor <strong>{suggestions.length}</strong> code{suggestions.length !== 1 ? 's' : ''} wijkt het opgeslagen netto-bedrag af van het laatst aangerekende tarief in je records.
              </p>
            )}
            {staleCodes.length > 0 && (
              <p className="mt-1">
                <strong>{staleCodes.length}</strong> code{staleCodes.length !== 1 ? 's zijn' : ' is'} al meer dan een jaar niet meer geverifieerd.
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {suggestions.length > 0 && (
              <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Bedragen vergelijken & bijwerken
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={markAllVerified} disabled={verifyingAll} className="gap-2">
              {verifyingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Markeer alle als geverifieerd
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tarieven bijwerken</DialogTitle>
            <DialogDescription>
              Vergelijking van het opgeslagen netto-bedrag met het meest recente bedrag uit je records.
              Associatie-bedragen worden teruggerekend naar het bruto RIZIV-tarief (×2).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left py-2 px-2 w-8">
                    <Checkbox
                      checked={selected.size === suggestions.length && suggestions.length > 0}
                      onCheckedChange={(c) => setSelected(c ? new Set(suggestions.map(s => s.id)) : new Set())}
                    />
                  </th>
                  <th className="text-left py-2 px-2">Code</th>
                  <th className="text-left py-2 px-2">Omschrijving</th>
                  <th className="text-right py-2 px-2">Huidig</th>
                  <th className="text-right py-2 px-2">Voorstel</th>
                  <th className="text-right py-2 px-2">Verschil</th>
                  <th className="text-right py-2 px-2 text-xs">Laatst gezien</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map(s => {
                  const isInc = s.diff > 0;
                  return (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2 px-2">
                        <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">{s.code}</td>
                      <td className="py-2 px-2 max-w-[200px] truncate" title={s.description}>{s.description || '—'}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs">{fmt(s.current)}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs font-semibold">{fmt(s.suggested)}</td>
                      <td className={`py-2 px-2 text-right font-mono text-xs ${isInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isInc ? '+' : ''}{fmt(s.diff)} ({isInc ? '+' : ''}{s.diffPct.toFixed(1)}%)
                      </td>
                      <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                        {new Date(s.lastSeen).toLocaleDateString('nl-BE')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={applyBulk} disabled={applying || selected.size === 0} className="gap-2">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {selected.size} bedrag{selected.size !== 1 ? 'en' : ''} bijwerken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
