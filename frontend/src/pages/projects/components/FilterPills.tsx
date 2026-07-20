interface FilterPillOption<V extends string> {
  value: V;
  label: string;
  count: number;
}

interface FilterPillsProps<V extends string> {
  options: FilterPillOption<V>[];
  value: V;
  onChange: (value: V) => void;
}

export function FilterPills<V extends string>({ options, value, onChange }: FilterPillsProps<V>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]'
                : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]'
            }`}
          >
            <span>{option.label}</span>
            <span
              className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                active ? 'bg-[#CFE8DA] text-[#246F47]' : 'bg-[#F0EDE4] text-[#6B6B6B]'
              }`}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
