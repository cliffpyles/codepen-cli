/** Shapes returned by the CodePen API v2 REST interface. Keys are snake_case as served. */

export type Access = 'Public' | 'Private' | 'Protected' | 'Collaborators';
export type BuildStatus = 'Queued' | 'Running' | 'Success' | 'Failed' | 'Canceled';
export type Role = 'Owner' | 'Editor' | 'Viewer';

export interface Diagnostic {
  type: 'Error' | 'Warning' | 'Information' | 'Hint';
  scope: 'Build' | 'BuildStep' | 'File';
  message: string;
  code?: string | null;
  url?: string | null;
  block_name?: string | null;
  path?: string | null;
  file_id?: string | null;
  range?: unknown;
}

export interface Patch {
  type: 'create' | 'update' | 'delete';
  path: string;
  file_id?: string | null;
  content?: string;
}

export interface Build {
  id: string;
  status: BuildStatus;
  started_at?: string | null;
  ended_at?: string | null;
  rounds?: number;
  diagnostics?: Diagnostic[];
  errors?: Diagnostic[];
  applied_patches?: Patch[];
  patches?: Patch[];
  files?: PenFile[];
  version_id?: string | null;
  next_id?: string | null;
  previous_id?: string | null;
}

export interface PenFile {
  id: string;
  path: string;
  name?: string;
  content_hash?: string;
  is_binary?: boolean;
  content?: string | null;
  url?: string | null;
}

export interface Version {
  id: string;
  pen_id?: string;
  hash?: string;
  created_at?: string;
  deployed?: boolean;
  build?: Build | null;
  preview_url?: string | null;
  files?: PenFile[];
}

export interface Deployment {
  id: string;
  version_id: string;
  url?: string;
  custom_domains?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface PenSettings {
  auto_deploy?: boolean;
  auto_run?: boolean;
  auto_save?: boolean;
  indent_with?: string;
  tab_size?: number;
}

export interface Pen {
  id: string;
  title: string;
  description?: string | null;
  tags?: string[];
  access: Access;
  password?: null;
  template?: boolean;
  popularity?: number;
  editor?: 'Classic' | 'V2';
  created_at?: string;
  updated_at?: string;
  urls?: { editor?: string; preview?: string };
  screenshot_urls?: Record<string, string> | null;
  saved_version?: Version | null;
  deployment?: Deployment | null;
  settings?: PenSettings;
}

export interface Collaborator {
  username: string;
  name?: string | null;
  role: Role;
  is_team_member?: boolean;
}

export interface Invite {
  id: string;
  email?: string | null;
  username?: string | null;
  role: Role;
  created_at?: string;
}

export interface Collection {
  id: string;
  title: string;
  description?: string | null;
  access: Access;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Asset {
  id: string;
  filename: string;
  url?: string;
  is_binary?: boolean;
  content?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Result of every file-writing endpoint. */
export interface WriteResult {
  pen: Pen;
  version: Version;
  build: Build;
}

/** One entry in a bulk file change. Address a file by `path` or `id`. */
export interface FileChange {
  path?: string;
  id?: string;
  content?: string;
  delete?: boolean;
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
