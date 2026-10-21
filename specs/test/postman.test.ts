import { describe, expect, it } from 'vitest';
import { buildCollection } from '../lib/postman.js';
import { loadSpec, operations } from '../lib/spec.js';

interface Request {
  method: string;
  body?: { mode: string; raw?: string };
  url: {
    query?: { key: string; disabled?: boolean }[];
    variable?: { key: string; value: string }[];
  };
}
interface Item {
  name: string;
  item?: Item[];
  request: Request;
}

const doc = loadSpec();
const collection = (await buildCollection(doc)) as unknown as {
  info: { name: string };
  auth: unknown;
  item: Item[];
};
const flatten = (items: Item[]): Item[] => items.flatMap((i) => (i.item ? flatten(i.item) : [i]));
const requests = flatten(collection.item);
const named = (name: string) => {
  const found = requests.find((r) => r.name === name);
  if (!found) throw new Error(`no request named ${name}`);
  return found.request;
};

describe('Postman collection', () => {
  it('has one request per operation, in a folder per tag', () => {
    expect(requests).toHaveLength(operations(doc).length);
    expect(collection.item.map((folder) => folder.name)).toEqual(
      (doc.tags as { name: string }[]).map((tag) => tag.name),
    );
  });

  it('authenticates every request with a bearerToken variable, never a stored key', () => {
    expect(collection.auth).toEqual({
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{bearerToken}}' }],
    });
  });

  it("sends each request body in the spec's first-listed media type", () => {
    expect(named('Write one file').body?.mode).toBe('raw');
    expect(named('Apply several file changes as one version').body?.mode).toBe('raw');
    expect(named('Create a 2.0 Pen').body?.mode).toBe('raw');
    expect(named('Add an Asset').body?.mode).toBe('formdata');
  });

  it('leaves optional query parameters unticked', () => {
    const query = named('List your Pens').url.query ?? [];
    expect(query.length).toBeGreaterThan(0);
    expect(query.every((q) => q.disabled === true)).toBe(true);
  });

  it("fills requests from the spec's examples", () => {
    expect(JSON.parse(named("Update a Pen's details").body?.raw ?? '{}')).toEqual({
      title: 'Hello, world',
      tags: ['api', 'demo', 'v2'],
      access: 'Public',
    });
  });

  it('keeps the file path as one variable', () => {
    const variables = named('Get one file').url.variable ?? [];
    expect(variables.find((v) => v.key === 'path')?.value).toBe('src/app.js');
  });
});
