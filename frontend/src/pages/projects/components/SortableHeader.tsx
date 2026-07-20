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
    <th className={`px-4 py-3 font-medium text-[#3A3A3A] ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`group inline-flex items-center gap-1.5 transition-colors hover:text-[#1A1A1A] ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        <span>{label}</span>
        <Icon
          className={`h-3.5 w-3.5 ${isActive ? 'text-[#3A3A3A]' : 'text-[#A0A0A0] group-hover:text-[#6B6B6B]'}`}
        />
      </button>
    </th>
  );
}
