import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export interface Streams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

/** Ask a question and read the answer without echoing the typed characters. */
export async function promptSecret(
  message: string,
  { input, output }: Streams = { input: process.stdin, output: process.stdout },
): Promise<string> {
  let muted = false;
  const sink = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      if (!muted) output.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input, output: sink, terminal: true });
  try {
    const promise = rl.question(message);
    muted = true;
    const answer = await promise;
    output.write('\n');
    return answer;
  } finally {
    rl.close();
  }
}

/** Read a stream to the end as UTF-8. */
export async function readAll(input: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function isInteractive(
  input: { isTTY?: boolean | undefined } = process.stdin,
  output: { isTTY?: boolean | undefined } = process.stdout,
): boolean {
  return Boolean(input.isTTY && output.isTTY);
}

/** Ask a yes/no question. Returns true only for an explicit y/yes. */
export async function confirm(
  message: string,
  { input, output }: Streams = { input: process.stdin, output: process.stdout },
): Promise<boolean> {
  const rl = createInterface({ input, output, terminal: false });
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
