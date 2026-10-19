import { describe, expect, it } from 'vitest';
import { formatRecord, renderRecord } from './output.js';

describe('formatRecord', () => {
  it('aligns keys, flattens string arrays, JSON-encodes objects, blanks null, skips undefined', () => {
    const text = formatRecord({
      id: 'abc',
      title: 'Hello',
      tags: ['a', 'b'],
      count: 2,
      flag: false,
      nothing: null,
      missing: undefined,
      urls: { editor: 'x' },
    });
    expect(text).toBe(
      [
        'id       abc',
        'title    Hello',
        'tags     a, b',
        'count    2',
        'flag     false',
        'nothing',
        'urls     {"editor":"x"}',
      ].join('\n'),
    );
  });

  it('respects an explicit key order and subset', () => {
    expect(formatRecord({ a: 1, b: 2, c: 3 }, ['c', 'a'])).toBe('c  3\na  1');
  });

  it('renders JSON when asked', () => {
    expect(renderRecord({ a: 1 }, 'json')).toBe('{\n  "a": 1\n}');
    expect(renderRecord({ a: 1 }, 'table')).toBe('a  1');
  });
});
