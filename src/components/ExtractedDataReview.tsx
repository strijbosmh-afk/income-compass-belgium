import { useState } from 'react';
import type { ExtractedRecord } from '@/pages/UploadPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, X, Trash2 } from 'lucide-react';

interface Props {
  records: ExtractedRecord[];
  onSave: (records: ExtractedRecord[]) => void;
  onCancel: () => void;
}

export function ExtractedDataReview({ records: initialRecords, onSave, onCancel }: Props) {
  const [records, setRecords] = useState<ExtractedRecord[]>(initialRecords);

  const updateRecord = (idx: number, field: keyof ExtractedRecord, value: any) => {
    setRecords(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRecord = (idx: number) => {
    setRecords(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Review Extracted Data</CardTitle>
        <span className="text-sm text-muted-foreground">{records.length} record(s)</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">RIZIV Code</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Description</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Qty</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Unit €</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Total €</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={idx} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-2">
                    <Input type="date" value={r.record_date} onChange={e => updateRecord(idx, 'record_date', e.target.value)} className="h-8 text-xs w-32" />
                  </td>
                  <td className="py-2 px-2">
                    <Select value={r.income_type} onValueChange={v => updateRecord(idx, 'income_type', v)}>
                      <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ambulatory">Ambulatory</SelectItem>
                        <SelectItem value="hospitalized">Hospitalized</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 px-2">
                    <Input value={r.nomenclature_code} onChange={e => updateRecord(idx, 'nomenclature_code', e.target.value)} className="h-8 text-xs font-mono w-24" />
                  </td>
                  <td className="py-2 px-2">
                    <Input value={r.description} onChange={e => updateRecord(idx, 'description', e.target.value)} className="h-8 text-xs w-40" />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={r.quantity} onChange={e => updateRecord(idx, 'quantity', parseInt(e.target.value) || 0)} className="h-8 text-xs w-16 text-right" />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" step="0.01" value={r.unit_amount} onChange={e => updateRecord(idx, 'unit_amount', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20 text-right" />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" step="0.01" value={r.total_amount} onChange={e => updateRecord(idx, 'total_amount', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-24 text-right font-medium" />
                  </td>
                  <td className="py-2 px-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRecord(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}><X className="h-4 w-4 mr-1" />Discard</Button>
          <Button onClick={() => onSave(records)} disabled={records.length === 0}><CheckCircle2 className="h-4 w-4 mr-1" />Save Records</Button>
        </div>
      </CardContent>
    </Card>
  );
}
