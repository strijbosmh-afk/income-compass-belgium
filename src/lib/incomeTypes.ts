// Centrale labels & helpers voor de drie inkomstentypes.
// 'associatie' = gepoolde hospitalisatie-inkomsten met dr. Schrevens.
// Van de geëxtraheerde bedragen wordt 50% effectief op de eigen rekening gestort.
export type IncomeType = 'ambulatory' | 'hospitalized' | 'associatie';

export const ASSOCIATIE_SHARE = 0.5;

export const incomeTypeLabel: Record<string, string> = {
  ambulatory: 'Ambulant',
  hospitalized: 'Gehospitaliseerd',
  associatie: 'Associatie',
};

export const incomeTypeShort: Record<string, string> = {
  ambulatory: 'Amb',
  hospitalized: 'Hosp',
  associatie: 'Assoc',
};

// Halveer alle bedragen voor associatie-records (50% wordt naar eigen rekening gestort).
// Wordt enkel toegepast bij insert; storage = effectief eigen aandeel.
export function applyShare<T extends {
  income_type: string;
  total_amount?: number;
  aandeel_arts?: number;
  bouwfonds?: number;
  mif?: number;
  netto?: number;
  unit_amount?: number;
}>(rec: T): T {
  if (rec.income_type !== 'associatie') return rec;
  const f = ASSOCIATIE_SHARE;
  const r = (n: number | undefined) => Math.round(((n || 0) * f) * 100) / 100;
  return {
    ...rec,
    total_amount: r(rec.total_amount),
    aandeel_arts: r(rec.aandeel_arts),
    bouwfonds: r(rec.bouwfonds),
    mif: r(rec.mif),
    netto: r(rec.netto),
    unit_amount: r(rec.unit_amount),
  };
}
