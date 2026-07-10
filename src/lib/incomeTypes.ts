// Centrale labels & helpers voor de drie inkomstentypes.
// 'associatie' = gepoolde hospitalisatie-inkomsten met dr. Schrevens.
// Associatiebedragen worden bij bewaren in de database genormaliseerd naar het effectieve 50%-aandeel.
export type IncomeType = 'ambulatory' | 'hospitalized' | 'associatie';

export const ASSOCIATIE_SHARE = 0.5;

export const incomeTypeLabel: Record<string, string> = {
  ambulatory: 'Ambulant',
  hospitalized: 'Gehospitaliseerd',
  associatie: 'Hospitalisatie associatie',
};

export const incomeTypeShort: Record<string, string> = {
  ambulatory: 'Amb',
  hospitalized: 'Hosp',
  associatie: 'Assoc',
};

// Backwards-compatible helper: associatie-records zijn al bij bewaren gehalveerd.
// Weergave mag dus nooit opnieuw halveren.
export function applyShare<T extends {
  income_type: string;
  total_amount?: number;
  aandeel_arts?: number;
  bouwfonds?: number;
  mif?: number;
  netto?: number;
  unit_amount?: number;
}>(rec: T): T {
  return rec;
}
