import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Upload, Loader2, FileText, PiggyBank, Shield, Wallet, CheckCircle2, AlertCircle, Trash2, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { bumpDataVersion } from '@/hooks/useDataVersion';
import { PDF_UPLOAD_RULES, validateBatchForUpload } from '@/lib/fileValidation';
import { SIMPLE_CATEGORIES, IPT_CONFIG, PENSION_BUCKETS, type PensionCategory, type SimplePensionCategory, type SimpleSnapshot } from '@/lib/pensionCategories';

type ItemStatus = 'pending' | 'uploading' | 'extracting' | 'ready' | 'saving' | 'saved' | 'error';

interface IptSnapshot extends SimpleSnapshot {
  beginkapitaal: number;
  eindkapitaal: number;
  opgebouwde_reserve: number;
  overlijdenskapitaal: number;
  gewaarborgd_rendement: number;
  winst_uit_beleggingen: number;
  inkomende_bewegingen: number;
  uitgaande_bewegingen: number;
  kosten_taksen: number;
  kosten_overlijden: number;
}

type Snapshot = SimpleSnapshot | IptSnapshot;

interface BatchItem {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
  pdfPath?: string;
  extracted?: Snapshot;
  note: string;
}

const CATEGORY_OPTIONS: { value: PensionCategory; label: string; description: string }[] = [
  { value: 'ipt', label: IPT_CONFIG.label, description: IPT_CONFIG.description },
  ...SIMPLE_CATEGORIES.map(c => ({ value: c.key as PensionCategory, label: c.label, description: c.description })),
];

