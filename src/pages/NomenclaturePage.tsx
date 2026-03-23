import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Loader2, Pencil, Tag, X, Calculator, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type NomenclatureCode = {
  id: string;
  code: string;
  description: string;
  category: string;
};

type SimulationLine = {
  id: string;
  nomenclature_code: string;
  quantity: number;
  unit_amount: number;
  aandeel_arts_pct: number;
  bouwfonds_pct: number;
  mif_pct: number;
};

type Scenario = {
  id: string;
  name: string;
  lines: SimulationLine[];
};

const DEFAULT_CATEGORIES = ['algemeen', 'raadpleging', 'behandeling', 'procedure', 'overig'];

export default function NomenclaturePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [codes, setCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('algemeen');
  const [adding, setAdding] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCustomCategory, setNewCustomCategory] = useState('');
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<NomenclatureCode | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];

  const fetchCodes = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('nomenclature_codes').select('*').eq('user_id', user.id).order('code');
    if (!error && data) {
      setCodes(data);
      const existingCats = [...new Set(data.map(c => c.category))];
      const custom = existingCats.filter(c => !DEFAULT_CATEGORIES.includes(c));
      setCustomCategories(prev => [...new Set([...prev, ...custom])]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCodes(); }, [user]);

  const addCode = async () => {
    if (!user || !newCode.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('nomenclature_codes').insert({
      user_id: user.id, code: newCode.trim(), description: newDesc.trim(), category: newCategory,
    });
    if (error) {
      toast({ title: 'Fout', description: error.message.includes('duplicate') ? 'Deze code bestaat al.' : error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Code toegevoegd' });
      setNewCode(''); setNewDesc(''); setNewCategory('algemeen');
      fetchCodes();
    }
    setAdding(false);
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('nomenclature_codes').delete().eq('id', id);
    if (!error) { setCodes(prev => prev.filter(c => c.id !== id)); toast({ title: 'Code verwijderd' }); }
  };

  const openEditDialog = (code: NomenclatureCode) => {
    setEditingCode(code);
    setEditCode(code.code);
    setEditDesc(code.description);
    setEditCategory(code.category);
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!editingCode || !editCode.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('nomenclature_codes').update({
      code: editCode.trim(), description: editDesc.trim(), category: editCategory,
    }).eq('id', editingCode.id);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Code bijgewerkt' });
      setEditDialogOpen(false);
      fetchCodes();
    }
    setSaving(false);
  };

  const addCustomCategory = () => {
    const cat = newCustomCategory.trim().toLowerCase();
    if (!cat || allCategories.includes(cat)) {
      toast({ title: 'Fout', description: cat ? 'Categorie bestaat al.' : 'Voer een naam in.', variant: 'destructive' });
      return;
    }
    setCustomCategories(prev => [...prev, cat]);
    setNewCustomCategory('');
    toast({ title: 'Categorie toegevoegd' });
  };

  const removeCustomCategory = (cat: string) => {
    const usedBy = codes.filter(c => c.category === cat);
    if (usedBy.length > 0) {
      toast({ title: 'Kan niet verwijderen', description: `Categorie "${cat}" wordt gebruikt door ${usedBy.length} code(s).`, variant: 'destructive' });
      return;
    }
    setCustomCategories(prev => prev.filter(c => c !== cat));
    toast({ title: 'Categorie verwijderd' });
  };

  const groupedCodes = allCategories.reduce((acc, cat) => {
    const items = codes.filter(c => c.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {} as Record<string, NomenclatureCode[]>);

  // === Simulation state ===
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: crypto.randomUUID(), name: 'Scenario 1', lines: [] },
  ]);
  const [activeScenario, setActiveScenario] = useState(0);

  const createNewLine = (): SimulationLine => ({
    id: crypto.randomUUID(),
    nomenclature_code: '',
    quantity: 1,
    unit_amount: 0,
    aandeel_arts_pct: 100,
    bouwfonds_pct: 0,
    mif_pct: 0,
  });

  const addScenario = () => {
    setScenarios(prev => [...prev, { id: crypto.randomUUID(), name: `Scenario ${prev.length + 1}`, lines: [] }]);
    setActiveScenario(scenarios.length);
  };

  const duplicateScenario = (idx: number) => {
    const src = scenarios[idx];
    const dup: Scenario = {
      id: crypto.randomUUID(),
      name: `${src.name} (kopie)`,
      lines: src.lines.map(l => ({ ...l, id: crypto.randomUUID() })),
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

  const addLine = (scenarioIdx: number) => {
    setScenarios(prev => prev.map((s, i) => i === scenarioIdx ? { ...s, lines: [...s.lines, createNewLine()] } : s));
  };

  const updateLine = (scenarioIdx: number, lineId: string, field: keyof SimulationLine, value: string | number) => {
    setScenarios(prev => prev.map((s, i) => i === scenarioIdx ? {
      ...s, lines: s.lines.map(l => l.id === lineId ? { ...l, [field]: value } : l),
    } : s));
  };

  const removeLine = (scenarioIdx: number, lineId: string) => {
    setScenarios(prev => prev.map((s, i) => i === scenarioIdx ? { ...s, lines: s.lines.filter(l => l.id !== lineId) } : s));
  };

  const calcScenarioTotals = (scenario: Scenario) => {
    let bruto = 0, aandeelArts = 0, bouwfonds = 0, mif = 0;
    scenario.lines.forEach(l => {
      const lineTotal = l.quantity * l.unit_amount;
      bruto += lineTotal;
      aandeelArts += lineTotal * (l.aandeel_arts_pct / 100);
      bouwfonds += lineTotal * (l.bouwfonds_pct / 100);
      mif += lineTotal * (l.mif_pct / 100);
    });
    const netto = aandeelArts - bouwfonds - mif;
    return { bruto, aandeelArts, bouwfonds, mif, netto };
  };

  const fmt = (v: number) => v.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });

  const currentScenario = scenarios[activeScenario] || scenarios[0];
  const totals = calcScenarioTotals(currentScenario);

  const codeOptions = codes.map(c => ({ value: c.code, label: `${c.code} – ${c.description}` }));

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nomenclatuurbeheer</h1>
          <p className="text-muted-foreground mt-1">Beheer je RIZIV nomenclatuurcodes, categorieën en simulaties.</p>
        </div>
      </div>

      <Tabs defaultValue="codes" className="w-full">
        <TabsList>
          <TabsTrigger value="codes">Codes</TabsTrigger>
          <TabsTrigger value="simulaties">
            <Calculator className="h-4 w-4 mr-1.5" />
            Simulaties
          </TabsTrigger>
        </TabsList>

        {/* === CODES TAB === */}
        <TabsContent value="codes" className="space-y-6 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
              <Tag className="h-4 w-4 mr-2" />
              Categorieën Beheren
            </Button>
          </div>

          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Nieuwe Code Toevoegen</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-3 items-end flex-wrap">
                <div className="space-y-1.5">
                  <Label className="text-xs">RIZIV Code</Label>
                  <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="bv. 350372" className="w-32 font-mono" />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                  <Label className="text-xs">Omschrijving</Label>
                  <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="bv. Raadpleging oncologie" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Categorie</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allCategories.map(cat => (
                        <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addCode} disabled={adding || !newCode.trim()}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Toevoegen
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">Jouw Codes ({codes.length})</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : codes.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Nog geen nomenclatuurcodes. Voeg er hierboven een toe of upload een screenshot.</p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedCodes).map(([category, items]) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="capitalize text-xs">{category}</Badge>
                        <span className="text-xs text-muted-foreground">{items.length} code{items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Code</th>
                              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Omschrijving</th>
                              <th className="py-2 px-3 w-20"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(c => (
                              <tr key={c.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                                <td className="py-2.5 px-3 font-mono text-xs">{c.code}</td>
                                <td className="py-2.5 px-3">{c.description || '—'}</td>
                                <td className="py-2.5 px-3">
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(c)}>
                                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCode(c.id)}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === SIMULATIES TAB === */}
        <TabsContent value="simulaties" className="space-y-6 mt-4">
          {/* Scenario tabs */}
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

          {/* Scenario header */}
          <Card className="border-border/50">
            <CardContent className="pt-4">
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
            </CardContent>
          </Card>

          {/* Simulation lines */}
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Prestaties</CardTitle>
                <Button size="sm" onClick={() => addLine(activeScenario)}>
                  <Plus className="h-4 w-4 mr-1" /> Prestatie Toevoegen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {currentScenario.lines.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Voeg prestaties toe om het verwachte maandloon te berekenen.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Code</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground w-20">Aantal</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground w-28">Eenheidsprijs</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground w-24">Arts %</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground w-24">Bouwfonds %</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground w-24">MIF %</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground w-28">Lijn Totaal</th>
                        <th className="py-2 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentScenario.lines.map(line => {
                        const lineTotal = line.quantity * line.unit_amount;
                        const lineNetto = lineTotal * (line.aandeel_arts_pct / 100) - lineTotal * (line.bouwfonds_pct / 100) - lineTotal * (line.mif_pct / 100);
                        return (
                          <tr key={line.id} className="border-b border-border/20">
                            <td className="py-2 px-2">
                              <Select value={line.nomenclature_code} onValueChange={v => updateLine(activeScenario, line.id, 'nomenclature_code', v)}>
                                <SelectTrigger className="w-52 text-xs"><SelectValue placeholder="Kies code" /></SelectTrigger>
                                <SelectContent>
                                  {codeOptions.map(o => (
                                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" min={1} className="w-20 text-right text-xs" value={line.quantity}
                                onChange={e => updateLine(activeScenario, line.id, 'quantity', Number(e.target.value))} />
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" step="0.01" min={0} className="w-28 text-right text-xs" value={line.unit_amount}
                                onChange={e => updateLine(activeScenario, line.id, 'unit_amount', Number(e.target.value))} />
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" step="1" min={0} max={100} className="w-20 text-right text-xs" value={line.aandeel_arts_pct}
                                onChange={e => updateLine(activeScenario, line.id, 'aandeel_arts_pct', Number(e.target.value))} />
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" step="1" min={0} max={100} className="w-20 text-right text-xs" value={line.bouwfonds_pct}
                                onChange={e => updateLine(activeScenario, line.id, 'bouwfonds_pct', Number(e.target.value))} />
                            </td>
                            <td className="py-2 px-2">
                              <Input type="number" step="1" min={0} max={100} className="w-20 text-right text-xs" value={line.mif_pct}
                                onChange={e => updateLine(activeScenario, line.id, 'mif_pct', Number(e.target.value))} />
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-xs font-medium">{fmt(lineNetto)}</td>
                            <td className="py-2 px-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(activeScenario, line.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Totals summary */}
          {currentScenario.lines.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base">Verwacht Maandloon – {currentScenario.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Bruto</p>
                    <p className="text-lg font-semibold">{fmt(totals.bruto)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Aandeel Arts</p>
                    <p className="text-lg font-semibold">{fmt(totals.aandeelArts)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Bouwfonds</p>
                    <p className="text-lg font-semibold text-destructive">{fmt(totals.bouwfonds)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">MIF</p>
                    <p className="text-lg font-semibold text-orange-500">{fmt(totals.mif)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Netto</p>
                    <p className="text-xl font-bold text-primary">{fmt(totals.netto)}</p>
                  </div>
                </div>

                {/* Scenario comparison */}
                {scenarios.length > 1 && (
                  <div className="mt-6 pt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-3 font-medium">Vergelijking alle scenario's</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Scenario</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Bruto</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Aandeel Arts</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Afdracht</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Netto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarios.map((s, idx) => {
                            const t = calcScenarioTotals(s);
                            return (
                              <tr key={s.id} className={`border-b border-border/20 ${idx === activeScenario ? 'bg-primary/5' : ''}`}>
                                <td className="py-2 px-3 font-medium">{s.name}</td>
                                <td className="py-2 px-3 text-right font-mono text-xs">{fmt(t.bruto)}</td>
                                <td className="py-2 px-3 text-right font-mono text-xs">{fmt(t.aandeelArts)}</td>
                                <td className="py-2 px-3 text-right font-mono text-xs">{fmt(t.bouwfonds + t.mif)}</td>
                                <td className="py-2 px-3 text-right font-mono text-xs font-semibold">{fmt(t.netto)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Code Bewerken</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>RIZIV Code</Label>
              <Input value={editCode} onChange={e => setEditCode(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCategories.map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuleren</Button>
            <Button onClick={saveEdit} disabled={saving || !editCode.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Categorieën Beheren</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Standaard categorieën</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_CATEGORIES.map(cat => (
                  <Badge key={cat} variant="secondary" className="capitalize">{cat}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Aangepaste categorieën</Label>
              {customCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen aangepaste categorieën.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {customCategories.map(cat => (
                    <Badge key={cat} variant="outline" className="capitalize gap-1 pr-1">
                      {cat}
                      <button onClick={() => removeCustomCategory(cat)} className="ml-1 hover:text-destructive transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCustomCategory}
                onChange={e => setNewCustomCategory(e.target.value)}
                placeholder="Nieuwe categorienaam"
                onKeyDown={e => e.key === 'Enter' && addCustomCategory()}
              />
              <Button onClick={addCustomCategory} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Toevoegen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}