// frontend/src/pages/gantt/tabs/sitediary/mockTimeline.ts
//
// What was a demo fixture file is now just the static lookup tables the
// Site Diary tab needs for rendering — the Common Works template list and
// the worker avatar colour palette. Real data flows in via useDiaryEntries
// from the gantt store.

export type CommonWorkCategory = 'civil' | 'elec' | 'fin' | 'log' | 'safe';

export interface CommonWorkTemplate {
  id: string;
  name: string;
  category: CommonWorkCategory;
}

// Curated 12-item template list. Stable order — tab onPick uses the name as
// the tag value, so renaming an entry here invalidates any historical
// usageCount lookup for that label.
export const COMMON_WORKS: CommonWorkTemplate[] = [
  { id: 'cw_1',  name: 'Excavation works continued',  category: 'civil' },
  { id: 'cw_2',  name: 'Conduit rough-in',            category: 'elec'  },
  { id: 'cw_3',  name: 'Slab pour',                   category: 'civil' },
  { id: 'cw_4',  name: 'Cable pull / wire dressing',  category: 'elec'  },
  { id: 'cw_5',  name: 'Switchgear set + termination',category: 'elec'  },
  { id: 'cw_6',  name: 'Framing / blocking',          category: 'civil' },
  { id: 'cw_7',  name: 'Drywall + ceiling grid',      category: 'fin'   },
  { id: 'cw_8',  name: 'Inspection / authority visit',category: 'safe'  },
  { id: 'cw_9',  name: 'Material delivery received',  category: 'log'   },
  { id: 'cw_10', name: 'Safety toolbox talk',         category: 'safe'  },
  { id: 'cw_11', name: 'Rebar tying',                 category: 'civil' },
  { id: 'cw_12', name: 'Paint / coatings',            category: 'fin'   },
];

// Worker avatar colour palette indexed 1..5 by diaryRowMapper.colorIndexForWorker.
// Same hashing input → same colour across reloads.
export const WORKER_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#3B6E54',
  2: '#8B5E3C',
  3: '#5C6BC0',
  4: '#B5602A',
  5: '#6B7A8F',
};
