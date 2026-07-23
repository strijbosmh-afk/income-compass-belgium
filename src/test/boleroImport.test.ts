import { describe, expect, it } from 'vitest';
import { parseBoleroRows } from '@/lib/boleroImport';

describe('parseBoleroRows', () => {
  it('parses Bolero sheet wrapped exports', () => {
    const positions = parseBoleroRows([{
      sheet: 'Sheet0',
      data: [
        [null, 'Portfolio Positions'],
        [null, 'Type', null, 'Munt', null, 'Aantal', null, 'Geblokkeerd', null, 'Naam', null, 'Alerts', null, 'Gem. aankoopkoers', null, 'Slotkoers', null, 'Totale aankoopwaarde', null, 'Koers', null, 'Wijziging (%)', null, 'Wijziging', null, 'Huidige waarde', null, 'Waarde in EUR', null, 'Rendement %', null, 'Markt', null, 'Rendement ( in munt)', null, 'ISIN'],
        [null, 'Aandelen', null, 'USD', null, 953, null, 0, null, 'ALPHA TAU MEDICAL LTD.', null, 'Nee', null, 12.48673, null, 13.01, null, 11899.85, null, 13.3834, null, 2.87, null, 355.85, null, 12754.38, null, 11212.64, null, 7.18, null, 'USA', null, 854.5302, null, 'IL0011839383'],
        [null, "ETF's", null, 'EUR', null, 35, null, 0, null, 'ISH COR S&P500 U.ETF USD(ACC)-PTG.K', null, 'Nee', null, 705.23943, null, 709.51, null, 24683.38, null, 700.16, null, -1.32, null, -327.25, null, 24505.6, null, 24505.6, null, -0.72, null, 'Euronext Amsterdam', null, -177.78, null, 'IE00B5BMR087'],
        [null, 'Cash', null, 'EUR', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 8.94, null, 8.94],
      ],
    }]);

    expect(positions).toHaveLength(3);
    expect(positions[0]).toMatchObject({ type: 'Aandelen', currency: 'USD', quantity: 953, isin: 'IL0011839383' });
    expect(positions[1]).toMatchObject({ type: "ETF's", currency: 'EUR', quantity: 35, isin: 'IE00B5BMR087' });
    expect(positions[2]).toMatchObject({ type: 'Cash', currency: 'EUR', eurValue: 8.94 });
  });
});
