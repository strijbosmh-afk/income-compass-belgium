import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, Image, Activity, Building2, Users, Camera as CameraIcon, Images, Check, Inbox, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ExtractedDataReview } from '@/components/ExtractedDataReview';
import { type IncomeType } from '@/lib/incomeTypes';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useUploadReviewInbox, type UploadReviewStatus } from '@/hooks/useUploadReviewInbox';

export interface ExtractedRecord {
  record_date: string;
  month: number;
  year: number;
  income_type: IncomeType;
  nomenclature_code: string;
  description: string;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  aandeel_arts: number;
  bouwfonds: number;
  mif: number;
  netto: number;
  source_image_url?: string | null;
}

const MONTH_NAMES = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

export default function UploadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedRecord[] | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [incomeType, setIncomeType] = useState<IncomeType | ''>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [unitNettoByCode, setUnitNettoByCode] = useState<Record<string, number>>({});
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const inbox = useUploadReviewInbox(user?.id);

  const processFile = useCallback(async (file: File) => {
    if (!user) return;
    if (!incomeType) {
      toast({ title: 'Kies type inkomen', description: 'Selecteer Ambulant, Gehospitaliseerd of Associatie.', variant: 'destructive' });
      return;
    }
    if (!selectedMonth) {
      toast({ title: 'Kies een maand', description: 'Selecteer de maand van deze inkomsten.', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Ongeldig bestand', description: 'Upload een afbeelding.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    setExtractedData(null);

    try {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target?.result as string);
      reader.readAsDataURL(file);

      const safeName = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
      const filePath = `${user.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from('screenshots').upload(filePath, file);
      if (uploadError) throw uploadError;

      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('extract-income', {
        body: { image: base64, mimeType: file.type, unitNettoByCode, incomeType },
      });
      if (error) throw error;

      if (data?.records?.length) {
        const month = parseInt(selectedMonth);
        const year = parseInt(selectedYear);
        const recordDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const records = data.records.map((r: ExtractedRecord) => ({
          ...r,
          income_type: incomeType,
          month,
          year,
          record_date: recordDate,
          source_image_url: filePath,
          // netto blijft EXACT zoals geëxtraheerd uit de screenshot — niet herberekenen.
        }));
        setExtractedData(records);
        const preview = await fileToDataUrl(file);
        setPreviewUrl(preview);
        const draftId = inbox.addBatch({
          records,
          previewUrl: null,
          month,
          year,
          incomeType,
          title: `${MONTH_NAMES[month - 1]} ${year} · ${incomeTypeLabelShort(incomeType)} · ${records.length} regels`,
        });
        setActiveReviewId(draftId);
        const skip9 = data.skippedAccount9 > 0 ? ` (${data.skippedAccount9} regel(s) met rek. 9 overgeslagen)` : '';
        const skip0 = data.skippedAccount0 > 0 ? ` (${data.skippedAccount0} regel(s) met rek. 0 overgeslagen)` : '';
        toast({ title: 'Toegevoegd aan review inbox', description: `${records.length} record(s) gevonden${skip9}${skip0}. Controleer vóór opslaan.` });
      } else if (data?.skippedAccount9 > 0 || data?.skippedAccount0 > 0) {
        toast({ title: 'Alles gefilterd', description: `Alle regels weggefilterd op rekeningnummer — niets om op te slaan.`, variant: 'destructive' });
      } else {
        toast({ title: 'Geen data gevonden', description: 'Kon geen inkomstengegevens uit deze afbeelding halen.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Fout', description: err.message || 'Verwerking mislukt.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [user, toast, incomeType, selectedMonth, selectedYear, unitNettoByCode, inbox]);

  // Haal nomenclatuur netto-bedragen op zodat de extractie quantity correct kan afleiden.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('nomenclature_codes')
        .select('code, netto_amount')
        .eq('user_id', user.id);
      if (data) {
        const map: Record<string, number> = {};
        data.forEach((nc: any) => {
          const v = Number(nc.netto_amount);
          if (nc.code && Number.isFinite(v) && v > 0) map[String(nc.code).trim()] = v;
        });
        setUnitNettoByCode(map);
      }
    })();
  }, [user]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const openNativePicker = async (source: CameraSource) => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const photo = await Camera.getPhoto({
        source,
        resultType: CameraResultType.Base64,
        quality: 92,
        correctOrientation: true,
        allowEditing: false,
      });
      if (!photo.base64String) throw new Error('De afbeelding kon niet worden gelezen.');
      const mimeType = `image/${photo.format === 'jpg' ? 'jpeg' : photo.format}`;
      const bytes = Uint8Array.from(atob(photo.base64String), (character) => character.charCodeAt(0));
      const file = new File([bytes], `income-${Date.now()}.${photo.format}`, { type: mimeType });
      await processFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message && !message.toLowerCase().includes('cancel')) {
        toast({ title: 'Afbeelding openen mislukt', description: message, variant: 'destructive' });
      }
    }
  };

  const handleSaveRecords = async (records: ExtractedRecord[]) => {
    if (!user) return;
    try {
      // Harde guardrail: netto MOET binnen €0,02 matchen met aandeel - bouwfonds - mif.
      const TOLERANCE = 0.02;
      const fmt = (v: number) => `€${v.toLocaleString('de-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const invalid = records.map((r, idx) => {
        const computed = Math.round(((r.aandeel_arts || 0) - (r.bouwfonds || 0) - (r.mif || 0)) * 100) / 100;
        const diff = Math.round(((r.netto || 0) - computed) * 100) / 100;
        return { r, idx, computed, diff };
      }).filter(x => Math.abs(x.diff) > TOLERANCE);

      if (invalid.length > 0) {
        const previewLines = invalid.slice(0, 3).map(x =>
          `• Regel ${x.idx + 1} (${x.r.nomenclature_code || '—'}): netto ${fmt(x.r.netto || 0)} ≠ berekend ${fmt(x.computed)} (Δ ${fmt(x.diff)})`
        );
        const extra = invalid.length > 3 ? `…en nog ${invalid.length - 3} regel(s).` : '';
        toast({
          title: `🚫 Opslaan geblokkeerd — ${invalid.length} regel(s) wijken af`,
          description: (
            <div className="space-y-1 whitespace-pre-line text-xs">
              <p>Netto moet gelijk zijn aan aandeel − bouwfonds − MIF (tolerantie €0,02).</p>
              <div className="font-mono">
                {previewLines.map((l, i) => <div key={i}>{l}</div>)}
                {extra && <div className="opacity-80">{extra}</div>}
              </div>
              <p>Corrigeer of verwijder deze regel(s) en probeer opnieuw.</p>
            </div>
          ) as any,
          variant: 'destructive',
          duration: 12000,
        });
        if (activeReviewId) inbox.updateStatus(activeReviewId, 'blocked');
        return;
      }

      // Uniciteits-guardrail: per upload mag elke (nomenclatuur_code + type) maar 1x voorkomen.
      const dupMap = new Map<string, number[]>();
      records.forEach((r, i) => {
        const key = `${(r.nomenclature_code || '').trim()}__${r.income_type}`;
        if (!dupMap.has(key)) dupMap.set(key, []);
        dupMap.get(key)!.push(i + 1);
      });
      const dups = Array.from(dupMap.entries()).filter(([, idxs]) => idxs.length > 1);
      if (dups.length > 0) {
        const dupLines = dups.slice(0, 3).map(([key, idxs]) => {
          const [code, type] = key.split('__');
          const typeLabel = type === 'ambulatory' ? 'Amb' : type === 'hospitalized' ? 'Hosp' : 'Assoc';
          return `• ${code} (${typeLabel}): rijen ${idxs.join(', ')}`;
        });
        const extra = dups.length > 3 ? `…en nog ${dups.length - 3} duplicaat(en).` : '';
        toast({
          title: `🚫 Opslaan geblokkeerd — ${dups.length} dubbele nomenclatuur(en)`,
          description: (
            <div className="space-y-1 whitespace-pre-line text-xs">
              <p>Per upload mag elke nomenclatuurcode (per type) maar 1 keer voorkomen. Voeg de aantallen + bedragen samen tot 1 rij of verwijder de overtollige rij(en).</p>
              <div className="font-mono">
                {dupLines.map((l, i) => <div key={i}>{l}</div>)}
                {extra && <div className="opacity-80">{extra}</div>}
              </div>
            </div>
          ) as any,
          variant: 'destructive',
          duration: 12000,
        });
        if (activeReviewId) inbox.updateStatus(activeReviewId, 'blocked');
        return;
      }
      // Bedragen worden 1-op-1 uit de screenshot bewaard — niet herberekenen.
      // Voor 'associatie' bewaren we het volledige poolbedrag (niet halveren).
      const insertData = records.map((rec: any) => {
        const clean: any = { user_id: user.id };
        for (const [k, v] of Object.entries(rec)) {
          if (k.startsWith('_')) continue;
          if (k === 'account_number') continue; // niet in DB-schema
          clean[k] = v;
        }
        return clean;
      });
      const { error } = await supabase.from('income_records').insert(insertData);
      if (error) throw error;
      toast({
        title: 'Opgeslagen!',
        description: `${records.length} record(s) opgeslagen.`,
      });
      if (activeReviewId) inbox.updateStatus(activeReviewId, 'saved');
      setExtractedData(null);
      setPreviewUrl(null);
      setActiveReviewId(null);
    } catch (err: any) {
      if (activeReviewId) inbox.updateStatus(activeReviewId, 'blocked');
      toast({ title: 'Opslaan mislukt', description: err.message, variant: 'destructive' });
    }
  };

  const openReviewBatch = (id: string) => {
    const item = inbox.items.find(batch => batch.id === id);
    if (!item) return;
    setActiveReviewId(item.id);
    setExtractedData(item.records);
    setPreviewUrl(item.previewUrl);
    if (item.status !== 'saved') inbox.updateStatus(item.id, 'ready');
  };

  const closeCurrentReview = () => {
    if (activeReviewId) inbox.updateStatus(activeReviewId, 'needs_review');
    setActiveReviewId(null);
    setExtractedData(null);
    setPreviewUrl(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
      <div className="ios-page-title">
        <div>
          <p className="ios-eyebrow">Nieuwe inkomsten</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Uploaden</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">Fotografeer of kies je inkomstenoverzicht. MedIncome haalt de regels er automatisch uit.</p>
        </div>
        <div className="ios-step-progress" aria-label="Voortgang">
          {[Boolean(incomeType), Boolean(selectedMonth), Boolean(extractedData)].map((done, index) => (
            <span key={index} className={done ? 'ios-step-complete' : ''}>{done ? <Check className="h-3 w-3" /> : index + 1}</span>
          ))}
        </div>
      </div>

      {inbox.items.length > 0 && (
        <Card className="ios-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                Review inbox
              </CardTitle>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {inbox.counts.needsReview > 0 && <Badge variant="outline">{inbox.counts.needsReview} te controleren</Badge>}
                {inbox.counts.blocked > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/20">{inbox.counts.blocked} geblokkeerd</Badge>}
                {inbox.counts.saved > 0 && <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">{inbox.counts.saved} opgeslagen</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {inbox.items.map(item => (
              <div key={item.id} className={`rounded-xl border p-3 ${activeReviewId === item.id ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-muted/20'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <ReviewStatusBadge status={item.status} />
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <Button size="sm" variant={item.status === 'saved' ? 'outline' : 'default'} onClick={() => openReviewBatch(item.id)}>
                    {item.status === 'saved' ? 'Bekijken' : 'Controleren'}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => inbox.removeBatch(item.id)} title="Verwijderen">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
            {inbox.counts.saved > 0 && (
              <Button size="sm" variant="ghost" className="w-full" onClick={inbox.clearSaved}>
                Opgeslagen items opruimen
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Type inkomen selectie */}
      <Card className="ios-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base"><span className="ios-step-number">1</span> Type inkomen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
            <button
              onClick={() => setIncomeType('ambulatory')}
              className={`ios-choice-card ${
                incomeType === 'ambulatory'
                  ? 'border-secondary bg-secondary/5 ring-1 ring-secondary/20'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <Activity className={`h-5 w-5 ${incomeType === 'ambulatory' ? 'text-secondary' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className={`font-medium ${incomeType === 'ambulatory' ? 'text-foreground' : 'text-muted-foreground'}`}>Ambulant</p>
                <p className="hidden md:block text-xs text-muted-foreground">Poliklinische raadplegingen</p>
              </div>
            </button>
            <button
              onClick={() => setIncomeType('hospitalized')}
              className={`ios-choice-card ${
                incomeType === 'hospitalized'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <Building2 className={`h-5 w-5 ${incomeType === 'hospitalized' ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className={`font-medium ${incomeType === 'hospitalized' ? 'text-foreground' : 'text-muted-foreground'}`}>Gehospitaliseerd</p>
                <p className="hidden md:block text-xs text-muted-foreground">Klinische zorg</p>
              </div>
            </button>
            <button
              onClick={() => setIncomeType('associatie')}
              className={`ios-choice-card ${
                incomeType === 'associatie'
                  ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <Users className={`h-5 w-5 ${incomeType === 'associatie' ? 'text-accent-foreground' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className={`font-medium ${incomeType === 'associatie' ? 'text-foreground' : 'text-muted-foreground'}`}>Associatie</p>
                <p className="hidden md:block text-xs text-muted-foreground">Volledig poolbedrag</p>
              </div>
            </button>
          </div>
          {incomeType === 'associatie' && (
            <p className="mt-3 text-xs text-muted-foreground rounded-md border border-border/50 bg-muted/30 p-2">
              Bedragen uit deze upload worden 1-op-1 opgeslagen (volledig poolbedrag, niet gehalveerd).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Maand en jaar selectie */}
      <Card className={`ios-card ${!incomeType ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base"><span className="ios-step-number">2</span> Periode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full h-12 rounded-xl"><SelectValue placeholder="Kies maand" /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, idx) => (
                  <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full h-12 rounded-xl"><SelectValue placeholder="Jaar" /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Upload zone */}
      <Card className={`ios-card ${!incomeType || !selectedMonth ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base"><span className="ios-step-number">3</span> Voeg afbeelding toe</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Button
              type="button"
              className="ios-capture-button [&_svg]:!size-6"
              onClick={() => void openNativePicker(CameraSource.Camera)}
              asChild={!Capacitor.isNativePlatform()}
              disabled={uploading}
            >
              {Capacitor.isNativePlatform() ? (
                <><CameraIcon className="h-6 w-6" /><span>Maak foto</span></>
              ) : (
                <label><CameraIcon className="h-6 w-6" /><span>Maak foto</span><input type="file" accept="image/*" capture="environment" onChange={handleFileInput} className="sr-only" /></label>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="ios-capture-button [&_svg]:!size-6"
              onClick={() => void openNativePicker(CameraSource.Photos)}
              asChild={!Capacitor.isNativePlatform()}
              disabled={uploading}
            >
              {Capacitor.isNativePlatform() ? (
                <><Images className="h-6 w-6" /><span>Kies foto</span></>
              ) : (
                <label><Images className="h-6 w-6" /><span>Kies foto</span><input type="file" accept="image/*" onChange={handleFileInput} className="sr-only" /></label>
              )}
            </Button>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`hidden md:block relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              dragActive ? 'border-secondary bg-secondary/5' : 'border-border hover:border-muted-foreground/30'
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-secondary" />
                <p className="text-muted-foreground font-medium">Afbeelding verwerken...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Sleep je screenshot hierheen</p>
                  <p className="text-sm text-muted-foreground mt-1">of klik om te bladeren</p>
                </div>
                <input type="file" accept="image/*" onChange={handleFileInput} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {previewUrl && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              Voorbeeld
            </CardTitle>
          </CardHeader>
          <CardContent>
            <img src={previewUrl} alt="Geüploade screenshot" className="rounded-lg max-h-64 object-contain mx-auto" />
          </CardContent>
        </Card>
      )}

      {extractedData && (
        <ExtractedDataReview records={extractedData} unitNettoByCode={unitNettoByCode} onSave={handleSaveRecords} onCancel={closeCurrentReview} />
      )}
    </div>
  );
}

function ReviewStatusBadge({ status }: { status: UploadReviewStatus }) {
  if (status === 'saved') return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Opgeslagen</Badge>;
  if (status === 'blocked') return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Geblokkeerd</Badge>;
  if (status === 'ready') return <Badge className="bg-primary/10 text-primary border-primary/20">Open</Badge>;
  return <Badge variant="outline">Te controleren</Badge>;
}

function incomeTypeLabelShort(type: IncomeType) {
  if (type === 'ambulatory') return 'Ambulant';
  if (type === 'hospitalized') return 'Gehospitaliseerd';
  return 'Associatie';
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
