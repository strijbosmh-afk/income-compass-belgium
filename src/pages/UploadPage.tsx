import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, Image, Activity, Building2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ExtractedDataReview } from '@/components/ExtractedDataReview';
import { type IncomeType } from '@/lib/incomeTypes';
import { IMAGE_UPLOAD_RULES, validateFileForUpload } from '@/lib/fileValidation';

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
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [unitNettoByCode, setUnitNettoByCode] = useState<Record<string, number>>({});

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
    const fileError = validateFileForUpload(file, IMAGE_UPLOAD_RULES);
    if (fileError) {
      toast({ title: 'Ongeldig bestand', description: fileError, variant: 'destructive' });
      return;
    }

    setUploading(true);
    setExtractedData(null);

    try {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target?.result as string);
      reader.readAsDataURL(file);

      const safeName = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
      const filePath = `${user.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from('screenshots').upload(filePath, file, {
        contentType: file.type,
      });
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
        const skip9 = data.skippedAccount9 > 0 ? ` (${data.skippedAccount9} regel(s) met rek. 9 overgeslagen)` : '';
        const skip0 = data.skippedAccount0 > 0 ? ` (${data.skippedAccount0} regel(s) met rek. 0 overgeslagen)` : '';
        toast({ title: 'Data geëxtraheerd', description: `${records.length} record(s) gevonden${skip9}${skip0}.` });
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
  }, [user, toast, incomeType, selectedMonth, selectedYear, unitNettoByCode]);

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
  };

  const [saving, setSaving] = useState(false);
  const handleSaveRecords = async (records: ExtractedRecord[]) => {
    if (!user) return;
    if (saving) return; // voorkom dubbele klik → dubbele insert
    setSaving(true);
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
        return;
      }

      // Structurele fix: bronrapporten splitsen dezelfde nomenclatuurcode per kostenplaats.
      // We aggregeren automatisch per (code + type) i.p.v. te blokkeren — som van qty en bedragen.
      const aggMap = new Map<string, ExtractedRecord>();
      let mergedCount = 0;
      for (const r of records) {
        const key = `${(r.nomenclature_code || '').trim()}__${r.income_type}`;
        const existing = aggMap.get(key);
        if (!existing) {
          aggMap.set(key, { ...r });
        } else {
          mergedCount++;
          existing.quantity = (existing.quantity || 0) + (r.quantity || 0);
          existing.total_amount = Math.round(((existing.total_amount || 0) + (r.total_amount || 0)) * 100) / 100;
          existing.aandeel_arts = Math.round(((existing.aandeel_arts || 0) + (r.aandeel_arts || 0)) * 100) / 100;
          existing.bouwfonds = Math.round(((existing.bouwfonds || 0) + (r.bouwfonds || 0)) * 100) / 100;
          existing.mif = Math.round(((existing.mif || 0) + (r.mif || 0)) * 100) / 100;
          existing.netto = Math.round(((existing.netto || 0) + (r.netto || 0)) * 100) / 100;
          // unit_amount blijft ongewijzigd (zelfde code = zelfde tarief)
        }
      }
      if (mergedCount > 0) {
        records = Array.from(aggMap.values());
        toast({
          title: `ℹ️ ${mergedCount} regel(s) samengevoegd`,
          description: 'Dezelfde nomenclatuurcode kwam meerdere keren voor (verschillende kostenplaatsen). Aantallen en bedragen zijn opgeteld tot 1 rij per code.',
          duration: 6000,
        });
      }
      // Pre-check: bestaan er al records voor deze (maand + type + codes)?
      // Dit voorkomt dat dezelfde upload per ongeluk 2× wordt opgeslagen
      // (bv. bij dubbelklikken of terug-navigeren) en beschermt zo o.a. de
      // associatie-verdeling die anders 2× 50% = 100% van de pool zou tonen.
      const codes = records.map(r => (r.nomenclature_code || '').trim()).filter(Boolean);
      const firstDate = records[0]?.record_date;
      const firstType = records[0]?.income_type;
      if (firstDate && firstType && codes.length > 0) {
        const { data: existing, error: checkErr } = await supabase
          .from('income_records')
          .select('nomenclature_code')
          .eq('user_id', user.id)
          .eq('income_type', firstType)
          .eq('record_date', firstDate)
          .in('nomenclature_code', codes);
        if (checkErr) throw checkErr;
        if (existing && existing.length > 0) {
          const existingCodes = Array.from(new Set(existing.map((e: any) => e.nomenclature_code)));
          toast({
            title: '🚫 Al opgeslagen voor deze maand',
            description: `Er bestaan al ${existing.length} record(s) voor deze maand & type met code(s): ${existingCodes.slice(0, 5).join(', ')}${existingCodes.length > 5 ? '…' : ''}. Verwijder eerst de bestaande records via 'Overzicht' als je opnieuw wil uploaden.`,
            variant: 'destructive',
            duration: 12000,
          });
          return;
        }
      }

      // Bedragen worden 1-op-1 uit de screenshot doorgestuurd.
      // Voor 'associatie' zet de database dit automatisch om naar het 50%-aandeel.
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
      if (error) {
        // Unieke index vangt duplicaten op als laatste vangnet.
        if ((error as any).code === '23505') {
          toast({
            title: '🚫 Dubbele record geweigerd',
            description: 'Deze combinatie van maand, type en nomenclatuurcode bestaat al in de database.',
            variant: 'destructive',
            duration: 12000,
          });
          return;
        }
        throw error;
      }
      toast({
        title: 'Opgeslagen!',
        description: `${records.length} record(s) opgeslagen.`,
      });
      setExtractedData(null);
      setPreviewUrl(null);
    } catch (err: any) {
      toast({ title: 'Opslaan mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Screenshot uploaden</h1>
        <p className="text-muted-foreground mt-1">Upload een screenshot van je inkomenoverzicht om data te extraheren en op te slaan.</p>
      </div>

      {/* Type inkomen selectie */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Type inkomen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setIncomeType('ambulatory')}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                incomeType === 'ambulatory'
                  ? 'border-secondary bg-secondary/5 ring-1 ring-secondary/20'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <Activity className={`h-5 w-5 ${incomeType === 'ambulatory' ? 'text-secondary' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className={`font-medium ${incomeType === 'ambulatory' ? 'text-foreground' : 'text-muted-foreground'}`}>Ambulant</p>
                <p className="text-xs text-muted-foreground">Poliklinische raadplegingen</p>
              </div>
            </button>
            <button
              onClick={() => setIncomeType('hospitalized')}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                incomeType === 'hospitalized'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <Building2 className={`h-5 w-5 ${incomeType === 'hospitalized' ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className={`font-medium ${incomeType === 'hospitalized' ? 'text-foreground' : 'text-muted-foreground'}`}>Gehospitaliseerd</p>
                <p className="text-xs text-muted-foreground">Klinische zorg</p>
              </div>
            </button>
            <button
              onClick={() => setIncomeType('associatie')}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                incomeType === 'associatie'
                  ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <Users className={`h-5 w-5 ${incomeType === 'associatie' ? 'text-accent-foreground' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className={`font-medium ${incomeType === 'associatie' ? 'text-foreground' : 'text-muted-foreground'}`}>Associatie</p>
                <p className="text-xs text-muted-foreground">Gepoold met dr. Schrevens — 50% eigen aandeel</p>
              </div>
            </button>
          </div>
          {incomeType === 'associatie' && (
            <p className="mt-3 text-xs text-muted-foreground rounded-md border border-border/50 bg-muted/30 p-2">
              Bedragen uit deze upload worden bij opslaan automatisch naar 50% eigen aandeel omgerekend.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Maand en jaar selectie */}
      <Card className={`border-border/50 ${!incomeType ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle className="text-base">Periode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Kies maand" /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, idx) => (
                  <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Jaar" /></SelectTrigger>
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
      <Card className={`border-border/50 ${!incomeType || !selectedMonth ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
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
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileInput} className="absolute inset-0 opacity-0 cursor-pointer" />
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
        <ExtractedDataReview records={extractedData} unitNettoByCode={unitNettoByCode} onSave={handleSaveRecords} onCancel={() => { setExtractedData(null); setPreviewUrl(null); }} />
      )}
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
