import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Upload, Loader2, FileText, PiggyBank, Wallet, Shield, Percent, CheckCircle2, AlertCircle, Trash2, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Receipt, HeartPulse, Landmark, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface IptSnapshot {
  snapshot_date: string;
  year: number;
  beginkapitaal: number;
  eindkapitaal: number;
  opgebouwde_reserve: number;
  jaarpremie: number;
  overlijdenskapitaal: number;
  gewaarborgd_rendement: number;
  winst_uit_beleggingen: number;
  inkomende_bewegingen: number;
  uitgaande_bewegingen: number;
  kosten_taksen: number;
  kosten_overlijden: number;
}

type ItemStatus = 'pending' | 'uploading' | 'extracting' | 'ready' | 'saving' | 'saved' | 'error';

interface BatchItem {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
  pdfPath?: string;
  extracted?: IptSnapshot;
  note: string;
}

export default function PensionIptUploadPage() {
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

    for (const item of newItems) {
      try {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));
        const filePath = `${user.id}/${Date.now()}_${item.file.name}`;
        const { error: uploadError } = await supabase.storage.from('pension-ipt-pdfs').upload(filePath, item.file);
        if (uploadError) throw uploadError;

        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'extracting', pdfPath: filePath } : i));
        const base64 = await fileToBase64(item.file);
        const { data, error } = await supabase.functions.invoke('extract-pension-ipt', {
          body: { pdf: base64, mimeType: item.file.type },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const extracted: IptSnapshot = {
          snapshot_date: data.snapshot_date,
          year: data.year,
          beginkapitaal: Number(data.beginkapitaal) || 0,
          eindkapitaal: Number(data.eindkapitaal) || 0,
          opgebouwde_reserve: Number(data.opgebouwde_reserve) || 0,
          jaarpremie: Number(data.jaarpremie) || 0,
          overlijdenskapitaal: Number(data.overlijdenskapitaal) || 0,
          gewaarborgd_rendement: Number(data.gewaarborgd_rendement) || 0,
          winst_uit_beleggingen: Number(data.winst_uit_beleggingen) || 0,
          inkomende_bewegingen: Number(data.inkomende_bewegingen) || 0,
          uitgaande_bewegingen: Number(data.uitgaande_bewegingen) || 0,
          kosten_taksen: Number(data.kosten_taksen) || 0,
          kosten_overlijden: Number(data.kosten_overlijden) || 0,
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

  const updateExtracted = (id: string, k: keyof IptSnapshot, v: string) => {
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
        const { error } = await supabase.from('pension_ipt_records').insert({
          user_id: user.id,
          snapshot_date: item.extracted!.snapshot_date,
          year: item.extracted!.year,
          beginkapitaal: item.extracted!.beginkapitaal,
          eindkapitaal: item.extracted!.eindkapitaal,
          opgebouwde_reserve: item.extracted!.opgebouwde_reserve,
          jaarpremie: item.extracted!.jaarpremie,
          overlijdenskapitaal: item.extracted!.overlijdenskapitaal,
          gewaarborgd_rendement: item.extracted!.gewaarborgd_rendement,
          winst_uit_beleggingen: item.extracted!.winst_uit_beleggingen,
          inkomende_bewegingen: item.extracted!.inkomende_bewegingen,
          uitgaande_bewegingen: item.extracted!.uitgaande_bewegingen,
          kosten_taksen: item.extracted!.kosten_taksen,
          kosten_overlijden: item.extracted!.kosten_overlijden,
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
    toast({ title: 'Opgeslagen', description: `${savedCount} van ${ready.length} IPT-snapshots opgeslagen.` });
    if (savedCount > 0) setTimeout(() => navigate('/pensioen/overzicht'), 800);
  };

  const anyBusy = items.some(i => i.status === 'uploading' || i.status === 'extracting' || i.status === 'saving');
  const readyCount = items.filter(i => i.status === 'ready').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">IPT PDF Uploaden</h1>
        <p className="text-muted-foreground mt-1">Upload jaarlijkse IPT-overzichten (Individuele Pensioentoezegging) — reserve, premie en dekking worden automatisch geëxtraheerd.</p>
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
                <p className="font-medium text-foreground">Sleep één of meerdere IPT-PDFs hierheen</p>
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
                    <FieldRow icon={Landmark} label="Beginkapitaal (01/01)" value={item.extracted.beginkapitaal} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'beginkapitaal', v)} />
                    <FieldRow icon={PiggyBank} label="Eindkapitaal (01/01 volgend jaar)" value={item.extracted.eindkapitaal} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'eindkapitaal', v)} />
                    <FieldRow icon={PiggyBank} label="Opgebouwde reserve" value={item.extracted.opgebouwde_reserve} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'opgebouwde_reserve', v)} />
                    <FieldRow icon={Wallet} label="Jaarpremie" value={item.extracted.jaarpremie} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'jaarpremie', v)} />
                    <FieldRow icon={TrendingUp} label="Winst uit beleggingen" value={item.extracted.winst_uit_beleggingen} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'winst_uit_beleggingen', v)} />
                    <FieldRow icon={ArrowDownToLine} label="Inkomende bewegingen" value={item.extracted.inkomende_bewegingen} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'inkomende_bewegingen', v)} />
                    <FieldRow icon={ArrowUpFromLine} label="Uitgaande bewegingen" value={item.extracted.uitgaande_bewegingen} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'uitgaande_bewegingen', v)} />
                    <FieldRow icon={Receipt} label="Kosten en taksen" value={item.extracted.kosten_taksen} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'kosten_taksen', v)} />
                    <FieldRow icon={HeartPulse} label="Kosten dekking overlijden" value={item.extracted.kosten_overlijden} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'kosten_overlijden', v)} />
                    <FieldRow icon={Shield} label="Overlijdenskapitaal" value={item.extracted.overlijdenskapitaal} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'overlijdenskapitaal', v)} />
                    <FieldRow icon={Percent} label="Gewaarborgd rendement (%)" value={item.extracted.gewaarborgd_rendement} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'gewaarborgd_rendement', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Notitie (optioneel)</Label>
                    <Input value={item.note} disabled={item.status !== 'ready'} onChange={(e) => updateNote(item.id, e.target.value)} placeholder="bv. AG Insurance IPT 2024" />
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
