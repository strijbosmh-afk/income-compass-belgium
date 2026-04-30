import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useGoals, Goal, GoalPeriodType, GoalIncomeType, GoalMetric } from '@/hooks/useGoals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, Target, TrendingUp, TrendingDown, Minus, Maximize2 } from 'lucide-react';
import { GoalTrendChart } from '@/components/GoalTrendChart';
import { toast } from 'sonner';

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const fmt = (val: number) => `€ ${val.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodLabel = (g: Goal) => {
  if (g.period_type === 'year') return `Jaar ${g.year}`;
  if (g.period_type === 'quarter') return `Q${g.period_value} ${g.year}`;
  return `${MONTH_NAMES[(g.period_value || 1) - 1]} ${g.year}`;
};
const incomeTypeLabel: Record<GoalIncomeType, string> = {
  all: 'Totaal',
  ambulatory: 'Ambulant',
  hospitalized: 'Gehospitaliseerd',
};
const metricLabel: Record<GoalMetric, string> = {
  netto: 'Netto',
  bruto: 'Bruto',
  aandeel_arts: 'Aandeel Arts',
};

type FormState = {
  year: number;
  period_type: GoalPeriodType;
  period_value: number;
  income_type: GoalIncomeType;
  metric: GoalMetric;
  amount: string;
  note: string;
};

const emptyForm = (): FormState => ({
  year: new Date().getFullYear(),
  period_type: 'year',
  period_value: 1,
  income_type: 'all',
  metric: 'netto',
  amount: '',
  note: '',
});

export default function GoalsPage() {
  const { user } = useAuth();
  const { progressList, loading, refresh, records } = useGoals();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState<typeof progressList[number] | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (g: Goal) => {
    setEditing(g);
    setForm({
      year: g.year,
      period_type: g.period_type,
      period_value: g.period_value || 1,
      income_type: g.income_type,
      metric: g.metric,
      amount: String(g.amount),
      note: g.note || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const amt = parseFloat(form.amount.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) {
      toast.error('Geef een geldig bedrag op.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        user_id: user.id,
        year: form.year,
        period_type: form.period_type,
        period_value: form.period_type === 'year' ? null : form.period_value,
        income_type: form.income_type,
        metric: form.metric,
        amount: amt,
        note: form.note || null,
      };
      if (editing) {
        const { error } = await supabase.from('income_goals').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Doel bijgewerkt');
      } else {
        const { error } = await supabase.from('income_goals').insert(payload);
        if (error) throw error;
        toast.success('Doel toegevoegd');
      }
      setOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message?.includes('duplicate') ? 'Dit doel bestaat al.' : (e.message || 'Fout bij opslaan'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: Goal) => {
    if (!confirm(`Doel "${periodLabel(g)} – ${incomeTypeLabel[g.income_type]} ${metricLabel[g.metric]}" verwijderen?`)) return;
    const { error } = await supabase.from('income_goals').delete().eq('id', g.id);
    if (error) toast.error(error.message);
    else { toast.success('Doel verwijderd'); refresh(); }
  };

  const StatusBadge = ({ status }: { status: 'on_track' | 'ahead' | 'behind' | 'no_data' }) => {
    if (status === 'ahead') return <Badge className="bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30 gap-1"><TrendingUp className="h-3 w-3" /> Op koers</Badge>;
    if (status === 'behind') return <Badge className="bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/30 gap-1"><TrendingDown className="h-3 w-3" /> Achterstand</Badge>;
    if (status === 'no_data') return <Badge variant="outline" className="gap-1"><Minus className="h-3 w-3" /> Geen data</Badge>;
    return <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"><Target className="h-3 w-3" /> On track</Badge>;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Doelstellingen</h1>
          <p className="text-muted-foreground mt-1">Definieer financiële doelen per jaar, kwartaal of maand en volg je voortgang.</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nieuw doel</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : progressList.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground space-y-3">
            <Target className="h-10 w-10 mx-auto opacity-40" />
            <p>Nog geen doelen ingesteld.</p>
            <Button onClick={openNew} variant="outline" size="sm" className="gap-2"><Plus className="h-4 w-4" /> Voeg eerste doel toe</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {progressList.map(p => {
            const { goal: g } = p;
            const barPct = Math.min(100, Math.max(0, p.progressPct));
            const barColor = p.status === 'behind' ? 'bg-red-500' : p.status === 'ahead' ? 'bg-green-500' : 'bg-primary';
            return (
              <Card key={g.id} className="border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{periodLabel(g)}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{incomeTypeLabel[g.income_type]} • {metricLabel[g.metric]}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(p)} title="Volledig scherm"><Maximize2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)} title="Bewerken"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(g)} title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <div className="text-xl font-semibold tabular-nums">{fmt(p.actual)}</div>
                    <div className="text-sm text-muted-foreground tabular-nums">van {fmt(p.target)}</div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{p.progressPct.toFixed(0)}% behaald • {p.periodPct.toFixed(0)}% van periode</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>Cumulatieve evolutie</span>
                      <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 bg-primary" /> Werkelijk</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2 border-t border-dashed border-muted-foreground" /> Lineair doel</span>
                      </span>
                    </div>
                    <GoalTrendChart goal={g} records={records} />
                  </div>
                  <div className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                    Projectie eindbedrag: <span className="font-medium text-foreground">{fmt(p.projected)}</span>
                    {p.target > 0 && (
                      <span className={`ml-2 ${p.deviationPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        ({p.deviationPct >= 0 ? '+' : ''}{p.deviationPct.toFixed(1)}% t.o.v. doel)
                      </span>
                    )}
                  </div>
                  {g.note && <p className="text-xs text-muted-foreground italic">"{g.note}"</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Doel bewerken' : 'Nieuw doel'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Jaar</Label>
                <Input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) || f.year }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Periode</Label>
                <Select value={form.period_type} onValueChange={v => setForm(f => ({ ...f, period_type: v as GoalPeriodType }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">Volledig jaar</SelectItem>
                    <SelectItem value="quarter">Kwartaal</SelectItem>
                    <SelectItem value="month">Maand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.period_type === 'quarter' && (
              <div>
                <Label className="text-xs">Kwartaal</Label>
                <Select value={String(form.period_value)} onValueChange={v => setForm(f => ({ ...f, period_value: parseInt(v) }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.period_type === 'month' && (
              <div>
                <Label className="text-xs">Maand</Label>
                <Select value={String(form.period_value)} onValueChange={v => setForm(f => ({ ...f, period_value: parseInt(v) }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Inkomststroom</Label>
                <Select value={form.income_type} onValueChange={v => setForm(f => ({ ...f, income_type: v as GoalIncomeType }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Totaal (alle)</SelectItem>
                    <SelectItem value="ambulatory">Ambulant</SelectItem>
                    <SelectItem value="hospitalized">Gehospitaliseerd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Maatstaf</Label>
                <Select value={form.metric} onValueChange={v => setForm(f => ({ ...f, metric: v as GoalMetric }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="netto">Netto</SelectItem>
                    <SelectItem value="bruto">Bruto</SelectItem>
                    <SelectItem value="aandeel_arts">Aandeel Arts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Doelbedrag (€)</Label>
              <Input type="text" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="bv. 150000" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Notitie (optioneel)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="bv. ambitieus jaardoel" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={save} disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Opslaan' : 'Toevoegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
