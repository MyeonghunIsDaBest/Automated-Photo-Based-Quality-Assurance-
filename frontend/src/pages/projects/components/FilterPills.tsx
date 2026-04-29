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
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{option.label}</span>
            <span
              className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
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
