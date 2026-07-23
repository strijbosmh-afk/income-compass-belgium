export type BoleroPosition = {
  type: string;
  currency: string;
  quantity: number;
  name: string;
  avgPrice: number;
  purchaseValue: number;
  currentQuote: number;
  currentValue: number;
  eurValue: number;
  returnPct: number;
  market: string;
  returnValue: number;
  isin: string;
};

export function parseBoleroRows(input: unknown): BoleroPosition[] {
  const table = normalizeWorksheetRows(input);
  const headerIdx = table.findIndex((row) => row.some((cell) => normalizeHeader(String(cell)) === 'portfoliopositions'));
  const columnIdx = table.findIndex((row, idx) =>
    idx > headerIdx &&
    row.some((cell) => normalizeHeader(String(cell)) === 'isin') &&
    row.some((cell) => normalizeHeader(String(cell)) === 'huidigewaarde')
  );
  if (columnIdx < 0) return [];

  const header = table[columnIdx].map((cell) => normalizeHeader(String(cell)));
  const idx = (name: string) => header.findIndex((h) => h === normalizeHeader(name));
  const typeIdx = idx('Type');
  const currencyIdx = idx('Munt');
  const quantityIdx = idx('Aantal');
  const nameIdx = idx('Naam');
  const avgIdx = idx('Gem. aankoopkoers');
  const purchaseIdx = idx('Totale aankoopwaarde');
  const quoteIdx = idx('Koers');
  const currentIdx = idx('Huidige waarde');
  const eurIdx = idx('Waarde in EUR');
  const returnPctIdx = idx('Rendement %');
  const marketIdx = idx('Markt');
  const returnValueIdx = idx('Rendement ( in munt)');
  const isinIdx = idx('ISIN');

  return table.slice(columnIdx + 1)
    .map((row) => ({
      type: String(row[typeIdx] || '').trim(),
      currency: String(row[currencyIdx] || 'EUR').trim() || 'EUR',
      quantity: parseBoleroNumber(row[quantityIdx]),
      name: String(row[nameIdx] || '').trim(),
      avgPrice: parseBoleroNumber(row[avgIdx]),
      purchaseValue: parseBoleroNumber(row[purchaseIdx]),
      currentQuote: parseBoleroNumber(row[quoteIdx]),
      currentValue: parseBoleroNumber(row[currentIdx]),
      eurValue: parseBoleroNumber(row[eurIdx]),
      returnPct: parseBoleroNumber(row[returnPctIdx]),
      market: String(row[marketIdx] || '').trim(),
      returnValue: parseBoleroNumber(row[returnValueIdx]),
      isin: String(row[isinIdx] || '').trim(),
    }))
    .filter((row) => {
      const type = row.type.toLowerCase();
      if (!type || type.startsWith('bolero') || type.startsWith('mail') || type.startsWith('web')) return false;
      return row.eurValue !== 0 || row.currentValue !== 0 || row.quantity > 0 || type === 'cash';
    });
}

export function normalizeWorksheetRows(input: unknown): unknown[][] {
  if (!Array.isArray(input)) return [];
  return input
    .flatMap((item) => {
      if (Array.isArray(item)) return [item];
      if (item && typeof item === 'object' && Array.isArray((item as { data?: unknown }).data)) {
        return (item as { data: unknown[] }).data;
      }
      return [];
    })
    .filter(Array.isArray)
    .map((row) => row as unknown[]);
}

export function parseBoleroNumber(value: unknown) {
  const text = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\d,.-]/g, '')
    .trim();
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeHeader(header: string) {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
