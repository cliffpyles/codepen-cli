import type {
  Asset,
  Build,
  Collaborator,
  Collection,
  Deployment,
  FileChange,
  Invite,
  ListOptions,
  Page,
  Pen,
  PenFile,
  PenSettings,
  Version,
  WriteResult,
} from '../types.js';
import { CodePenApiError } from './errors.js';

export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Injectable for tests. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

type QueryValue = string | number | boolean | string[] | undefined;
type Query = Record<string, QueryValue>;

export interface PenListOptions extends ListOptions {
  access?: string | undefined;
  tags?: string[] | undefined;
  search_term?: string | undefined;
  deployed?: boolean | undefined;
  template?: boolean | undefined;
  forks?: string | undefined;
  editor?: string | undefined;
}

export interface CollectionListOptions extends ListOptions {
  access?: string | undefined;
}

export interface PenInput {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  access?: string | undefined;
  password?: string | undefined;
  template?: boolean | undefined;
}

/** Options accepted by every write that triggers a build. */
export interface WriteOptions {
  /** Seconds to wait for the build (0–75). Server default is 45. */
  wait?: number | undefined;
  /** Refuse the write with CONFLICT if the Pen's head is no longer this version. */
  expected_version_id?: string | undefined;
}

export interface CollectionInput {
  title?: string | undefined;
  description?: string | undefined;
  access?: string | undefined;
}

export interface RequestInit {
  query?: Query;
  body?: unknown;
  form?: FormData;
}

/** Parse a GitHub-style `Link` header into page numbers keyed by rel. */
export function parseLinkHeader(header: string | null): Page<never>['links'] {
  const links: Page<never>['links'] = {};
  if (!header) return links;
  for (const part of header.split(',')) {
    const match = /<([^>]+)>;\s*rel="(next|prev|first|last)"/.exec(part.trim());
    if (!match) continue;
    const [, url, rel] = match as unknown as [string, string, keyof typeof links];
    const page = new URL(url).searchParams.get('page');
    if (page !== null && !Number.isNaN(Number(page))) links[rel] = Number(page);
  }
  return links;
}

/** A build is settled when the API will not change it any further on its own. */
export function isBuildSettled(build: Build): boolean {
  if (build.status === 'Queued' || build.status === 'Running') return false;
  if (build.status === 'Canceled' && build.next_id) return false;
  return true;
}

