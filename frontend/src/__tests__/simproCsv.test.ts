import { describe, it, expect } from 'vitest';
import {
  parseSimproCsv,
  planSimproImport,
  resolveJobType,
  inferCategory,
  type SimproJobRow,
} from '../lib/jobs/simproCsv';

// Real Simpro "Job List Report" shape: row 1 is a banner carrying the stage,
// row 2 is the header, data follows. The `Job` column packs the job number +
// description joined by " - ". Quoted fields may contain embedded newlines.

const HEADER =
  '"Job","Due Date","Customer","Telephone","Email","Site","Site Address","Site Suburb"';
const banner = (stage: string) => `"Selected Criteria - Job Stage: ${stage}"`;

describe('parseSimproCsv', () => {
  it('reads the banner stage, splits Job, and maps the real columns', () => {
    const text =
      banner('Archived') +
      '\n' +
      HEADER +
      '\n' +
      '"3901 - Solar Installation",,"Eco Sustainable Homes",,,"1313 Mount Dandenong Tourist Road Kalorama","1313 Mount Dandenong Tourist Road","Kalorama"';
    const { rows, errors } = parseSimproCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalRef: '3901',
      description: 'Solar Installation',
      customerName: 'Eco Sustainable Homes',
      telephone: null,
      email: null,
      siteName: '1313 Mount Dandenong Tourist Road Kalorama',
      siteAddress: '1313 Mount Dandenong Tourist Road',
      suburb: 'Kalorama',
      dueDate: null,
      stage: 'archived',
      contractValue: null,
      jobType: null,
    });
    expect(rows[0].raw).toMatchObject({ job: '3901 - Solar Installation' });
  });

  it('strips a BOM and normalises each stage banner', () => {
    for (const [label, expected] of [
      ['Progress', 'in_progress'],
      ['Pending', 'pending'],
      ['Complete', 'complete'],
      ['Invoiced', 'invoiced'],
      ['Archived', 'archived'],
    ] as const) {
      const text =
        '﻿' + banner(label) + '\n' + HEADER + '\n' + '"4307 - x",,"CFA",,,"s","a","b"';
      const { rows, errors } = parseSimproCsv(text);
      expect(errors).toEqual([]);
      expect(rows[0].stage).toBe(expected);
    }
  });

  it('splits the Job column: with description, plain number, and multiple " - "', () => {
    const text =
      banner('Progress') +
      '\n' +
      HEADER +
      '\n' +
      '"3 - Inspection Ducted Heating",,"c",,,"s","a","b"\n' +
      '"3020",,"c",,,"s","a","b"\n' +
      '"3137 - Mech Elec - Mansard Kooyong REV.2",,"c",,,"s","a","b"';
    const { rows, errors } = parseSimproCsv(text);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.externalRef, r.description])).toEqual([
      ['3', 'Inspection Ducted Heating'],
      ['3020', null],
      ['3137', 'Mech Elec - Mansard Kooyong REV.2'],
    ]);
  });

  it('handles a quoted field containing an embedded newline (record spans two lines)', () => {
    const text =
      banner('Complete') +
      '\n' +
      HEADER +
      '\n' +
      '"4154 - Power relocation",,"SS Signs","(03) 9761 9999","rikki@sssigns.com.au","114-118 Merrindale Drive unit 2 Kilsyth","114-118 Merrindale Drive\nunit 2","Kilsyth"';
    const { rows, errors } = parseSimproCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].externalRef).toBe('4154');
    expect(rows[0].telephone).toBe('(03) 9761 9999');
    expect(rows[0].email).toBe('rikki@sssigns.com.au');
    expect(rows[0].siteAddress).toBe('114-118 Merrindale Drive\nunit 2');
    expect(rows[0].suburb).toBe('Kilsyth');
  });

  it('parses an AU dd/mm/yyyy due date', () => {
    const text =
      banner('Archived') + '\n' + HEADER + '\n' + '"3","16/10/2023","c",,,"s","a","b"';
    const { rows } = parseSimproCsv(text);
    expect(rows[0].dueDate).toBe('2023-10-16');
  });

  it('reports a row whose Job number is blank and keeps the good rows', () => {
    const text =
      banner('Pending') +
      '\n' +
      HEADER +
      '\n' +
      ',,"No job number",,,"s","a","b"\n' +
      '"4435 - materials",,"Nood Blooms",,,"s","a","b"';
    const { rows, errors } = parseSimproCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].externalRef).toBe('4435');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/job/i);
  });

  it('errors when neither a stage banner nor a stage column is present', () => {
    const text = HEADER + '\n' + '"3 - x",,"c",,,"s","a","b"';
    const { rows, errors } = parseSimproCsv(text);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/stage/i);
  });
});

describe('planSimproImport', () => {
  const row = (over: Partial<SimproJobRow>): SimproJobRow => ({
    externalRef: '1',
    description: null,
    customerName: null,
    telephone: null,
    email: null,
    siteName: null,
    siteAddress: null,
    suburb: null,
    category: null,
    jobType: null,
    dueDate: null,
    stage: 'pending',
    contractValue: null,
    raw: {},
    ...over,
  });

  it('new external_ref → add', () => {
    const plan = planSimproImport([], [row({ externalRef: '999' })]);
    expect(plan.adds).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
  });

  it('already-staged external_ref → update', () => {
    const plan = planSimproImport(
      [{ externalRef: '999', promoted: false }],
      [row({ externalRef: '999' })],
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.adds).toHaveLength(0);
  });

  it('duplicate external_ref within one upload → second is skipped', () => {
    const plan = planSimproImport(
      [],
      [row({ externalRef: '5' }), row({ externalRef: '5' })],
    );
    expect(plan.adds).toHaveLength(1);
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0].reason).toMatch(/duplicate/i);
  });
});

describe('resolveJobType', () => {
  it('maps project/service spellings, defaults unknown to service', () => {
    expect(resolveJobType('Project')).toBe('project');
    expect(resolveJobType('projects')).toBe('project');
    expect(resolveJobType('Service')).toBe('service');
    expect(resolveJobType('')).toBe('service');
    expect(resolveJobType(null)).toBe('service');
  });
});

describe('inferCategory', () => {
  it('classifies common job descriptions by keyword', () => {
    expect(inferCategory('Solar Installation')).toBe('solar');
    expect(inferCategory('Battery Upgrade')).toBe('battery');
    expect(inferCategory('Generator Service')).toBe('generator');
    expect(inferCategory('EV Charger')).toBe('ev');
    expect(inferCategory('3x 8kW Midea Air-Conditioners')).toBe('aircon');
    expect(inferCategory('Switchboard Upgrade')).toBe('other');
    expect(inferCategory(null)).toBe('other');
  });
});
