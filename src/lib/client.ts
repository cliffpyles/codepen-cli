import type {
  Asset,
  Build,
  Collaborator,
  Collection,
  Deployment,
  FileChange,
  FileEdit,
  Invite,
  ListOptions,
  Page,
  Pen,
  PenDomain,
  PenFile,
  PenSettings,
  TrashItem,
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
  created_since?: string | undefined;
  created_until?: string | undefined;
  updated_since?: string | undefined;
  updated_until?: string | undefined;
  untitled?: boolean | undefined;
  /** Pens whose saved head uses this Block. A capped scan that pages by `cursor`. */
  block?: string | undefined;
  cursor?: string | undefined;
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

/** Options accepted by file writes, which can also be tried without saving. */
export interface FileWriteOptions extends WriteOptions {
  /** Build the proposed files without saving them; the head does not move. */
  dry_run?: boolean | undefined;
}

/** File writes that make one version can also name it. */
export interface LabeledWriteOptions extends FileWriteOptions {
  /** Names the saved version (at most 80 characters). */
  label?: string | undefined;
}

/** A file to include in a new Pen: text as `content`, binary as `data`. */
export interface TextFileInput {
  path: string;
  content: string;
}
export interface BinaryFileInput {
  path: string;
  data: Uint8Array;
}
export type FileInput = TextFileInput | BinaryFileInput;

export function isBinaryInput(file: FileInput): file is BinaryFileInput {
  return 'data' in file;
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

/** The cursor in a `Link` header's next page, for lists that page by cursor. */
export function parseNextCursor(header: string | null): string | undefined {
  const next = header?.split(',').find((part) => part.includes('rel="next"'));
  const url = next && /<([^>]+)>/.exec(next)?.[1];
  return url ? (new URL(url).searchParams.get('cursor') ?? undefined) : undefined;
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

/**
 * Wrap bytes in a Blob for multipart upload. Copies into a fresh
 * ArrayBuffer-backed view so the part is a valid BlobPart regardless of the
 * source buffer type (ArrayBuffer or SharedArrayBuffer).
 */
function toBlob(data: Uint8Array): Blob {
  return new Blob([new Uint8Array(data)]);
}

/** Add one multipart part per binary file, named by the file's Pen path. */
function appendUploads(form: FormData, uploads: BinaryFileInput[]): void {
  for (const upload of uploads) {
    const path = normalizePenPath(upload.path);
    form.set(path, toBlob(upload.data), path.split('/').pop() ?? 'file');
  }
}

function dropUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export class CodePenClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  /** The fetch in use, exposed for downloads of file URLs outside the API. */
  readonly fetch: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
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
    const response = await this.fetch(this.buildUrl(path, init.query), {
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
    const link = response.headers.get('link');
    const next_cursor = parseNextCursor(link);
    return { items: data, links: parseLinkHeader(link), ...(next_cursor ? { next_cursor } : {}) };
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

  /**
   * Create a Pen. Text files travel in the JSON body; when any file is binary the
   * request goes multipart, with the JSON in a `pen` part and one part per binary file.
   */
  async createPen(
    input: PenInput & { files?: FileInput[] | undefined },
    options: WriteOptions = {},
  ): Promise<Pen & { build?: Build }> {
    const uploads = (input.files ?? []).filter(isBinaryInput);
    if (uploads.length === 0) {
      return this.send<Pen & { build?: Build }>('POST', '/pens', { ...input, wait: options.wait });
    }
    const text = (input.files ?? []).filter((f) => !isBinaryInput(f));
    const form = new FormData();
    form.set('pen', JSON.stringify(dropUndefined({ ...input, files: text })));
    appendUploads(form, uploads);
    const query = options.wait === undefined ? {} : { wait: options.wait };
    return (await this.request<Pen & { build?: Build }>('POST', '/pens', { form, query })).data;
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

  /** Take a Pen out of the trash. `id` is the trash item's `item_id`. */
  restorePen(id: string) {
    return this.send<Pen>('POST', `/pens/${enc(id)}/restore`);
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
  putFile(penId: string, path: string, content: string, options: FileWriteOptions = {}) {
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
    options: FileWriteOptions = {},
  ): Promise<WriteResult> {
    const form = new FormData();
    form.set('file', toBlob(data), normalizePenPath(path).split('/').pop() ?? 'file');
    if (options.wait !== undefined) form.set('wait', String(options.wait));
    if (options.expected_version_id) form.set('expected_version_id', options.expected_version_id);
    const result = await this.request<WriteResult>(
      'PUT',
      `/pens/${enc(penId)}/files${encPath(path)}`,
      { form, query: { dry_run: options.dry_run } },
    );
    return result.data;
  }

  /**
   * Apply several changes as one new version. Binary `uploads` turn the request
   * multipart; each becomes one more change, applied after those in `files`.
   */
  async putFiles(
    penId: string,
    files: FileChange[],
    options: LabeledWriteOptions = {},
    uploads: BinaryFileInput[] = [],
  ): Promise<WriteResult> {
    const path = `/pens/${enc(penId)}/files`;
    if (uploads.length === 0) {
      return this.send<WriteResult>('PUT', path, { files, ...options });
    }
    const form = new FormData();
    if (files.length || options.label) {
      form.set('changes', JSON.stringify(dropUndefined({ files, label: options.label })));
    }
    if (options.expected_version_id) form.set('expected_version_id', options.expected_version_id);
    appendUploads(form, uploads);
    const query = { wait: options.wait, dry_run: options.dry_run };
    return (await this.request<WriteResult>('PUT', path, { form, query })).data;
  }

  /**
   * Change text files without resending them, as one new version. If any hunk cannot be applied the
   * whole write fails with BAD_USER_INPUT, and the error's `details.misses` lists every miss.
   */
  editFiles(penId: string, edits: FileEdit[], options: LabeledWriteOptions = {}) {
    return this.send<WriteResult>('PATCH', `/pens/${enc(penId)}/files`, { edits, ...options });
  }

  deleteFile(penId: string, path: string, options: FileWriteOptions = {}) {
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

  restoreVersion(penId: string, versionId: string, label?: string) {
    return this.send<Pen>(
      'POST',
      `/pens/${enc(penId)}/versions/${enc(versionId)}/restore`,
      undefined,
      { label },
    );
  }

  deploy(penId: string, versionId?: string) {
    return this.send<Deployment>('PUT', `/pens/${enc(penId)}/deployment`, {
      version_id: versionId,
    });
  }

  undeploy(penId: string) {
    return this.send<undefined>('DELETE', `/pens/${enc(penId)}/deployment`);
  }

  // ---- Custom domains -------------------------------------------------------

  listDomains(penId: string) {
    return this.get<PenDomain[]>(`/pens/${enc(penId)}/domains`);
  }

  /** Answers every custom domain, with the DNS records to create so the new one verifies. */
  addDomain(penId: string, host: string) {
    return this.send<PenDomain[]>('POST', `/pens/${enc(penId)}/domains`, { host });
  }

  /** Answers the custom domains that remain. */
  removeDomain(penId: string, host: string) {
    return this.send<PenDomain[]>('DELETE', `/pens/${enc(penId)}/domains/${enc(host)}`);
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

  /** Take a Collection out of the trash. `id` is the trash item's `item_id`. */
  restoreCollection(id: string) {
    return this.send<Collection>('POST', `/collections/${enc(id)}/restore`);
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

  // ---- Trash ----------------------------------------------------------------

  listTrash(options: ListOptions = {}) {
    return this.list<TrashItem>('/trash', { ...options });
  }

  /** Delete a trashed Pen for good. Answers the trash item that was deleted. */
  purgePen(id: string) {
    return this.send<TrashItem>('DELETE', `/trash/pens/${enc(id)}`);
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
    form.set('file', toBlob(data), filename);
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
    form.set('file', toBlob(changes.data), changes.filename ?? 'file');
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
