// frontend/src/pages/gantt/tabs/sitediary/mockTimeline.ts
//
// Hardcoded fixtures for the Site Diary v2 demo. Replaced with real data
// from useDiaryEntries when the per-worker-entry data model is wired up
// (out of scope for the demo cutover).

export interface MockTimelineEntry {
  id: string;
  workerInitials: string;
  workerColorIndex: 1 | 2 | 3 | 4 | 5;
  workerName: string;
  workerRole: string;
  timeStart: string;
  timeEnd: string;
  hours: number;
  status: 'signed' | 'pending' | 'flagged';
  description: string;             // {{hl}}text{{/hl}} marks highlighted spans
  tags: string[];
  punchItemsCount?: number;
  photos?: number;
  photoColorSeeds?: string[];
}

export type CommonWorkCategory = 'civil' | 'elec' | 'fin' | 'log' | 'safe';

export interface MockCommonWorkItem {
  id: string;
  name: string;
  category: CommonWorkCategory;
  usageCount: number;
  isFrequent: boolean;
}

export const MOCK_TIMELINE: MockTimelineEntry[] = [
  {
    id: 'tl_1',
    workerInitials: 'MH',
    workerColorIndex: 1,
    workerName: 'Marcus Holm',
    workerRole: 'Excavator operator · Casone Electrical',
    timeStart: '07:02', timeEnd: '15:30',
    hours: 8.0, status: 'signed',
    description:
      'Excavation continued at {{hl}}L14 south slab{{/hl}}; trenched the east drainage run to spec. Removed ~6 m³ of spoil to the north laydown area. Soft pocket near grid C-3 — flagged to PM for survey.',
    tags: ['Excavation works continued', 'L14 South'],
    photos: 3,
    photoColorSeeds: ['#a8b59c,#6b7a5e', '#c4a07a,#8b6a44', '#7a8da0,#4d5e72'],
  },
  {
    id: 'tl_2',
    workerInitials: 'JR',
    workerColorIndex: 2,
    workerName: 'Jodie Reyes',
    workerRole: 'Electrical foreman · Casone Electrical',
    timeStart: '07:30', timeEnd: '16:00',
    hours: 8.5, status: 'signed',
    description:
      'Conduit pull crew dressed back-boxes on {{hl}}L13 east{{/hl}}. EMT runs from MDP to L13-RCP completed and labeled. Two boxes needed re-positioning — coord with HVAC trapeze.',
    tags: ['Conduit rough-in', 'Cable pull / wire dressing', 'L13 East'],
  },
  {
    id: 'tl_3',
    workerInitials: 'AP',
    workerColorIndex: 3,
    workerName: 'Anil Patel',
    workerRole: 'Apprentice · Casone Electrical',
    timeStart: '08:15', timeEnd: '14:00',
    hours: 5.75, status: 'pending',
    description:
      'Assisted Jodie on L13 conduit dressing. Toolbox talk attended at 08:00 — fall protection refresher. Hand-tool inventory complete, two cordless drills sent for service.',
    tags: ['Safety toolbox talk', 'Material delivery received'],
  },
  {
    id: 'tl_4',
    workerInitials: 'SO',
    workerColorIndex: 4,
    workerName: 'Sam Okafor',
    workerRole: 'Inspector · City Authority',
    timeStart: '10:00', timeEnd: '14:30',
    hours: 4.5, status: 'flagged',
    description:
      'Authority walk-through of the {{hl}}high-voltage switchgear room{{/hl}} at 14:00. Two open items — missing arc-flash labels on panels HVA-3 / HVA-4, and switchroom door sweep not seated. Verbal pass on the rest.',
    tags: ['Inspection / authority visit', 'Switchgear set + termination'],
    punchItemsCount: 2,
  },
  {
    id: 'tl_5',
    workerInitials: 'DK',
    workerColorIndex: 5,
    workerName: 'Dana Kowalski',
    workerRole: 'Concrete supervisor · Brennan Civils',
    timeStart: '13:00', timeEnd: '17:45',
    hours: 11.75, status: 'signed',
    description:
      'Pour prep on L14 south — formwork inspection complete, rebar tied to schedule. Delivery of {{hl}}28 m³ ready-mix{{/hl}} rescheduled to 06:00 tomorrow per concrete supplier; cure plan on file.',
    tags: ['Slab pour', 'Framing / blocking', 'Material delivery received'],
    photos: 5,
    photoColorSeeds: ['#8a8a8a,#5a5a5a', '#b8a48c,#7a6850', '#9eb0a5,#647a6e'],
  },
];

export const MOCK_COMMON_WORKS: MockCommonWorkItem[] = [
  { id: 'cw_1', name: 'Excavation works continued', category: 'civil', usageCount: 14, isFrequent: true },
  { id: 'cw_2', name: 'Conduit rough-in', category: 'elec', usageCount: 11, isFrequent: true },
  { id: 'cw_3', name: 'Slab pour', category: 'civil', usageCount: 8, isFrequent: true },
  { id: 'cw_4', name: 'Cable pull / wire dressing', category: 'elec', usageCount: 7, isFrequent: false },
  { id: 'cw_5', name: 'Switchgear set + termination', category: 'elec', usageCount: 5, isFrequent: false },
  { id: 'cw_6', name: 'Framing / blocking', category: 'civil', usageCount: 4, isFrequent: false },
  { id: 'cw_7', name: 'Drywall + ceiling grid', category: 'fin', usageCount: 3, isFrequent: false },
  { id: 'cw_8', name: 'Inspection / authority visit', category: 'safe', usageCount: 3, isFrequent: false },
  { id: 'cw_9', name: 'Material delivery received', category: 'log', usageCount: 6, isFrequent: false },
  { id: 'cw_10', name: 'Safety toolbox talk', category: 'safe', usageCount: 5, isFrequent: false },
  { id: 'cw_11', name: 'Rebar tying', category: 'civil', usageCount: 2, isFrequent: false },
  { id: 'cw_12', name: 'Paint / coatings', category: 'fin', usageCount: 1, isFrequent: false },
];

export const MOCK_DAY_ROLLUP = {
  headcount: 5,
  hoursLogged: 38.5,
  entries: 5,
  signedOffs: 3,
  totalForSignOff: 5,
  openPunchItems: 2,
};

export const MOCK_CONDITIONS = {
  weather: 'sunny' as 'sunny' | 'cloudy' | 'rain' | 'storm',
  temperatureF: 68,
};

// Worker color seeds for the avatar circles (mockup colors wm-1..wm-5)
export const WORKER_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#3B6E54',
  2: '#8B5E3C',
  3: '#5C6BC0',
  4: '#B5602A',
  5: '#6B7A8F',
};
