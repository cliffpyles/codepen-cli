import type { Asset, Collection, ListOptions, Page, Pen } from '../types.js';
import { CodePenApiError } from './errors.js';

export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
}

type Query = Record<string, string | number | boolean | string[] | undefined>;

export interface PenListOptions extends ListOptions {
  access?: string | undefined;
  tags?: string[] | undefined;
  search_term?: string | undefined;
}

export interface CollectionListOptions extends ListOptions {
  access?: string | undefined;
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

export class CodePenClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: ClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  buildUrl(path: string, query: Query = {}): string {
    const url = new URL(`${this.baseUrl}/v2${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v);
      } else url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  // Callers name T explicitly to type the parsed body; there is no value to infer it from.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  async request<T>(
    method: string,
    path: string,
    init: { query?: Query; body?: unknown } = {},
  ): Promise<{ data: T; response: Response }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'codepen-cli',
    };
    let body: string | undefined;
    if (init.body !== undefined) {
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

  listPens(options: PenListOptions = {}) {
    return this.list<Pen>('/pens', { ...options });
  }

  getPen(id: string) {
    return this.get<Pen>(`/pens/${encodeURIComponent(id)}`);
  }

  listCollections(options: CollectionListOptions = {}) {
    return this.list<Collection>('/collections', { ...options });
  }

  listAssets(options: ListOptions = {}) {
    return this.list<Asset>('/assets', { ...options });
  }
}

function isErrorBody(value: unknown): value is { message: string; code: never } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
