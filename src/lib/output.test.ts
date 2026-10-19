import { describe, expect, it } from 'vitest';
import { formatJson, formatTable, render } from './output.js';

const rows = [
  { id: 'a', title: 'Short' },
  { id: 'bbbb', title: 'A longer title' },
];
const columns = [
  { header: 'ID', value: (r: (typeof rows)[number]) => r.id },
  { header: 'TITLE', value: (r: (typeof rows)[number]) => r.title },
];

describe('formatTable', () => {
  it('pads columns to the widest cell or header', () => {
    expect(formatTable(rows, columns)).toBe(
      ['ID    TITLE', 'a     Short', 'bbbb  A longer title'].join('\n'),
    );
  });

  it('returns the empty message when there are no rows', () => {
    expect(formatTable([], columns)).toBe('No results.');
    expect(formatTable([], columns, 'Nothing here')).toBe('Nothing here');
  });
});

describe('formatJson / render', () => {
  it('pretty-prints JSON', () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('dispatches on the format', () => {
    expect(render(rows, columns, 'json')).toBe(formatJson(rows));
    expect(render(rows, columns, 'table')).toBe(formatTable(rows, columns));
  });
});