/** Normalise user-supplied file paths to the API's leading-slash form. */
export function normalizePenPath(path: string): string {
  const trimmed = path.trim().replace(/^\.?\/+/, '');
  return `/${trimmed}`;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** Encode a file path segment by segment so slashes survive. */
function encPath(path: string): string {
  return normalizePenPath(path).split('/').map(enc).join('/');
}

function dropUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export class CodePenClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  buildUrl(path: string, query: Query = {}): string {
    const url = new URL(`${this.baseUrl}/v2${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      // The API takes lists as comma-separated values (e.g. tags=a,b).
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    return url.toString();
  }

  // Callers name T explicitly to type the parsed body; there is no value to infer it from.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  async request<T>(
    method: string,
    path: string,
    init: RequestInit = {},
  ): Promise<{ data: T; response: Response }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'codepen-cli',
    };
    let body: string | FormData | undefined;
    if (init.form) {
      body = init.form; // fetch sets the multipart boundary header itself
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const response = await this.fetchImpl(this.buildUrl(path, init.query), {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });

    if (!response.ok) {
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = undefined;
      }
      const errBody = isErrorBody(parsed) ? parsed : undefined;
      throw new CodePenApiError(
        response.status,
        errBody,
        `HTTP ${response.status} ${response.statusText}`,
      );
    }
    if (response.status === 204) return { data: undefined as T, response };
    return { data: (await response.json()) as T, response };
  }

  async get<T>(path: string, query?: Query): Promise<T> {
    const result = await this.request<T>('GET', path, query ? { query } : {});
    return result.data;
  }

  private async list<T>(path: string, query: Query): Promise<Page<T>> {
    const { data, response } = await this.request<T[]>('GET', path, { query });
    return { items: data, links: parseLinkHeader(response.headers.get('link')) };
  }

  private async send<T>(method: string, path: string, body?: object, query?: Query): Promise<T> {
    const init: RequestInit = {};
    if (body !== undefined) init.body = dropUndefined(body);
    if (query) init.query = query;
    return (await this.request<T>(method, path, init)).data;
  }

  // ---- Pens -----------------------------------------------------------------

  listPens(options: PenListOptions = {}) {
    return this.list<Pen>('/pens', { ...options });
  }

  getPen(id: string) {
    return this.get<Pen>(`/pens/${enc(id)}`);
  }

  createPen(
    input: PenInput & { files?: { path: string; content: string }[] | undefined },
    options: WriteOptions = {},
  ) {
    return this.send<Pen & { build?: Build }>('POST', '/pens', { ...input, wait: options.wait });
  }

  updatePen(id: string, input: PenInput) {
    return this.send<Pen>('PATCH', `/pens/${enc(id)}`, input);
  }

  deletePen(id: string) {
    return this.send<undefined>('DELETE', `/pens/${enc(id)}`);
  }

  forkPen(id: string, input: PenInput = {}, options: WriteOptions = {}) {
    return this.send<Pen & { build?: Build }>('POST', `/pens/${enc(id)}/fork`, {
      ...input,
      wait: options.wait,
    });
  }

  updatePenSettings(id: string, settings: PenSettings) {
    return this.send<PenSettings>('PATCH', `/pens/${enc(id)}/settings`, settings);
  }

  // ---- Pen files ------------------------------------------------------------

  listFiles(penId: string) {
    return this.get<PenFile[]>(`/pens/${enc(penId)}/files`);
  }

  getFile(penId: string, path: string) {
    return this.get<PenFile>(`/pens/${enc(penId)}/files${encPath(path)}`);
  }

  /** Write one text file. */
  putFile(penId: string, path: string, content: string, options: WriteOptions = {}) {
    return this.send<WriteResult>('PUT', `/pens/${enc(penId)}/files${encPath(path)}`, {
      content,
      ...options,
    });
  }

  /** Write one binary file as multipart. */
  async putBinaryFile(
    penId: string,
    path: string,
    data: Uint8Array,
    options: WriteOptions = {},
  ): Promise<WriteResult> {
    const form = new FormData();
    form.set('file', new Blob([data]), normalizePenPath(path).split('/').pop() ?? 'file');
    if (options.wait !== undefined) form.set('wait', String(options.wait));
    if (options.expected_version_id) form.set('expected_version_id', options.expected_version_id);
    const result = await this.request<WriteResult>(
      'PUT',
      `/pens/${enc(penId)}/files${encPath(path)}`,
      {
        form,
      },
    );
    return result.data;
  }

  /** Apply several changes as one new version. */
  putFiles(penId: string, files: FileChange[], options: WriteOptions = {}) {
    return this.send<WriteResult>('PUT', `/pens/${enc(penId)}/files`, { files, ...options });
  }

  deleteFile(penId: string, path: string, options: WriteOptions = {}) {
    return this.send<WriteResult>(
      'DELETE',
      `/pens/${enc(penId)}/files${encPath(path)}`,
      undefined,
      {
        ...options,
      },
    );
  }

  // ---- Versions, builds, deployments ----------------------------------------

  listVersions(penId: string, options: ListOptions = {}) {
    return this.list<Version>(`/pens/${enc(penId)}/versions`, { ...options });
  }

  getVersion(id: string) {
    return this.get<Version>(`/versions/${enc(id)}`);
  }

  getBuild(id: string) {
    return this.get<Build>(`/builds/${enc(id)}`);
  }

  /**
   * Follow a build until it settles: poll while Queued/Running, and hop to `next_id`
   * when the compiler produced a follow-up version. Gives up after `timeoutMs`.
   */
  async waitForBuild(
    build: Build,
    { intervalMs = 1500, timeoutMs = 90_000 }: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<Build> {
    let current = build;
    let elapsed = 0;
    while (!isBuildSettled(current)) {
      if (elapsed >= timeoutMs) return current;
      await this.sleep(intervalMs);
      elapsed += intervalMs;
      const id = current.status === 'Canceled' && current.next_id ? current.next_id : current.id;
      current = await this.getBuild(id);
    }
    return current;
  }

  restoreVersion(penId: string, versionId: string) {
    return this.send<Pen>('POST', `/pens/${enc(penId)}/versions/${enc(versionId)}/restore`);
  }

  deploy(penId: string, versionId?: string) {
    return this.send<Deployment>('PUT', `/pens/${enc(penId)}/deployment`, {
      version_id: versionId,
    });
  }

  undeploy(penId: string) {
    return this.send<undefined>('DELETE', `/pens/${enc(penId)}/deployment`);
  }

  // ---- Collaborators --------------------------------------------------------

  listCollaborators(penId: string) {
    return this.get<Collaborator[]>(`/pens/${enc(penId)}/collaborators`);
  }

  inviteCollaborator(penId: string, emailOrUsername: string, role: string) {
    return this.send<Invite[]>('POST', `/pens/${enc(penId)}/collaborators`, {
      email_or_username: emailOrUsername,
      role,
    });
  }

  updateCollaborator(penId: string, username: string, role: string) {
    return this.send<Collaborator[]>(
      'PATCH',
      `/pens/${enc(penId)}/collaborators/${enc(username)}`,
      {
        role,
      },
    );
  }

  removeCollaborator(penId: string, username: string) {
    return this.send<undefined>('DELETE', `/pens/${enc(penId)}/collaborators/${enc(username)}`);
  }

  listInvites(penId: string) {
    return this.get<Invite[]>(`/pens/${enc(penId)}/invites`);
  }

  // ---- Collections ----------------------------------------------------------

  listCollections(options: CollectionListOptions = {}) {
    return this.list<Collection>('/collections', { ...options });
  }

  getCollection(id: string) {
    return this.get<Collection>(`/collections/${enc(id)}`);
  }

  createCollection(input: CollectionInput) {
    return this.send<Collection>('POST', '/collections', input);
  }

  updateCollection(id: string, input: CollectionInput) {
    return this.send<Collection>('PATCH', `/collections/${enc(id)}`, input);
  }

  deleteCollection(id: string) {
    return this.send<undefined>('DELETE', `/collections/${enc(id)}`);
  }

  listCollectionPens(id: string, options: ListOptions = {}) {
    return this.list<Pen>(`/collections/${enc(id)}/pens`, { ...options });
  }

  addPenToCollection(id: string, penId: string) {
    return this.send<Collection>('PUT', `/collections/${enc(id)}/pens/${enc(penId)}`);
  }

  removePenFromCollection(id: string, penId: string) {
    return this.send<undefined>('DELETE', `/collections/${enc(id)}/pens/${enc(penId)}`);
  }

  // ---- Assets ---------------------------------------------------------------

  listAssets(options: ListOptions = {}) {
    return this.list<Asset>('/assets', { ...options });
  }

  getAsset(id: string) {
    return this.get<Asset>(`/assets/${enc(id)}`);
  }

  /** Upload a file. Text goes as JSON; binary as multipart. */
  async createAsset(filename: string, data: Uint8Array | string): Promise<Asset> {
    if (typeof data === 'string') {
      return this.send<Asset>('POST', '/assets', { filename, content: data });
    }
    const form = new FormData();
    form.set('file', new Blob([data]), filename);
    form.set('filename', filename);
    return (await this.request<Asset>('POST', '/assets', { form })).data;
  }

  /** Rename and/or replace an asset. */
  async updateAsset(
    id: string,
    changes: { filename?: string | undefined; data?: Uint8Array | string | undefined },
  ): Promise<Asset> {
    if (changes.data === undefined || typeof changes.data === 'string') {
      return this.send<Asset>('PATCH', `/assets/${enc(id)}`, {
        filename: changes.filename,
        content: changes.data,
      });
    }
    const form = new FormData();
    form.set('file', new Blob([changes.data]), changes.filename ?? 'file');
    if (changes.filename) form.set('filename', changes.filename);
    return (await this.request<Asset>('PATCH', `/assets/${enc(id)}`, { form })).data;
  }

  deleteAsset(id: string) {
    return this.send<undefined>('DELETE', `/assets/${enc(id)}`);
  }
}

function isErrorBody(value: unknown): value is { message: string; code: never } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
