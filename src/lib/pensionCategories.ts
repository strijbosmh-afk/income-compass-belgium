import { PiggyBank, Briefcase, Stethoscope, Wallet, Sprout } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Pensioencategorieën. IPT heeft z'n eigen tabel + edge function (rijkere velden).
 * VAPZ, VAPZ RIZIV en Pensioensparen delen dezelfde eenvoudige structuur.
 */
export type SimplePensionCategory = 'vapz' | 'vapz_riziv' | 'pensioensparen';
export type PensionCategory = SimplePensionCategory | 'ipt';

export interface SimpleCategoryConfig {
  key: SimplePensionCategory;
  label: string;
  short: string;
  table: 'vapz_records' | 'vapz_riziv_records' | 'pensioensparen_records';
  functionName: 'extract-vapz' | 'extract-vapz-riziv' | 'extract-pensioensparen';
  icon: LucideIcon;
  description: string;
}

export const SIMPLE_CATEGORIES: SimpleCategoryConfig[] = [
  {
    key: 'vapz',
    label: 'VAPZ',
    short: 'VAPZ',
    table: 'vapz_records',
    functionName: 'extract-vapz',
    icon: Wallet,
    description: 'Vrij Aanvullend Pensioen voor Zelfstandigen',
  },
  {
    key: 'vapz_riziv',
    label: 'VAPZ RIZIV',
    short: 'RIZIV',
    table: 'vapz_riziv_records',
    functionName: 'extract-vapz-riziv',
    icon: Stethoscope,
    description: 'Sociaal statuut / RIZIV-toelage voor artsen',
  },
  {
    key: 'pensioensparen',
    label: 'Pensioensparen',
    short: 'Sparen',
    table: 'pensioensparen_records',
    functionName: 'extract-pensioensparen',
    icon: Sprout,
    description: 'Fiscaal aftrekbaar pensioensparen (3de pijler)',
  },
];

export const IPT_CONFIG = {
  key: 'ipt' as const,
  label: 'IPT',
  short: 'IPT',
  table: 'pension_ipt_records' as const,
  functionName: 'extract-pension-ipt' as const,
  icon: Briefcase,
  description: 'Individuele Pensioentoezegging',
};

export interface SimpleSnapshot {
  snapshot_date: string;
  year: number;
  pensioenreserve: number;
  overlijdensdekking: number;
  jaarpremie: number;
}

export const PENSION_BUCKETS: Record<PensionCategory, 'pension-pdfs' | 'pension-ipt-pdfs'> = {
  vapz: 'pension-pdfs',
  vapz_riziv: 'pension-pdfs',
  pensioensparen: 'pension-pdfs',
  ipt: 'pension-ipt-pdfs',
};

export function pensionCategoryLabel(key: PensionCategory): string {
  if (key === 'ipt') return IPT_CONFIG.label;
  return SIMPLE_CATEGORIES.find(c => c.key === key)?.label || key;
}
