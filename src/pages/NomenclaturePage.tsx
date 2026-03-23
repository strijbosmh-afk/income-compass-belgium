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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nomenclatuurbeheer</h1>
          <p className="text-muted-foreground mt-1">Beheer je RIZIV nomenclatuurcodes en categorieën.</p>
        </div>
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