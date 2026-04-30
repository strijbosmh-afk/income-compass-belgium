import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useDataVersion } from '@/hooks/useDataVersion';

/** Returns total number of "aandachtspunten" (issues) detected on the Controle page:
 *  - onbekende codes (in records, niet in nomenclatuurbeheer)
 *  - ontbrekend bedrag (in beheer, gebruikt, maar netto_amount = 0)
 *  - ongebruikte codes (in beheer, niet aangerekend)
 */
export function useControleIssues(): number {
  const { user } = useAuth();
  const dataVersion = useDataVersion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }
    let cancelled = false;
    Promise.all([
      supabase.from('income_records').select('nomenclature_code').eq('user_id', user.id),
      supabase.from('nomenclature_codes').select('code, netto_amount').eq('user_id', user.id),
    ]).then(([r1, r2]) => {
      if (cancelled) return;
      const records = (r1.data as any[]) || [];
      const codes = (r2.data as any[]) || [];
      const usedCodes = new Set(records.map(r => r.nomenclature_code));
      const knownCodes = new Set(codes.map(c => c.code));
      const onbekend = new Set(records.map(r => r.nomenclature_code).filter(c => !knownCodes.has(c))).size;
      const ongebruikt = codes.filter(c => !usedCodes.has(c.code)).length;
      const ontbrekend = codes.filter(c => usedCodes.has(c.code) && (!c.netto_amount || c.netto_amount === 0)).length;
      setCount(onbekend + ongebruikt + ontbrekend);
    });
    return () => { cancelled = true; };
  }, [user, dataVersion]);

  return count;
}
