// frontend/src/pages/gantt/tabs/sitediary/ConditionsCard.tsx
//
// Weather chips + temp block for the left column.

import { useState } from 'react';
import { Sun, Cloud, CloudRain, CloudSnow } from 'lucide-react';

type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm';

interface ConditionsCardProps {
  initialWeather: Weather;
  initialTempF: number;
}

const WEATHER_OPTIONS: Array<{ value: Weather; label: string; Icon: typeof Sun }> = [
  { value: 'sunny',  label: 'Sunny',  Icon: Sun },
  { value: 'cloudy', label: 'Cloudy', Icon: Cloud },
  { value: 'rain',   label: 'Rain',   Icon: CloudRain },
  { value: 'storm',  label: 'Storm',  Icon: CloudSnow },
];

export function ConditionsCard({ initialWeather, initialTempF }: ConditionsCardProps) {
  const [weather, setWeather] = useState<Weather>(initialWeather);
  const [tempF] = useState(initialTempF);

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
              onClick={() => setWeather(value)}
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
      <div className="flex items-center justify-between px-3 py-2 bg-[#FAF8F2] border border-[#E6E1D4] rounded-[9px]">
        <span className="text-[10.5px] text-[#6B6B6B] uppercase tracking-wider font-medium">Temp</span>
        <span>
          <span className="text-xl font-medium" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{tempF}</span>
          <span className="text-[#6B6B6B] text-xs ml-0.5">°F</span>
        </span>
      </div>
    </div>
  );
}
