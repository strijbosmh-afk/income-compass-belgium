import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, Copy, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

type NomenclatureCode = {
  id: string;
  code: string;
  description: string;
  category: string;
  netto_amount: number;
};

type SimulationLine = {
  id: string;
  nomenclature_code_id: string;
  quantity: number;
};

type MonthBase = {
  enabled: boolean;
  month: number;
  year: number;
};

type Scenario = {
  id: string;
  name: string;
  lines: SimulationLine[];
  monthBase: MonthBase;
};

type MonthRecord = {
  nomenclature_code: string;
  totalNetto: number;
  totalQuantity: number;
};

const MONTHS = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

export default function SimulationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [codes, setCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: crypto.randomUUID(), name: 'Scenario 1', lines: [], monthBase: { enabled: true, month: new Date().getMonth() + 1, year: new Date().getFullYear() } },
  ]);
  const [activeScenario, setActiveScenario] = useState(0);
  const [monthRecords, setMonthRecords] = useState<Record<string, MonthRecord[]>>({});
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);
  const dataVersion = useDataVersion();

  useEffect(() => {
    if (!user) return;
    const fetchCodes = async () => {
      const { data } = await supabase.from('nomenclature_codes').select('*').eq('user_id', user.id).order('code');
      if (data) {
        setCodes(data.map(d => ({ ...d, netto_amount: (d as any).netto_amount ?? 0 })));
      }
      setLoading(false);
    };
    const fetchYears = async () => {
      const { data } = await supabase.from('income_records').select('year').eq('user_id', user.id);
      if (data) {
        const years = [...new Set(data.map(d => d.year))].sort((a, b) => b - a);
        if (years.length > 0) setAvailableYears(years);
      }
    };
    fetchCodes();
    fetchYears();
    setMonthRecords({}); // invalidate cached month-base lookups when data changes
  }, [user, dataVersion]);

  // Fetch month data when a scenario's monthBase changes
  const currentScenario = scenarios[activeScenario] || scenarios[0];

  useEffect(() => {
    if (!user || !currentScenario.monthBase.enabled) return;
    const { month, year } = currentScenario.monthBase;
    const key = `${year}-${month}`;
    if (monthRecords[key]) return; // already fetched

    const fetchMonth = async () => {
      const { data } = await supabase
        .from('income_records')
        .select('nomenclature_code, netto, quantity')
        .eq('user_id', user.id)
        .eq('month', month)
        .eq('year', year);

      if (data) {
        const grouped: Record<string, MonthRecord> = {};
        data.forEach(r => {
          if (!grouped[r.nomenclature_code]) {
            grouped[r.nomenclature_code] = { nomenclature_code: r.nomenclature_code, totalNetto: 0, totalQuantity: 0 };
          }
          grouped[r.nomenclature_code].totalNetto += r.netto;
          grouped[r.nomenclature_code].totalQuantity += r.quantity;
        });
        setMonthRecords(prev => ({ ...prev, [key]: Object.values(grouped) }));
      }
    };
    fetchMonth();
  }, [user, currentScenario.monthBase.enabled, currentScenario.monthBase.month, currentScenario.monthBase.year]);

  const codesWithNetto = codes.filter(c => c.netto_amount > 0);

  const getMonthBaseTotal = (scenario: Scenario): number => {
    if (!scenario.monthBase.enabled) return 0;
    const key = `${scenario.monthBase.year}-${scenario.monthBase.month}`;
    const records = monthRecords[key] || [];
    return records.reduce((sum, r) => sum + r.totalNetto, 0);
  };

  const getMonthBaseRecords = (scenario: Scenario): MonthRecord[] => {
    if (!scenario.monthBase.enabled) return [];
    const key = `${scenario.monthBase.year}-${scenario.monthBase.month}`;
    return monthRecords[key] || [];
  };

  const addAllCodes = () => {
    const existing = new Set(currentScenario.lines.map(l => l.nomenclature_code_id));
    const newLines: SimulationLine[] = codesWithNetto
      .filter(c => !existing.has(c.id))
      .map(c => ({ id: crypto.randomUUID(), nomenclature_code_id: c.id, quantity: 1 }));
    if (newLines.length === 0) {
      toast({ title: 'Alle codes al toegevoegd' });
      return;
    }
    setScenarios(prev => prev.map((s, i) => i === activeScenario ? { ...s, lines: [...s.lines, ...newLines] } : s));
  };

  const addScenario = () => {
    setScenarios(prev => [...prev, {
      id: crypto.randomUUID(),
      name: `Scenario ${prev.length + 1}`,
      lines: [],
      monthBase: { enabled: true, month: new Date().getMonth() + 1, year: new Date().getFullYear() },
    }]);
    setActiveScenario(scenarios.length);
  };

  const duplicateScenario = (idx: number) => {
    const src = scenarios[idx];
    const dup: Scenario = {
      id: crypto.randomUUID(),
      name: `${src.name} (kopie)`,
      lines: src.lines.map(l => ({ ...l, id: crypto.randomUUID() })),
      monthBase: { ...src.monthBase },
    };
    setScenarios(prev => [...prev, dup]);
    setActiveScenario(scenarios.length);
  };

  const removeScenario = (idx: number) => {
    if (scenarios.length <= 1) return;
    setScenarios(prev => prev.filter((_, i) => i !== idx));
    setActiveScenario(prev => Math.min(prev, scenarios.length - 2));
  };

  const updateScenarioName = (idx: number, name: string) => {
    setScenarios(prev => prev.map((s, i) => i === idx ? { ...s, name } : s));
  };

  const toggleMonthBase = (enabled: boolean) => {
    setScenarios(prev => prev.map((s, i) => i === activeScenario
      ? { ...s, monthBase: { ...s.monthBase, enabled } }
      : s
    ));
  };

  const updateMonthBaseMonth = (month: string) => {
    setScenarios(prev => prev.map((s, i) => i === activeScenario
      ? { ...s, monthBase: { ...s.monthBase, month: parseInt(month) } }
      : s
    ));
  };

  const updateMonthBaseYear = (year: string) => {
    setScenarios(prev => prev.map((s, i) => i === activeScenario
      ? { ...s, monthBase: { ...s.monthBase, year: parseInt(year) } }
      : s
    ));
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    setScenarios(prev => prev.map((s, i) => i === activeScenario
      ? { ...s, lines: s.lines.map(l => l.id === lineId ? { ...l, quantity } : l) }
      : s
    ));
  };

  const removeLine = (lineId: string) => {
    setScenarios(prev => prev.map((s, i) => i === activeScenario
      ? { ...s, lines: s.lines.filter(l => l.id !== lineId) }
      : s
    ));
  };

  const getCode = (id: string) => codes.find(c => c.id === id);
  const getCodeByCode = (code: string) => codes.find(c => c.code === code);

  const calcSimulatedTotal = (scenario: Scenario) =>
    scenario.lines.reduce((sum, l) => {
      const code = getCode(l.nomenclature_code_id);
      return sum + (code ? code.netto_amount * l.quantity : 0);
    }, 0);

  const calcScenarioTotal = (scenario: Scenario) =>
    getMonthBaseTotal(scenario) + calcSimulatedTotal(scenario);

  const fmt = (v: number) => v.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });

  const currentTotal = calcScenarioTotal(currentScenario);
  const currentBaseTotal = getMonthBaseTotal(currentScenario);
  const currentSimTotal = calcSimulatedTotal(currentScenario);
  const currentBaseRecords = getMonthBaseRecords(currentScenario);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Simulaties</h1>
        <p className="text-muted-foreground mt-1">
          Test verschillende scenario's en bereken het verwachte maandloon.
        </p>
      </div>

      {codesWithNetto.length === 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              Geen nomenclatuurcodes met een netto bedrag gevonden. Ga naar{' '}
              <a href="/nomenclature" className="underline font-medium">Nomenclatuurbeheer</a>{' '}
              om netto bedragen toe te kennen aan je codes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scenario selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {scenarios.map((s, idx) => (
          <Button
            key={s.id}
            variant={idx === activeScenario ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveScenario(idx)}
          >
            {s.name}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={addScenario}>
          <Plus className="h-4 w-4 mr-1" /> Nieuw
        </Button>
      </div>

      {/* Scenario config */}
      <Card className="border-border/50">
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">Scenarionaam</Label>
              <Input
                value={currentScenario.name}
                onChange={e => updateScenarioName(activeScenario, e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-5">
              <Button variant="outline" size="sm" onClick={() => duplicateScenario(activeScenario)}>
                <Copy className="h-4 w-4 mr-1" /> Dupliceren
              </Button>
              {scenarios.length > 1 && (
                <Button variant="outline" size="sm" onClick={() => removeScenario(activeScenario)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> Verwijderen
                </Button>
              )}
            </div>
          </div>

          {/* Month base toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-muted/20">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 flex-1">
              <Label htmlFor="month-base" className="text-sm font-medium cursor-pointer">Gebruik maand als basis</Label>
              <Switch
                id="month-base"
                checked={currentScenario.monthBase.enabled}
                onCheckedChange={toggleMonthBase}
              />
            </div>
            {currentScenario.monthBase.enabled && (
              <div className="flex items-center gap-2">
                <Select value={String(currentScenario.monthBase.month)} onValueChange={updateMonthBaseMonth}>
                  <SelectTrigger className="w-[130px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(currentScenario.monthBase.year)} onValueChange={updateMonthBaseYear}>
                  <SelectTrigger className="w-[90px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Month base summary */}
      {currentScenario.monthBase.enabled && currentBaseRecords.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Basis: {MONTHS[currentScenario.monthBase.month - 1]} {currentScenario.monthBase.year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {currentBaseRecords.map(r => {
                const codeObj = getCodeByCode(r.nomenclature_code);
                return (
                  <div key={r.nomenclature_code} className="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/20">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.nomenclature_code}</span>
                      <span className="text-sm">{codeObj?.description || '—'}</span>
                      <Badge variant="secondary" className="text-xs">×{r.totalQuantity}</Badge>
                    </div>
                    <span className="text-sm font-semibold font-mono">{fmt(r.totalNetto)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between pt-2 border-t border-border/30">
                <span className="text-sm font-medium text-muted-foreground">Subtotaal basis</span>
                <span className="text-sm font-bold font-mono">{fmt(currentBaseTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentScenario.monthBase.enabled && currentBaseRecords.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <p className="text-center py-4 text-sm text-muted-foreground">
              Geen gegevens gevonden voor {MONTHS[currentScenario.monthBase.month - 1]} {currentScenario.monthBase.year}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lines with sliders */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {currentScenario.monthBase.enabled ? 'Extra Prestaties' : 'Prestaties'}
            </CardTitle>
            <Button size="sm" onClick={addAllCodes} disabled={codesWithNetto.length === 0}>
              <Plus className="h-4 w-4 mr-1" /> Alle Codes Toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {currentScenario.lines.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              {currentScenario.monthBase.enabled
                ? 'Voeg extra codes toe bovenop de maandbasis.'
                : 'Voeg codes toe om het verwachte maandloon te simuleren.'}
            </p>
          ) : (
            <div className="space-y-4">
              {currentScenario.lines.map(line => {
                const code = getCode(line.nomenclature_code_id);
                if (!code) return null;
                const lineTotal = code.netto_amount * line.quantity;
                return (
                  <div key={line.id} className="flex items-center gap-4 p-3 rounded-lg border border-border/30 bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">{code.code}</span>
                        <span className="text-sm font-medium truncate">{code.description || '—'}</span>
                        <Badge variant="outline" className="text-xs capitalize ml-auto shrink-0">{code.category}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-28 shrink-0">
                          {fmt(code.netto_amount)}/prestatie
                        </span>
                        <Slider
                          value={[line.quantity]}
                          onValueChange={([v]) => updateQuantity(line.id, v)}
                          min={0}
                          max={100}
                          step={1}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={999}
                          value={line.quantity}
                          onChange={e => updateQuantity(line.id, Math.max(0, Number(e.target.value)))}
                          className="w-16 text-center text-sm h-8"
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0 w-24">
                      <p className="text-sm font-semibold font-mono">{fmt(lineTotal)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeLine(line.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Total */}
      {(currentScenario.lines.length > 0 || (currentScenario.monthBase.enabled && currentBaseRecords.length > 0)) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Verwacht Maandelijks Netto</p>
                <p className="text-3xl font-bold text-primary">{fmt(currentTotal)}</p>
                {currentScenario.monthBase.enabled && currentScenario.lines.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Basis: {fmt(currentBaseTotal)} + Extra: {fmt(currentSimTotal)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Verwacht Jaarlijks Netto</p>
                <p className="text-2xl font-semibold text-primary">{fmt(currentTotal * 12)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scenario comparison */}
      {scenarios.length > 1 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Vergelijking Scenario's</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Scenario</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Basis</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Extra</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Maandelijks Netto</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Jaarlijks Netto</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s, idx) => {
                    const baseTotal = getMonthBaseTotal(s);
                    const simTotal = calcSimulatedTotal(s);
                    const total = baseTotal + simTotal;
                    return (
                      <tr key={s.id} className={`border-b border-border/20 ${idx === activeScenario ? 'bg-primary/5' : ''}`}>
                        <td className="py-2.5 px-3 font-medium">{s.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">
                          {s.monthBase.enabled ? fmt(baseTotal) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">{fmt(simTotal)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold">{fmt(total)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">{fmt(total * 12)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
