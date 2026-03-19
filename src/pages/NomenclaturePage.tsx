import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type NomenclatureCode = {
  id: string;
  code: string;
  description: string;
  category: string;
};

export default function NomenclaturePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [codes, setCodes] = useState<NomenclatureCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [adding, setAdding] = useState(false);

  const fetchCodes = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('nomenclature_codes').select('*').eq('user_id', user.id).order('code');
    if (!error) setCodes(data || []);
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
      toast({ title: 'Error', description: error.message.includes('duplicate') ? 'This code already exists.' : error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Added' });
      setNewCode(''); setNewDesc(''); setNewCategory('general');
      fetchCodes();
    }
    setAdding(false);
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('nomenclature_codes').delete().eq('id', id);
    if (!error) { setCodes(prev => prev.filter(c => c.id !== id)); toast({ title: 'Deleted' }); }
  };

  const categories = [...new Set(codes.map(c => c.category))];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nomenclature Management</h1>
        <p className="text-muted-foreground mt-1">Manage your RIZIV nomenclature codes and categories.</p>
      </div>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Add New Code</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">RIZIV Code</Label>
              <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. 350372" className="w-32 font-mono" />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label className="text-xs">Description</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="e.g. Consultation oncology" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="consultation">Consultation</SelectItem>
                  <SelectItem value="treatment">Treatment</SelectItem>
                  <SelectItem value="procedure">Procedure</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addCode} disabled={adding || !newCode.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Your Codes ({codes.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : codes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No nomenclature codes yet. Add one above or upload a screenshot to auto-populate.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Code</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Category</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map(c => (
                    <tr key={c.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-xs">{c.code}</td>
                      <td className="py-2.5 px-3">{c.description || '—'}</td>
                      <td className="py-2.5 px-3 capitalize text-muted-foreground">{c.category}</td>
                      <td className="py-2.5 px-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCode(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
