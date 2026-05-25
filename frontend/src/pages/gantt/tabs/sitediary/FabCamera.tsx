// frontend/src/pages/gantt/tabs/sitediary/FabCamera.tsx
//
// Fixed bottom-right floating button. Decoration in v1 — camera wiring
// is deferred.

import { Camera } from 'lucide-react';

export function FabCamera() {
  return (
    <button
      type="button"
      aria-label="Add photo"
      className="fixed right-7 bottom-7 w-14 h-14 rounded-full bg-[#2F8F5C] text-white grid place-items-center shadow-[0_4px_16px_rgba(47,143,92,0.4),0_0_0_6px_rgba(47,143,92,0.12)] z-20 hover:bg-[#246F47]"
    >
      <Camera className="h-5 w-5" />
    </button>
  );
}
