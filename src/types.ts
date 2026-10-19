/** Shapes returned by the CodePen API v2 REST interface. Keys are snake_case as served. */

export type Access = 'Public' | 'Private' | 'Protected' | 'Collaborators';

export interface Pen {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  access: Access;
  url?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Collection {
  id: string;
  title: string;
  description?: string;
  access: Access;
  [key: string]: unknown;
}

export interface Asset {
  id: string;
  filename: string;
  url?: string;
  content?: string;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  message: string;
  code: ApiErrorCode;
}

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'BAD_USER_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ListOptions {
  page?: number | undefined;
  per_page?: number | undefined;
  sort?: string | undefined;
  direction?: 'asc' | 'desc' | undefined;
}

export interface Page<T> {
  items: T[];
  /** Page numbers parsed from the `Link` response header, when present. */
  links: Partial<Record<'next' | 'prev' | 'first' | 'last', number>>;
}
