// frontend/src/pages/gantt/tabs/SiteDiaryTab.tsx

import { useState } from 'react';
import type { Project, User } from '../../../types';
import { ConditionsCard } from './sitediary/ConditionsCard';
import { DayRollupCard } from './sitediary/DayRollupCard';
import { DayHeader } from './sitediary/DayHeader';
import { ProgressBar } from './sitediary/ProgressBar';
import { TimelineCard } from './sitediary/TimelineCard';
import { CommonWorksSection } from './sitediary/CommonWorksSection';
import { FabCamera } from './sitediary/FabCamera';
import { SparkyDrawer } from './assistant/SparkyDrawer';
import { MOCK_TIMELINE, MOCK_COMMON_WORKS, MOCK_DAY_ROLLUP, MOCK_CONDITIONS } from './sitediary/mockTimeline';

interface SiteDiaryTabProps {
  project: Project;
  currentUser: User | null;
  canEdit: boolean;
  canDelete: boolean;
}

export function SiteDiaryTab({ project, currentUser }: SiteDiaryTabProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [sparkyOpen, setSparkyOpen] = useState(false);
  const [sparkySeed, setSparkySeed] = useState('');

  const openSparky = (seedText = '') => {
    setSparkySeed(seedText);
    setSparkyOpen(true);
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 bg-[#F4F1E8] min-h-[80vh]">
      {/* Slim header */}
      <div className="flex items-center gap-3 px-7 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#6B6B6B] font-medium">
          <span className="h-px w-5 bg-[#A0A0A0]" />
          WORKSPACE · SITE DIARY · {project.name.toUpperCase()}
        </div>
        <div className="flex-1" />
        <div className="text-[12.5px] text-[#6B6B6B]">
          Today: <strong className="text-[#1A1A1A] font-semibold">Tuesday, May 26, 2026</strong>
          {' · '}
          <strong className="text-[#1A1A1A] font-semibold">{MOCK_DAY_ROLLUP.entries}</strong> entries
          {' · '}
          <strong className="text-[#1A1A1A] font-semibold">{MOCK_DAY_ROLLUP.hoursLogged}h</strong> logged
        </div>
      </div>

      {/* Main grid */}
      <main className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 px-7 pb-20">
        {/* LEFT COLUMN */}
        <aside className="space-y-4">
          <ConditionsCard initialWeather={MOCK_CONDITIONS.weather} initialTempF={MOCK_CONDITIONS.temperatureF} />
          <DayRollupCard rollup={MOCK_DAY_ROLLUP} />
        </aside>

        {/* RIGHT COLUMN */}
        <section>
          <DayHeader projectName={project.name} todayISO={today} />
          <ProgressBar />
          <TimelineCard
            entries={MOCK_TIMELINE}
            quickAddInitials={currentUser?.fullName ? currentUser.fullName.slice(0, 2).toUpperCase() : 'MT'}
          >
            <CommonWorksSection items={MOCK_COMMON_WORKS} onOpenSparky={openSparky} />
          </TimelineCard>
        </section>
      </main>

      <FabCamera />

      <SparkyDrawer
        open={sparkyOpen}
        onClose={() => setSparkyOpen(false)}
        project={project}
        currentUser={currentUser}
        initialSeedText={sparkySeed}
      />
    </div>
  );
}
