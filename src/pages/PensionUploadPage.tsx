import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, FileText, PiggyBank, Shield, Wallet, Stethoscope } from 'lucide-react';
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

const fmt = (v: number) => `€${(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PensionUploadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState<PensionSnapshot | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const processFile = useCallback(async (file: File) => {
    if (!user) return;
    if (file.type !== 'application/pdf') {
      toast({ title: 'Ongeldig bestand', description: 'Upload een PDF-bestand.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setExtracted(null);
    setFileName(file.name);
    try {
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('pension-pdfs').upload(filePath, file);
      if (uploadError) throw uploadError;
      setPdfPath(filePath);

      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('extract-pension', {
        body: { pdf: base64, mimeType: file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setExtracted({
        snapshot_date: data.snapshot_date,
        year: data.year,
        pensioenreserve: Number(data.pensioenreserve) || 0,
        overlijdensdekking: Number(data.overlijdensdekking) || 0,
        pensioenreserve_vapz: Number(data.pensioenreserve_vapz) || 0,
        vap_riziv_toelage: Number(data.vap_riziv_toelage) || 0,
      });
      toast({ title: 'Data geëxtraheerd', description: 'Controleer de bedragen en sla op.' });
    } catch (err: any) {
      toast({ title: 'Fout', description: err.message || 'Verwerking mislukt.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [user, toast]);

  const handleSave = async () => {
    if (!user || !extracted) return;
    try {
      const { error } = await supabase.from('pension_records').insert({
        user_id: user.id,
        snapshot_date: extracted.snapshot_date,
        year: extracted.year,
        pensioenreserve: extracted.pensioenreserve,
        overlijdensdekking: extracted.overlijdensdekking,
        pensioenreserve_vapz: extracted.pensioenreserve_vapz,
        vap_riziv_toelage: extracted.vap_riziv_toelage,
        source_pdf_url: pdfPath,
        note: note || null,
      });
      if (error) throw error;
      toast({ title: 'Opgeslagen!', description: `Pensioensnapshot voor ${extracted.year} opgeslagen.` });
      navigate('/pensioen/overzicht');
    } catch (err: any) {
      toast({ title: 'Opslaan mislukt', description: err.message, variant: 'destructive' });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const updateField = (k: keyof PensionSnapshot, v: string) => {
    if (!extracted) return;
    if (k === 'snapshot_date') setExtracted({ ...extracted, snapshot_date: v, year: parseInt(v.slice(0, 4)) || extracted.year });
    else setExtracted({ ...extracted, [k]: parseFloat(v.replace(',', '.')) || 0 } as any);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pensioen PDF Uploaden</h1>
        <p className="text-muted-foreground mt-1">Upload het jaarlijkse pensioenoverzicht (PDF) om de reserves automatisch te extraheren.</p>
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
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground font-medium">PDF verwerken...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Sleep je pensioen-PDF hierheen</p>
                  <p className="text-sm text-muted-foreground mt-1">of klik om te bladeren</p>
                </div>
                <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            )}
          </div>
          {fileName && !uploading && (
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-2 justify-center">
              <FileText className="h-3.5 w-3.5" /> {fileName}
            </p>
          )}
        </CardContent>
      </Card>

      {extracted && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Geëxtraheerde gegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Referentiedatum</Label>
                <Input type="date" value={extracted.snapshot_date} onChange={(e) => updateField('snapshot_date', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Jaar</Label>
                <Input type="number" value={extracted.year} onChange={(e) => setExtracted({ ...extracted, year: parseInt(e.target.value) || extracted.year })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldRow icon={PiggyBank} label="Pensioenreserve" value={extracted.pensioenreserve} onChange={(v) => updateField('pensioenreserve', v)} />
              <FieldRow icon={Shield} label="Overlijdensdekking" value={extracted.overlijdensdekking} onChange={(v) => updateField('overlijdensdekking', v)} />
              <FieldRow icon={Wallet} label="Pensioenreserve VAPZ" value={extracted.pensioenreserve_vapz} onChange={(v) => updateField('pensioenreserve_vapz', v)} />
              <FieldRow icon={Stethoscope} label="VAP RIZIV toelage" value={extracted.vap_riziv_toelage} onChange={(v) => updateField('vap_riziv_toelage', v)} />
            </div>
            <div>
              <Label className="text-xs">Notitie (optioneel)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="bv. AG Insurance jaaroverzicht" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border/50">
              <div className="text-sm text-muted-foreground">
                Totale reserve: <span className="font-semibold text-foreground">{fmt(extracted.pensioenreserve + extracted.pensioenreserve_vapz + extracted.vap_riziv_toelage)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setExtracted(null); setPdfPath(null); setFileName(''); }}>Annuleren</Button>
                <Button onClick={handleSave}>Opslaan</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FieldRow({ icon: Icon, label, value, onChange }: { icon: any; label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} />
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
