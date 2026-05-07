import { cn } from '../../lib/editorial';

export interface ColumnDef<TRow> {
  key: string;
  header: React.ReactNode;
  /** Renders the cell on tablet+ table layout. Defaults to `(row) => row[key]`. */
  cell?: (row: TRow) => React.ReactNode;
  /** Right-aligned (numeric) column. */
  align?: 'left' | 'right';
  /** Hide on mobile; useful for low-priority columns that only the table
   *  layout has space for (the mobileCard renderer can still surface them). */
  desktopOnly?: boolean;
  className?: string;
}

interface ResponsiveDataTableProps<TRow> {
  columns: ColumnDef<TRow>[];
  rows: TRow[];
  /** Stable id per row for React keys. */
  rowKey: (row: TRow) => string;
  /** Renders one row as a stacked card on `<md` viewports. Make this rich —
   *  the table version isn't shown on phones. */
  mobileCard: (row: TRow) => React.ReactNode;
  /** Optional row click handler — wraps both the desktop row and the mobile
   *  card in a button-styled wrapper. */
  onRowClick?: (row: TRow) => void;
  /** Empty-state node rendered when rows.length === 0. */
  empty?: React.ReactNode;
  className?: string;
}

export default function ResponsiveDataTable<TRow>({
  columns,
  rows,
  rowKey,
  mobileCard,
  onRowClick,
  empty,
  className,
}: ResponsiveDataTableProps<TRow>) {
  if (rows.length === 0) {
    return (
      <div className={cn('px-6 py-8 text-center text-sm italic text-slate-400', className)}>
        {empty ?? 'No rows.'}
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      {/* Mobile: stacked card list. Hidden on tablet+. */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            {onRowClick ? (
              <button
                type="button"
                onClick={() => onRowClick(row)}
                className="block w-full px-5 py-4 text-left transition-colors hover:bg-slate-50/60"
              >
                {mobileCard(row)}
              </button>
            ) : (
              <div className="px-5 py-4">{mobileCard(row)}</div>
            )}
          </li>
        ))}
      </ul>

      {/* Tablet+: real table. Hidden on mobile. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-b border-slate-100 last:border-b-0',
                  onRowClick && 'cursor-pointer transition-colors hover:bg-slate-50/60',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 align-middle text-slate-700',
                      col.align === 'right' ? 'text-right tabular-nums' : '',
                      col.className,
                    )}
                  >
                    {col.cell
                      ? col.cell(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
