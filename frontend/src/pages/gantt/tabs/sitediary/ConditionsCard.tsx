// frontend/src/pages/gantt/tabs/sitediary/ConditionsCard.tsx
//
// Controlled weather + temperature card for the left column. Parent owns
// state — typically wired to the most recent diary entry on the day, or a
// "conditions stub" entry if none exist yet.

import { useEffect, useRef, useState } from 'react';
import { Sun, Cloud, CloudRain, CloudSnow } from 'lucide-react';
import type { WeatherKind } from '../../types';

interface ConditionsCardProps {
  weather: WeatherKind;
  temperatureF: number | null;
  onChange: (patch: { weather?: WeatherKind; temperatureF?: number | null }) => void;
}

const WEATHER_OPTIONS: Array<{ value: WeatherKind; label: string; Icon: typeof Sun }> = [
  { value: 'sunny',  label: 'Sunny',  Icon: Sun },
  { value: 'cloudy', label: 'Cloudy', Icon: Cloud },
  { value: 'rain',   label: 'Rain',   Icon: CloudRain },
  { value: 'storm',  label: 'Storm',  Icon: CloudSnow },
];

export function ConditionsCard({ weather, temperatureF, onChange }: ConditionsCardProps) {
  const [editingTemp, setEditingTemp] = useState(false);
  const [draftTemp, setDraftTemp] = useState<string>(
    temperatureF == null ? '' : String(temperatureF),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingTemp) {
      setDraftTemp(temperatureF == null ? '' : String(temperatureF));
    }
  }, [temperatureF, editingTemp]);

  useEffect(() => {
    if (editingTemp) inputRef.current?.focus();
  }, [editingTemp]);

  const commitTemp = () => {
    const trimmed = draftTemp.trim();
    if (trimmed === '') {
      onChange({ temperatureF: null });
    } else {
      const n = Number(trimmed);
      if (Number.isFinite(n)) onChange({ temperatureF: Math.round(n) });
    }
    setEditingTemp(false);
  };

  return (
    <div className="bg-white border border-[#E6E1D4] rounded-[14px] p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="flex items-center gap-2 mb-3 text-[11px] uppercase tracking-[0.14em] text-[#6B6B6B] font-semibold">
        <span className="h-px w-4 bg-[#A0A0A0]" />
        Conditions · today
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {WEATHER_OPTIONS.map(({ value, label, Icon }) => {
          const isOn = weather === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ weather: value })}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-[9px] border text-[10.5px] transition-colors ${
                isOn
                  ? 'bg-[#FFF8E1] border-[#E8C25A] text-[#1A1A1A]'
                  : 'bg-[#FAF8F2] border-[#E6E1D4] text-[#3A3A3A]'
              }`}
            >
              <Icon className={`h-[15px] w-[15px] ${isOn ? 'text-[#D6A22F]' : ''}`} />
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setEditingTemp(true)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#FAF8F2] border border-[#E6E1D4] rounded-[9px] hover:border-[#D6CDB7] text-left"
      >
        <span className="text-[10.5px] text-[#6B6B6B] uppercase tracking-wider font-medium">Temp</span>
        {editingTemp ? (
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={draftTemp}
            onChange={(e) => setDraftTemp(e.target.value)}
            onBlur={commitTemp}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTemp();
              } else if (e.key === 'Escape') {
                setDraftTemp(temperatureF == null ? '' : String(temperatureF));
                setEditingTemp(false);
              }
            }}
            className="w-20 text-right text-xl font-medium bg-transparent border-b border-[#A0A0A0] outline-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          />
        ) : (
          <span>
            <span
              className={`text-xl font-medium ${temperatureF == null ? 'text-[#A0A0A0]' : ''}`}
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {temperatureF == null ? '—' : temperatureF}
            </span>
            <span className="text-[#6B6B6B] text-xs ml-0.5">°F</span>
          </span>
        )}
      </button>
    </div>
  );
}
