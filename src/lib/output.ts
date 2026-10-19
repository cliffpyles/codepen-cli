export type OutputFormat = 'table' | 'json';

export interface Column<T> {
  header: string;
  value: (row: T) => string;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Render rows as a padded, left-aligned text table. Returns a message when empty. */
export function formatTable<T>(
  rows: T[],
  columns: Column<T>[],
  emptyMessage = 'No results.',
): string {
  if (rows.length === 0) return emptyMessage;
  const cells = rows.map((row) => columns.map((c) => c.value(row)));
  const widths = columns.map((c, i) =>
    Math.max(c.header.length, ...cells.map((r) => (r[i] ?? '').length)),
  );
  const line = (values: string[]) =>
    values
      .map((v, i) => v.padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd();
  return [line(columns.map((c) => c.header)), ...cells.map(line)].join('\n');
}

export function render<T>(rows: T[], columns: Column<T>[], format: OutputFormat): string {
  return format === 'json' ? formatJson(rows) : formatTable(rows, columns);
}
