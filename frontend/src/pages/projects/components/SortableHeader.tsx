import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { SortState } from '../types';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  align?: 'left' | 'right';
  className?: string;
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onToggle,
  align = 'left',
  className = '',
}: SortableHeaderProps<K>) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive
    ? ChevronsUpDown
    : sort.direction === 'asc'
      ? ChevronUp
      : ChevronDown;

  return (
    <th className={`px-4 py-3 font-medium text-slate-700 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`group inline-flex items-center gap-1.5 transition-colors hover:text-slate-900 ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        <span>{label}</span>
        <Icon
          className={`h-3.5 w-3.5 ${isActive ? 'text-slate-700' : 'text-slate-400 group-hover:text-slate-600'}`}
        />
      </button>
    </th>
  );
}
