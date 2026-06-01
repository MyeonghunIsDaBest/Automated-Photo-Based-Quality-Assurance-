// frontend/src/pages/gantt/tabs/sitediary/FabCamera.tsx
//
// Fixed bottom-right floating button. Owner wires up the actual file picker;
// this component just emits onClick.

import { Camera } from 'lucide-react';

interface FabCameraProps {
  onClick: () => void;
  /** Gently pulse to nudge the user when today has no diary entry yet. */
  pulse?: boolean;
}

export function FabCamera({ onClick, pulse = false }: FabCameraProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add photo"
      className="fixed right-7 bottom-7 w-14 h-14 rounded-full bg-[#2F8F5C] text-white grid place-items-center shadow-[0_4px_16px_rgba(47,143,92,0.4),0_0_0_6px_rgba(47,143,92,0.12)] z-20 hover:bg-[#246F47]"
    >
      {pulse ? (
        <span aria-hidden className="absolute inset-0 rounded-full bg-[#2F8F5C] opacity-60 animate-ping motion-reduce:hidden" />
      ) : null}
      <Camera className="relative h-5 w-5" />
    </button>
  );
}
