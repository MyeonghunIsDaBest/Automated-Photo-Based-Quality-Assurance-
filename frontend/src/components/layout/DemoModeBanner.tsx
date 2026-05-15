// Quiet pill that hovers under TopNav when the active project is one of
// the known demo seeds (Hampstead Heights, Casone QA Pilot, or any
// `Hampstead Heights · copy N` clone produced by the Generate Demo flow).
// Surfaces so a stakeholder watching a screen-share immediately understands
// "this is sample data, not your real account."
//
// Hidden on live projects (anything whose name doesn't match the seed
// patterns). No-op on the login screen — `Layout.tsx` only mounts this
// when authenticated, so we don't need to gate on auth here.

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';
import { DEMO_INFLIGHT_PROJECT_META } from '../../data/demoInflightProject';
import { DEMO_BONDI_META, DEMO_MARRICKVILLE_META } from '../../data/demoExtraSites';

const PILOT_NAME = 'Casone Electrical — QA Pilot';
const DEMO_PREFIXES = [
  DEMO_INFLIGHT_PROJECT_META.name,
  DEMO_BONDI_META.name,
  DEMO_MARRICKVILLE_META.name,
];

function isDemoProject(name: string): boolean {
  if (!name) return false;
  if (name === PILOT_NAME) return true;
  // Match seed names plus their `· copy N` clones via prefix.
  return DEMO_PREFIXES.some((p) => name.startsWith(p));
}

export default function DemoModeBanner() {
  const project = useAppStore((s) => s.project);
  const [shouldAnimate, setShouldAnimate] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShouldAnimate(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (!project?.name) return null;
  if (!isDemoProject(project.name)) return null;

  return (
    <div className={`border-b border-amber-100 bg-amber-50/60 px-3 py-1 sm:px-6 ${shouldAnimate ? 'animate-banner-slide-down' : ''}`}>
      <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-800">
        <Sparkles className="h-3 w-3" aria-hidden />
        Demo data · {project.name} sandbox
      </p>
    </div>
  );
}
