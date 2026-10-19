import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { isInteractive, promptSecret, readAll } from './tty.js';

function collect(stream: PassThrough): () => string {
  let text = '';
  stream.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });
  return () => text;
}

describe('promptSecret', () => {
  it('shows the prompt, hides the typed characters, and returns the answer', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const shown = collect(output);

    const pending = promptSecret('API key: ', { input, output });
    input.write('cp_user_secret\n');
    await expect(pending).resolves.toBe('cp_user_secret');

    expect(shown()).toContain('API key: ');
    expect(shown()).not.toContain('secret');
    expect(shown().endsWith('\n')).toBe(true);
  });
});

describe('readAll', () => {
  it('concatenates string and buffer chunks', async () => {
    const input = new PassThrough();
    const pending = readAll(input);
    input.write('cp_');
    input.write(Buffer.from('user_x'));
    input.end('\n');
    await expect(pending).resolves.toBe('cp_user_x\n');
  });
});

describe('isInteractive', () => {
  it('requires both streams to be TTYs', () => {
    expect(isInteractive({ isTTY: true }, { isTTY: true })).toBe(true);
    expect(isInteractive({ isTTY: true }, { isTTY: false })).toBe(false);
    expect(isInteractive({ isTTY: undefined }, { isTTY: true })).toBe(false);
  });
});
