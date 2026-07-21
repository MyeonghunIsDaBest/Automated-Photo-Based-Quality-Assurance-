import { describe, it, expect } from 'vitest';
import { parseInvoiceCsv, type InvoiceCsvMapping } from '../lib/purchasing/invoiceCsv';

const MAP: InvoiceCsvMapping = {
  columns: { supplierSku: 'code', description: 'desc', qty: 'qty', unitPrice: 'price', lineTotal: 'total', orderRef: 'po', netPrice: 'net' },
  pricesIncludeGst: false,
  gstRate: 0.1,
};

describe('parseInvoiceCsv', () => {
  it('parses a clean ex-GST invoice into normalised lines', () => {
    const csv = ['code,desc,qty,price,total,po', 'AWM100,Cable 2.5mm,100,1.50,150.00,PO-1', 'AWM200,Saddle,50,0.20,10.00,PO-1'].join('\n');
    const r = parseInvoiceCsv(csv, MAP);
    expect(r.stop).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ supplierSku: 'AWM100', qty: 100, unitPrice: 1.5, lineTotal: 150, orderRef: 'PO-1' });
    expect(r.totalExGst).toBe(160);
  });

  it('normalises GST-inclusive prices to ex-GST', () => {
    const csv = ['code,desc,qty,price,total,po', 'X,Item,10,11.00,110.00,PO-9'].join('\n');
    const r = parseInvoiceCsv(csv, { ...MAP, pricesIncludeGst: true });
    // 110 inc-GST / 1.1 = 100 ex; unit 11 / 1.1 = 10; line_total authoritative → 100/10 = 10.
    expect(r.lines[0].lineTotal).toBe(100);
    expect(r.lines[0].unitPrice).toBe(10);
    expect(r.totalExGst).toBe(100);
  });

  it('treats line_total as authoritative (derives unit price from it)', () => {
    // unit price column is deliberately "wrong" — line_total wins.
    const csv = ['code,desc,qty,price,total,po', 'X,Item,4,9.99,40.00,PO-2'].join('\n');
    const r = parseInvoiceCsv(csv, MAP);
    expect(r.lines[0].lineTotal).toBe(40);
    expect(r.lines[0].unitPrice).toBe(10); // 40 / 4, not 9.99
  });

  it('parses currency symbols, thousands commas and accounting negatives', () => {
    const csv = ['code,desc,qty,price,total,po', '"X","Big, heavy",2,"$1,234.56","$2,469.12",PO-3'].join('\n');
    const r = parseInvoiceCsv(csv, MAP);
    expect(r.lines[0].description).toBe('Big, heavy'); // quoted comma preserved
    expect(r.lines[0].lineTotal).toBe(2469.12);
    expect(r.lines[0].unitPrice).toBe(1234.56);
  });

  it('prefers a net (post-discount) price over the gross unit price', () => {
    const csv = ['code,desc,qty,price,net', 'X,Item,10,2.00,1.50'].join('\n');
    const r = parseInvoiceCsv(csv, { ...MAP, columns: { ...MAP.columns, lineTotal: undefined } });
    expect(r.lines[0].unitPrice).toBe(1.5); // net wins over 2.00
  });

  it('hard-stops on a credit note (negative document total)', () => {
    const csv = ['code,desc,qty,price,total,po', 'X,Returned goods,-5,2.00,-10.00,PO-4'].join('\n');
    const r = parseInvoiceCsv(csv, MAP);
    expect(r.stop?.kind).toBe('credit_note');
  });

  it('flags a delivery docket (all prices blank/zero)', () => {
    const csv = ['code,desc,qty,price,total,po', 'X,Item,5,0,0,PO-5', 'Y,Item2,3,,,PO-5'].join('\n');
    const r = parseInvoiceCsv(csv, MAP);
    expect(r.stop?.kind).toBe('delivery_docket');
  });

  it('flags a price file (no quantity column)', () => {
    const csv = ['code,desc,price', 'X,Item,2.00'].join('\n');
    const r = parseInvoiceCsv(csv, { ...MAP, columns: { supplierSku: 'code', description: 'desc', unitPrice: 'price' } });
    expect(r.stop?.kind).toBe('price_file');
  });

  it('stops on an empty file', () => {
    expect(parseInvoiceCsv('', MAP).stop?.kind).toBe('empty');
  });

  it('skips blank rows and a trailing totals row with no code/qty', () => {
    const csv = ['code,desc,qty,price,total,po', 'X,Item,10,1.00,10.00,PO-6', '', ',,,,160.00,'].join('\n');
    const r = parseInvoiceCsv(csv, MAP);
    expect(r.lines).toHaveLength(1);
  });
});
