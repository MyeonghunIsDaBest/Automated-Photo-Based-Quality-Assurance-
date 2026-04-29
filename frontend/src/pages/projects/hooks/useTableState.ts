import { useMemo, useState } from 'react';
import { SortDirection, SortState } from '../types';

export interface TableStateConfig<T, K extends string> {
  rows: T[];
  searchFields: (keyof T)[];
  initialSortKey?: K | null;
  initialSortDirection?: SortDirection;
  getSortValue?: (row: T, key: K) => string | number;
}

export interface TableStateResult<T, K extends string> {
  search: string;
  setSearch: (value: string) => void;
  sort: SortState<K>;
  toggleSort: (key: K) => void;
  applied: T[];
}

export function useTableState<T, K extends string = string>(
  config: TableStateConfig<T, K>
): TableStateResult<T, K> {
  const {
    rows,
    searchFields,
    initialSortKey = null,
    initialSortDirection = 'asc',
    getSortValue,
  } = config;

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<K>>({
    key: initialSortKey,
    direction: initialSortDirection,
  });

  const toggleSort = (key: K) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: 'asc' };
    });
  };

  const applied = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = query
      ? rows.filter((row) =>
          searchFields.some((field) => {
            const value = row[field];
            return value != null && String(value).toLowerCase().includes(query);
          })
        )
      : rows.slice();

    if (!sort.key) return filtered;

    const key = sort.key;
    const direction = sort.direction === 'asc' ? 1 : -1;

    return filtered.sort((a, b) => {
      const aVal = getSortValue ? getSortValue(a, key) : (a as Record<string, unknown>)[key as string];
      const bVal = getSortValue ? getSortValue(b, key) : (b as Record<string, unknown>)[key as string];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * direction;
      }
      return String(aVal ?? '').localeCompare(String(bVal ?? '')) * direction;
    });
  }, [rows, search, sort, searchFields, getSortValue]);

  return { search, setSearch, sort, toggleSort, applied };
}
