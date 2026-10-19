import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { confirm } from './tty.js';

async function answer(text: string): Promise<{ result: boolean; shown: string }> {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = '';
  output.on('data', (c: Buffer) => {
    shown += c.toString();
  });
  const pending = confirm('Delete it?', { input, output });
  input.write(`${text}\n`);
  return { result: await pending, shown };
}

describe('confirm', () => {
  it('accepts y and yes in any case', async () => {
    expect((await answer('y')).result).toBe(true);
    expect((await answer('YES ')).result).toBe(true);
  });
  it('treats anything else, including empty, as no', async () => {
    expect((await answer('')).result).toBe(false);
    expect((await answer('n')).result).toBe(false);
    expect((await answer('sure')).result).toBe(false);
  });
  it('shows the question with a [y/N] hint', async () => {
    expect((await answer('y')).shown).toContain('Delete it? [y/N] ');
  });
});
