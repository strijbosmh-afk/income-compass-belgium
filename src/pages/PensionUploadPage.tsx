import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, FileText, PiggyBank, Shield, Wallet, Stethoscope, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface PensionSnapshot {
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  pensioenreserve_vapz: number;
  vap_riziv_toelage: number;
}

type ItemStatus = 'pending' | 'uploading' | 'extracting' | 'ready' | 'saving' | 'saved' | 'error';

interface BatchItem {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
  pdfPath?: string;
  extracted?: PensionSnapshot;
  note: string;
}

const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PensionUploadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [dragActive, setDragActive] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [savingAll, setSavingAll] = useState(false);

  const processFiles = useCallback(async (files: File[]) => {
    if (!user) return;
    const pdfs = files.filter(f => f.type === 'application/pdf');
    if (pdfs.length === 0) {
      toast({ title: 'Ongeldige bestanden', description: 'Enkel PDF-bestanden worden geaccepteerd.', variant: 'destructive' });
      return;
    }
    const newItems: BatchItem[] = pdfs.map(f => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${f.name}`,
      file: f,
      status: 'pending',
      note: '',
    }));
    setItems(prev => [...prev, ...newItems]);

    // Process sequentially to keep server load reasonable
    for (const item of newItems) {
      try {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));
        const filePath = `${user.id}/${Date.now()}_${item.file.name}`;
        const { error: uploadError } = await supabase.storage.from('pension-pdfs').upload(filePath, item.file);
        if (uploadError) throw uploadError;

        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'extracting', pdfPath: filePath } : i));
        const base64 = await fileToBase64(item.file);
        const { data, error } = await supabase.functions.invoke('extract-pension', {
          body: { pdf: base64, mimeType: item.file.type },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const extracted: PensionSnapshot = {
          snapshot_date: data.snapshot_date,
          year: data.year,
          pensioenreserve: Number(data.pensioenreserve) || 0,
          overlijdensdekking: Number(data.overlijdensdekking) || 0,
          pensioenreserve_vapz: Number(data.pensioenreserve_vapz) || 0,
          vap_riziv_toelage: Number(data.vap_riziv_toelage) || 0,
        };
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'ready', extracted } : i));
      } catch (err: any) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message || 'Verwerking mislukt' } : i));
      }
    }
  }, [user, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  }, [processFiles]);

  const updateExtracted = (id: string, k: keyof PensionSnapshot, v: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id || !i.extracted) return i;
      const next = { ...i.extracted };
      if (k === 'snapshot_date') {
        next.snapshot_date = v;
        next.year = parseInt(v.slice(0, 4)) || next.year;
      } else if (k === 'year') {
        next.year = parseInt(v) || next.year;
      } else {
        (next as any)[k] = parseFloat(v.replace(',', '.')) || 0;
      }
      return { ...i, extracted: next };
    }));
  };

  const updateNote = (id: string, note: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, note } : i));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const saveAll = async () => {
    if (!user) return;
    const ready = items.filter(i => i.status === 'ready' && i.extracted);
    if (ready.length === 0) {
      toast({ title: 'Niets om op te slaan', description: 'Geen verwerkte snapshots gevonden.', variant: 'destructive' });
      return;
    }
    setSavingAll(true);
    let savedCount = 0;
    for (const item of ready) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'saving' } : i));
      try {
        const { error } = await supabase.from('pension_records').insert({
          user_id: user.id,
          snapshot_date: item.extracted!.snapshot_date,
          year: item.extracted!.year,
          pensioenreserve: item.extracted!.pensioenreserve,
          overlijdensdekking: item.extracted!.overlijdensdekking,
          pensioenreserve_vapz: item.extracted!.pensioenreserve_vapz,
          vap_riziv_toelage: item.extracted!.vap_riziv_toelage,
          source_pdf_url: item.pdfPath,
          note: item.note || null,
        });
        if (error) throw error;
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'saved' } : i));
        savedCount++;
      } catch (err: any) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message } : i));
      }
    }
    setSavingAll(false);
    toast({ title: 'Opgeslagen', description: `${savedCount} van ${ready.length} snapshots opgeslagen.` });
    if (savedCount > 0) {
      setTimeout(() => navigate('/pensioen/overzicht'), 800);
    }
  };

  const anyBusy = items.some(i => i.status === 'uploading' || i.status === 'extracting' || i.status === 'saving');
  const readyCount = items.filter(i => i.status === 'ready').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pensioen PDF Uploaden</h1>
        <p className="text-muted-foreground mt-1">Upload één of meerdere jaarlijkse pensioenoverzichten (PDF) — reserves worden automatisch geëxtraheerd.</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">Sleep één of meerdere pensioen-PDFs hierheen</p>
                <p className="text-sm text-muted-foreground mt-1">of klik om bestanden te selecteren — meerdere tegelijk toegestaan</p>
              </div>
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) processFiles(fs); e.target.value = ''; }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Verwerking ({items.length} bestanden)</h2>
            <div className="flex gap-2">
              <Button variant="outline" disabled={anyBusy || savingAll} onClick={() => setItems([])}>Lijst wissen</Button>
              <Button disabled={readyCount === 0 || savingAll || anyBusy} onClick={saveAll}>
                {savingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Alles opslaan ({readyCount})
              </Button>
            </div>
          </div>

          {items.map(item => (
            <Card key={item.id} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{item.file.name}</span>
                    <StatusBadge status={item.status} error={item.error} />
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} disabled={item.status === 'saving'}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              {item.extracted && (item.status === 'ready' || item.status === 'saving' || item.status === 'saved') && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Referentiedatum</Label>
                      <Input type="date" value={item.extracted.snapshot_date} disabled={item.status !== 'ready'} onChange={(e) => updateExtracted(item.id, 'snapshot_date', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Jaar</Label>
                      <Input type="number" value={item.extracted.year} disabled={item.status !== 'ready'} onChange={(e) => updateExtracted(item.id, 'year', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FieldRow icon={PiggyBank} label="Pensioenreserve (cumulatief)" value={item.extracted.pensioenreserve} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'pensioenreserve', v)} />
                    <FieldRow icon={Shield} label="Overlijdensdekking" value={item.extracted.overlijdensdekking} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'overlijdensdekking', v)} />
                    <FieldRow icon={Wallet} label="Pensioenreserve VAPZ" value={item.extracted.pensioenreserve_vapz} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'pensioenreserve_vapz', v)} />
                    <FieldRow icon={Stethoscope} label="VAP RIZIV toelage" value={item.extracted.vap_riziv_toelage} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'vap_riziv_toelage', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Notitie (optioneel)</Label>
                    <Input value={item.note} disabled={item.status !== 'ready'} onChange={(e) => updateNote(item.id, e.target.value)} placeholder="bv. AG Insurance jaaroverzicht" />
                  </div>
                  <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                    Pensioenreserve is een cumulatief saldo — bedragen worden niet opgeteld in het dashboard.
                  </div>
                </CardContent>
              )}
              {item.status === 'error' && (
                <CardContent>
                  <p className="text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" />{item.error}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: ItemStatus; error?: string }) {
  const map: Record<ItemStatus, { label: string; cls: string; icon?: any }> = {
    pending: { label: 'Wachten...', cls: 'bg-muted text-muted-foreground' },
    uploading: { label: 'Uploaden...', cls: 'bg-primary/10 text-primary', icon: Loader2 },
    extracting: { label: 'Extraheren...', cls: 'bg-primary/10 text-primary', icon: Loader2 },
    ready: { label: 'Klaar', cls: 'bg-emerald-500/10 text-emerald-600' },
    saving: { label: 'Opslaan...', cls: 'bg-primary/10 text-primary', icon: Loader2 },
    saved: { label: 'Opgeslagen', cls: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
    error: { label: error ? 'Fout' : 'Fout', cls: 'bg-destructive/10 text-destructive', icon: AlertCircle },
  };
  const { label, cls, icon: Icon } = map[status];
  return (
    <span className={`ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {Icon && <Icon className={`h-3 w-3 ${status === 'uploading' || status === 'extracting' || status === 'saving' ? 'animate-spin' : ''}`} />}
      {label}
    </span>
  );
}

function FieldRow({ icon: Icon, label, value, onChange, disabled }: { icon: any; label: string; value: number; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</Label>
      <Input type="number" step="0.01" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
