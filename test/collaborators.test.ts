import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/program.js';
import { callOf, cliHarness, fakeFetch, jsonResponse, TEST_URL } from './helpers.js';

let dir: string;
let configFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepen-collab-'));
  configFile = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const V2 = `${TEST_URL}/v2`;
const body = (fetch: ReturnType<typeof fakeFetch>, i = 0): unknown =>
  JSON.parse(callOf(fetch, i).init?.body as string);
const alice = { username: 'alice', name: 'Alice', role: 'Editor', is_team_member: true };
const invite = { id: 'i1', email: null, username: 'bob', role: 'Viewer', created_at: '2026-10-19' };

describe('pens collaborators', () => {
  it('lists collaborators as a table or JSON', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [alice] }), jsonResponse({ body: [] }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'collaborators', 'list', 'p1'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/p1/collaborators`);
    expect(h.out[0]).toMatch(/^alice\s+Alice\s+Editor\s+yes$/m);
    expect(await run(['--json', 'pens', 'collaborators', 'list', 'p1'], h.io)).toBe(0);
    expect(h.out[1]).toBe('[]');
  });

  it('invites with a role, case-insensitively, and shows pending invites', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 201, body: [invite] }));
    const h = cliHarness(configFile, { fetch });
    expect(
      await run(
        ['pens', 'collaborators', 'invite', 'p1', 'bob@example.com', '--role', 'viewer'],
        h.io,
      ),
    ).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/collaborators`,
      init: { method: 'POST' },
    });
    expect(body(fetch)).toEqual({ email_or_username: 'bob@example.com', role: 'Viewer' });
    expect(h.out[0]).toBe('Invited bob@example.com as Viewer.');
    expect(h.out[1]).toMatch(/^i1\s+bob\s+Viewer\s+2026-10-19$/m);
  });

  it('requires --role and rejects unknown roles', async () => {
    const h = cliHarness(configFile, { fetch: fakeFetch() });
    expect(await run(['pens', 'collaborators', 'invite', 'p1', 'bob'], h.io)).toBe(1);
    expect(h.stderr()).toContain("required option '--role <role>'");
    const h2 = cliHarness(configFile, { fetch: fakeFetch() });
    expect(
      await run(['pens', 'collaborators', 'invite', 'p1', 'bob', '--role', 'Owner'], h2.io),
    ).toBe(78);
    expect(h2.stderr()).toContain('--role must be one of: Editor, Viewer');
  });

  it('changes a role and prints the collaborator list', async () => {
    const fetch = fakeFetch(jsonResponse({ body: [{ ...alice, role: 'Viewer' }] }));
    const h = cliHarness(configFile, { fetch });
    expect(
      await run(
        ['--json', 'pens', 'collaborators', 'set-role', 'p1', 'alice', '--role', 'Viewer'],
        h.io,
      ),
    ).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/collaborators/alice`,
      init: { method: 'PATCH' },
    });
    expect(body(fetch)).toEqual({ role: 'Viewer' });
    expect(JSON.parse(h.stdout())).toEqual([{ ...alice, role: 'Viewer' }]);
  });

  it('removes a collaborator after confirmation', async () => {
    const fetch = fakeFetch(jsonResponse({ status: 204 }), jsonResponse({ status: 204 }));
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'collaborators', 'remove', 'p1', 'alice'], h.io)).toBe(78);
    expect(fetch).not.toHaveBeenCalled();
    expect(await run(['pens', 'collaborators', 'remove', 'p1', 'alice', '-y'], h.io)).toBe(0);
    expect(callOf(fetch)).toMatchObject({
      url: `${V2}/pens/p1/collaborators/alice`,
      init: { method: 'DELETE' },
    });
    expect(h.out[0]).toBe('Removed alice from Pen p1.');
    expect(
      await run(['--json', 'pens', 'collaborators', 'remove', 'p1', 'alice', '-y'], h.io),
    ).toBe(0);
    expect(JSON.parse(h.out[1] ?? '')).toEqual({ pen: 'p1', username: 'alice', removed: true });
  });

  it('lists invites, showing email when there is no username', async () => {
    const fetch = fakeFetch(
      jsonResponse({ body: [{ ...invite, username: null, email: 'c@d.co' }] }),
    );
    const h = cliHarness(configFile, { fetch });
    expect(await run(['pens', 'collaborators', 'invites', 'p1'], h.io)).toBe(0);
    expect(callOf(fetch).url).toBe(`${V2}/pens/p1/invites`);
    expect(h.stdout()).toMatch(/^i1\s+c@d\.co\s+Viewer/m);
  });
});
