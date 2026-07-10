// ─────────────────────────────────────────────────────────────────────────────
// components/geo/AddressSearchInput.tsx — free-text address box with a debounced
// OpenStreetMap (Nominatim) suggestion dropdown. Picking a result hands back the
// formatted address + coordinates; typing without picking keeps the raw text
// (callers may still geocode it later). No API key.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { geocodeSearch, type GeocodeResult } from "../../lib/geo";

interface Props {
  value: string;
  onChange: (address: string) => void;
  /** A suggestion was picked — address + pin together. */
  onSelect: (r: GeocodeResult) => void;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
}

export default function AddressSearchInput({ value, onChange, onSelect, placeholder = "Search an address…", disabled, inputClassName }: Props) {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Label of the last picked suggestion — the pick writes it back into `value`,
  // and without this guard that programmatic change would re-search + reopen.
  const pickedRef = useRef<string | null>(null);

  // Debounced lookup — 600ms after the last keystroke (Nominatim-polite).
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 4) {
      seqRef.current++; // invalidate any in-flight response for a longer query
      setResults([]); setOpen(false); setSearching(false);
      return;
    }
    if (pickedRef.current === value) { setSearching(false); return; }
    debounceRef.current = window.setTimeout(() => {
      const seq = ++seqRef.current;
      setSearching(true);
      geocodeSearch(q)
        .then((r) => {
          if (seq !== seqRef.current) return;
          setResults(r);
          // Only pop the dropdown if the user is still in the field.
          setOpen(r.length > 0 && document.activeElement === inputRef.current);
        })
        .catch(() => { if (seq === seqRef.current) setResults([]); })
        .finally(() => { if (seq === seqRef.current) setSearching(false); });
    }, 600);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [value]);

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 200)} // let a click land first
          placeholder={placeholder}
          className={inputClassName ?? "w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"}
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#A0A0A0]" />}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[#E6E1D4] bg-white py-1 shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't close early
                onClick={() => {
                  pickedRef.current = r.label; // don't re-search the label we just set
                  seqRef.current++;            // and drop any in-flight response
                  onSelect(r);
                  setResults([]);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[13px] leading-snug text-[#3A3A3A] hover:bg-[#FAF8F2]"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
