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
import { Loader2, Plus, Pencil, Trash2, Target, TrendingUp, TrendingDown, Minus, Maximize2, Download, FileText, MousePointerClick, GripVertical } from 'lucide-react';
import { GoalTrendChart } from '@/components/GoalTrendChart';
import { exportPeriodsCSV, exportPeriodsPDF, ExportRow } from '@/lib/goalExport';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const fmt = (val: number) => `€ ${val.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodLabel = (g: Goal) => {
  if (g.period_type === 'year') return `Jaar ${g.year}`;
  if (g.period_type === 'quarter') return `Q${g.period_value} ${g.year}`;
  if (g.period_type === 'custom') {
    const s = g.period_start ?? 1;
    const e = g.period_end ?? s;
    return `${MONTH_SHORT[s - 1]}–${MONTH_SHORT[e - 1]} ${g.year}`;
  }
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
  period_start: number;
  period_end: number;
  income_type: GoalIncomeType;
  metric: GoalMetric;
  amount: string;
  note: string;
};

const emptyForm = (): FormState => ({
  year: new Date().getFullYear(),
  period_type: 'year',
  period_value: 1,
  period_start: 1,
  period_end: 6,
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
  const [chartData, setChartData] = useState<ExportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Reset selectie bij wisselen van doel
  const openFullscreen = (p: typeof progressList[number]) => {
    setFullscreen(p);
    setSelected(new Set());
    setChartData([]);
  };

  const toggleSelect = (label: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const exportRows = (): ExportRow[] => {
    if (selected.size === 0) return chartData;
    return chartData.filter(d => selected.has(d.label));
  };

  const doExportCSV = () => {
    if (!fullscreen) return;
    const rows = exportRows();
    if (rows.length === 0) { toast.error('Geen periodes om te exporteren.'); return; }
    exportPeriodsCSV(fullscreen.goal, rows);
    toast.success(`CSV geëxporteerd (${rows.length} ${rows.length === 1 ? 'periode' : 'periodes'})`);
  };

  const doExportPDF = () => {
    if (!fullscreen) return;
    const rows = exportRows();
    if (rows.length === 0) { toast.error('Geen periodes om te exporteren.'); return; }
    exportPeriodsPDF(fullscreen.goal, rows);
    toast.success(`PDF geëxporteerd (${rows.length} ${rows.length === 1 ? 'periode' : 'periodes'})`);
  };

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
      period_start: g.period_start || 1,
      period_end: g.period_end || 6,
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
    if (form.period_type === 'custom' && form.period_end < form.period_start) {
      toast.error('Eindmaand moet na of gelijk aan startmaand zijn.');
      return;
    }
    setBusy(true);
    try {
      const isCustom = form.period_type === 'custom';
      const payload: any = {
        user_id: user.id,
        year: form.year,
        period_type: form.period_type,
        period_value: (form.period_type === 'year' || isCustom) ? null : form.period_value,
        period_start: isCustom ? form.period_start : null,
        period_end: isCustom ? form.period_end : null,
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
        // Nieuw doel krijgt hoogste sort_order
        const maxOrder = progressList.reduce((m, p) => Math.max(m, p.goal.sort_order ?? 0), -1);
        payload.sort_order = maxOrder + 1;
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

  // Drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = progressList.map(p => p.goal.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(progressList, oldIndex, newIndex);
    // Persisteer nieuwe sort_order per gewijzigd doel
    try {
      const updates = reordered.map((p, idx) => ({ id: p.goal.id, sort_order: idx }));
      // Parallel updates
      const results = await Promise.all(
        updates
          .filter(u => {
            const cur = progressList.find(p => p.goal.id === u.id);
            return (cur?.goal.sort_order ?? 0) !== u.sort_order;
          })
          .map(u => supabase.from('income_goals').update({ sort_order: u.sort_order }).eq('id', u.id))
      );
      const err = results.find(r => r.error);
      if (err?.error) throw err.error;
      refresh();
    } catch (e: any) {
      toast.error('Volgorde opslaan mislukt: ' + (e.message || 'onbekende fout'));
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
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={progressList.map(p => p.goal.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {progressList.map(p => (
                <SortableGoalCard
                  key={p.goal.id}
                  p={p}
                  records={records}
                  onFullscreen={() => openFullscreen(p)}
                  onEdit={() => openEdit(p.goal)}
                  onRemove={() => remove(p.goal)}
                  StatusBadge={StatusBadge}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Fullscreen-weergave van één doel */}
      <Dialog open={!!fullscreen} onOpenChange={(o) => !o && setFullscreen(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] flex flex-col p-6 sm:rounded-lg">
          {fullscreen && (
            <>
              <DialogHeader className="shrink-0">
                <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
                  {periodLabel(fullscreen.goal)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {incomeTypeLabel[fullscreen.goal.income_type]} • {metricLabel[fullscreen.goal.metric]}
                  </span>
                  <StatusBadge status={fullscreen.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0 mt-2">
                <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Werkelijk</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{fmt(fullscreen.actual)}</div>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Doel</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{fmt(fullscreen.target)}</div>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Projectie</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{fmt(fullscreen.projected)}</div>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Afwijking</div>
                  <div className={`mt-1 text-xl font-semibold tabular-nums ${fullscreen.deviationPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fullscreen.deviationPct >= 0 ? '+' : ''}{fullscreen.deviationPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="shrink-0 mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{fullscreen.progressPct.toFixed(0)}% behaald</span>
                  <span>{fullscreen.periodPct.toFixed(0)}% van periode verstreken</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden relative">
                  <div className={`h-full ${fullscreen.status === 'behind' ? 'bg-red-500' : fullscreen.status === 'ahead' ? 'bg-green-500' : 'bg-primary'} transition-all`} style={{ width: `${Math.min(100, Math.max(0, fullscreen.progressPct))}%` }} />
                  {fullscreen.periodPct > 0 && fullscreen.periodPct < 100 && (
                    <div className="absolute top-0 bottom-0 w-px bg-foreground/50" style={{ left: `${fullscreen.periodPct}%` }} title="Verwachte voortgang" />
                  )}
                </div>
              </div>

              {/* Toolbar: selectie + export */}
              <div className="shrink-0 mt-4 flex items-center justify-between gap-3 flex-wrap border-t border-border/50 pt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant={selectMode ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => { setSelectMode(s => !s); if (selectMode) setSelected(new Set()); }}
                    className="gap-1.5 h-8"
                  >
                    <MousePointerClick className="h-3.5 w-3.5" />
                    {selectMode ? 'Selectie aan' : 'Periodes selecteren'}
                  </Button>
                  {selectMode && (
                    <>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelected(new Set(chartData.map(d => d.label)))}>Alles</Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Wissen</Button>
                      <Badge variant="outline" className="font-normal">
                        {selected.size === 0 ? 'Geen geselecteerd – exporteert alle' : `${selected.size} geselecteerd`}
                      </Badge>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={doExportCSV}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={doExportPDF}>
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 mt-3 flex flex-col">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span>
                    Cumulatieve evolutie
                    {selectMode && <span className="ml-2 italic">— klik op een datapunt om te (de)selecteren</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-primary" /> Werkelijk</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 border-t border-dashed border-muted-foreground" /> Lineair doel</span>
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <GoalTrendChart
                    goal={fullscreen.goal}
                    records={records}
                    fullHeight
                    selectable={selectMode}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    onDataReady={setChartData}
                  />
                </div>
              </div>

              {fullscreen.goal.note && (
                <p className="text-sm text-muted-foreground italic shrink-0 mt-2 border-t border-border/50 pt-3">"{fullscreen.goal.note}"</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

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
                    <SelectItem value="custom">Aangepaste periode</SelectItem>
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
            {form.period_type === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Van maand</Label>
                  <Select value={String(form.period_start)} onValueChange={v => {
                    const ns = parseInt(v);
                    setForm(f => ({ ...f, period_start: ns, period_end: f.period_end < ns ? ns : f.period_end }));
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Tot en met</Label>
                  <Select value={String(form.period_end)} onValueChange={v => setForm(f => ({ ...f, period_end: parseInt(v) }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((n, i) => (
                        <SelectItem key={i} value={String(i + 1)} disabled={i + 1 < form.period_start}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="col-span-2 text-[11px] text-muted-foreground -mt-1">
                  Bijv. <span className="font-medium text-foreground">Januari–Juni</span> voor een halfjaardoel.
                </p>
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

// =================== Sortable card component ===================
type GoalProgressItem = ReturnType<typeof useGoals>['progressList'][number];

function SortableGoalCard({
  p, records, onFullscreen, onEdit, onRemove, StatusBadge,
}: {
  p: GoalProgressItem;
  records: ReturnType<typeof useGoals>['records'];
  onFullscreen: () => void;
  onEdit: () => void;
  onRemove: () => void;
  StatusBadge: (props: { status: 'on_track' | 'ahead' | 'behind' | 'no_data' }) => JSX.Element;
}) {
  const { goal: g } = p;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: g.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };
  const barPct = Math.min(100, Math.max(0, p.progressPct));
  const barColor = p.status === 'behind' ? 'bg-red-500' : p.status === 'ahead' ? 'bg-green-500' : 'bg-primary';

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`border-border/50 ${isDragging ? 'shadow-lg ring-2 ring-primary/40' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <button
                type="button"
                {...attributes}
                {...listeners}
                className="mt-0.5 -ml-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing touch-none shrink-0"
                title="Sleep om te herschikken"
                aria-label="Sleep om te herschikken"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{periodLabel(g)}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{incomeTypeLabel[g.income_type]} • {metricLabel[g.metric]}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onFullscreen} title="Volledig scherm"><Maximize2 className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Bewerken"><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
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
    </div>
  );
}
