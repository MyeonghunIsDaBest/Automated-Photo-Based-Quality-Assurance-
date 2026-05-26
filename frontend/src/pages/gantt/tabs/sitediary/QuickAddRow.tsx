// frontend/src/pages/gantt/tabs/sitediary/QuickAddRow.tsx
//
// Bottom row of the timeline. Real input + Enter submits a quick entry;
// Photo button opens a gallery picker via the parent.

import { useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Camera } from 'lucide-react';

export interface QuickAddRowHandle {
  focus: () => void;
}

interface QuickAddRowProps {
  initials: string;
  onSubmit: (text: string) => void;
  onPhotoClick: () => void;
}

export const QuickAddRow = forwardRef<QuickAddRowHandle, QuickAddRowProps>(
  function QuickAddRow({ initials, onSubmit, onPhotoClick }, ref) {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }), []);

    const submit = () => {
      onSubmit(text.trim());
      setText('');
    };

    return (
      <div className="flex items-center gap-3 px-6 py-4 bg-[#FAF8F2] border-t border-[#EFEBE0]">
        <div className="w-9 h-9 rounded-full grid place-items-center text-white font-semibold text-xs" style={{ background: '#C9A04A' }}>
          {initials}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. Excavation continued at L14 south slab; conduit pull crew dressed back-boxes on L13 east…"
          className="flex-1 bg-white border border-[#E6E1D4] rounded-[9px] px-3.5 py-2.5 text-[13.5px] text-[#1A1A1A] placeholder:text-[#6B6B6B] outline-none focus:border-[#A0A0A0]"
        />
        <button
          type="button"
          onClick={onPhotoClick}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#E6E1D4] text-[13px] font-semibold hover:bg-[#FAF8F2]"
        >
          <Camera className="h-3.5 w-3.5" />
          Photo
        </button>
        <button
          type="button"
          onClick={submit}
          className="px-4 py-2 rounded-full bg-[#2F8F5C] text-white text-[13px] font-semibold hover:bg-[#246F47]"
        >
          Log entry
        </button>
      </div>
    );
  },
);