export default function PensionUploadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [category, setCategory] = useState<PensionCategory>('vapz');
  const [dragActive, setDragActive] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [savingAll, setSavingAll] = useState(false);

  const catConfig = useMemo(() => {
    if (category === 'ipt') return { functionName: IPT_CONFIG.functionName, table: IPT_CONFIG.table, bucket: PENSION_BUCKETS.ipt, label: IPT_CONFIG.label };
    const s = SIMPLE_CATEGORIES.find(c => c.key === category)!;
    return { functionName: s.functionName, table: s.table, bucket: PENSION_BUCKETS[category], label: s.label };
  }, [category]);

  const processFiles = useCallback(async (files: File[]) => {
    if (!user) return;
    const fileError = validateBatchForUpload(files, PDF_UPLOAD_RULES);
    if (fileError) {
      toast({ title: 'Ongeldige bestanden', description: fileError, variant: 'destructive' });
      return;
    }
    const newItems: BatchItem[] = files.map(f => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${f.name}`,
      file: f, status: 'pending', note: '',
    }));
    setItems(prev => [...prev, ...newItems]);

    for (const item of newItems) {
      try {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));
        const safeName = item.file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
        const filePath = `${user.id}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from(catConfig.bucket).upload(filePath, item.file, { contentType: item.file.type });
        if (upErr) throw upErr;

        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'extracting', pdfPath: filePath } : i));
        const base64 = await fileToBase64(item.file);
        const { data, error } = await supabase.functions.invoke(catConfig.functionName, { body: { pdf: base64, mimeType: item.file.type } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        let extracted: Snapshot;
        if (category === 'ipt') {
          extracted = {
            snapshot_date: data.snapshot_date,
            year: data.year,
            pensioenreserve: Number(data.opgebouwde_reserve) || 0,
            overlijdensdekking: Number(data.overlijdenskapitaal) || 0,
            jaarpremie: Number(data.jaarpremie) || 0,
            beginkapitaal: Number(data.beginkapitaal) || 0,
            eindkapitaal: Number(data.eindkapitaal) || 0,
            opgebouwde_reserve: Number(data.opgebouwde_reserve) || 0,
            overlijdenskapitaal: Number(data.overlijdenskapitaal) || 0,
            gewaarborgd_rendement: Number(data.gewaarborgd_rendement) || 0,
            winst_uit_beleggingen: Number(data.winst_uit_beleggingen) || 0,
            inkomende_bewegingen: Number(data.inkomende_bewegingen) || 0,
            uitgaande_bewegingen: Number(data.uitgaande_bewegingen) || 0,
            kosten_taksen: Number(data.kosten_taksen) || 0,
            kosten_overlijden: Number(data.kosten_overlijden) || 0,
          } as IptSnapshot;
        } else {
          extracted = {
            snapshot_date: data.snapshot_date,
            year: data.year,
            pensioenreserve: Number(data.pensioenreserve) || 0,
            overlijdensdekking: Number(data.overlijdensdekking) || 0,
            jaarpremie: Number(data.jaarpremie) || 0,
          };
        }
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'ready', extracted } : i));
      } catch (err: any) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message || 'Verwerking mislukt' } : i));
      }
    }
  }, [user, toast, category, catConfig]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  }, [processFiles]);

  const updateExtracted = (id: string, k: string, v: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id || !i.extracted) return i;
      const next: any = { ...i.extracted };
      if (k === 'snapshot_date') { next.snapshot_date = v; next.year = parseInt(v.slice(0, 4)) || next.year; }
      else if (k === 'year') { next.year = parseInt(v) || next.year; }
      else { next[k] = parseFloat(v.replace(',', '.')) || 0; }
      return { ...i, extracted: next };
    }));
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const saveAll = async () => {
    if (!user) return;
    const ready = items.filter(i => i.status === 'ready' && i.extracted);
    if (ready.length === 0) {
      toast({ title: 'Niets om op te slaan', variant: 'destructive' });
      return;
    }
    setSavingAll(true);
    let savedCount = 0;
    for (const item of ready) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'saving' } : i));
      try {
        const extracted = item.extracted!;
        let payload: any = {
          user_id: user.id,
          snapshot_date: extracted.snapshot_date,
          year: extracted.year,
          source_pdf_url: item.pdfPath,
          note: item.note || null,
        };
        if (category === 'ipt') {
          const ipt = extracted as IptSnapshot;
          payload = { ...payload,
            beginkapitaal: ipt.beginkapitaal, eindkapitaal: ipt.eindkapitaal,
            opgebouwde_reserve: ipt.opgebouwde_reserve, jaarpremie: ipt.jaarpremie,
            overlijdenskapitaal: ipt.overlijdenskapitaal, gewaarborgd_rendement: ipt.gewaarborgd_rendement,
            winst_uit_beleggingen: ipt.winst_uit_beleggingen,
            inkomende_bewegingen: ipt.inkomende_bewegingen, uitgaande_bewegingen: ipt.uitgaande_bewegingen,
            kosten_taksen: ipt.kosten_taksen, kosten_overlijden: ipt.kosten_overlijden,
          };
        } else {
          payload = { ...payload,
            pensioenreserve: extracted.pensioenreserve,
            overlijdensdekking: extracted.overlijdensdekking,
            jaarpremie: extracted.jaarpremie,
          };
        }
        const { error } = await (supabase as any).from(catConfig.table).insert(payload);
        if (error) throw error;
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'saved' } : i));
        savedCount++;
      } catch (err: any) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message } : i));
      }
    }
    setSavingAll(false);
    toast({ title: 'Opgeslagen', description: `${savedCount} van ${ready.length} ${catConfig.label}-snapshots opgeslagen.` });
    if (savedCount > 0) {
      bumpDataVersion();
      setTimeout(() => navigate('/pensioen'), 800);
    }
  };

  const anyBusy = items.some(i => i.status === 'uploading' || i.status === 'extracting' || i.status === 'saving');
  const readyCount = items.filter(i => i.status === 'ready').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pensioen uploaden</h1>
        <p className="text-muted-foreground mt-1">Kies een categorie en sleep één of meerdere jaarlijkse PDFs — reserve, overlijdensdekking en jaarpremie worden automatisch geëxtraheerd.</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label className="text-xs">Categorie</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as PensionCategory)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col text-left">
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center"><Upload className="h-6 w-6 text-muted-foreground" /></div>
              <div>
                <p className="font-medium text-foreground">Sleep één of meerdere {catConfig.label}-PDFs hierheen</p>
                <p className="text-sm text-muted-foreground mt-1">of klik om bestanden te selecteren</p>
              </div>
              <input type="file" accept="application/pdf" multiple onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) processFiles(fs); e.target.value = ''; }} className="absolute inset-0 opacity-0 cursor-pointer" />
            </div>
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Verwerking ({items.length} bestanden)</h2>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button variant="outline" disabled={anyBusy || savingAll} onClick={() => setItems([])}>Lijst wissen</Button>
              <Button disabled={readyCount === 0 || savingAll || anyBusy} onClick={saveAll}>
                {savingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Alles opslaan ({readyCount})
              </Button>
            </div>
          </div>

          {items.map(item => (
            <Collapsible key={item.id} defaultOpen={true}>
              <Card className="border-border/50">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors select-none">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{item.file.name}</span>
                        <StatusBadge status={item.status} />
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} disabled={item.status === 'saving'}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
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
                        <FieldRow icon={PiggyBank} label="Pensioenreserve" value={item.extracted.pensioenreserve} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'pensioenreserve', v)} />
                        <FieldRow icon={Shield} label="Overlijdensdekking" value={item.extracted.overlijdensdekking} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'overlijdensdekking', v)} />
                        <FieldRow icon={Wallet} label="Jaarpremie" value={item.extracted.jaarpremie} disabled={item.status !== 'ready'} onChange={(v) => updateExtracted(item.id, 'jaarpremie', v)} />
                      </div>
                      <div>
                        <Label className="text-xs">Notitie (optioneel)</Label>
                        <Input value={item.note} disabled={item.status !== 'ready'} onChange={(e) => setItems(prev => prev.map(i => i.id === item.id ? { ...i, note: e.target.value } : i))} placeholder="bv. AG Insurance jaaroverzicht" />
                      </div>
                    </CardContent>
                  )}
                  {item.status === 'error' && (
                    <CardContent><p className="text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" />{item.error}</p></CardContent>
                  )}
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const map: Record<ItemStatus, { label: string; cls: string; icon?: any }> = {
    pending: { label: 'Wachten...', cls: 'bg-muted text-muted-foreground' },
    uploading: { label: 'Uploaden...', cls: 'bg-primary/10 text-primary', icon: Loader2 },
    extracting: { label: 'Extraheren...', cls: 'bg-primary/10 text-primary', icon: Loader2 },
    ready: { label: 'Klaar', cls: 'bg-emerald-500/10 text-emerald-600' },
    saving: { label: 'Opslaan...', cls: 'bg-primary/10 text-primary', icon: Loader2 },
    saved: { label: 'Opgeslagen', cls: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
    error: { label: 'Fout', cls: 'bg-destructive/10 text-destructive', icon: AlertCircle },
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
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
