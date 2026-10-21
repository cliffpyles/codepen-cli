/**
 * Type-level tests of the generated types, checked by `npm run typecheck` rather than run.
 * Each `@ts-expect-error` must stay an error: if a spec edit weakens the generated types, the
 * directive becomes unused and the typecheck fails.
 */

import type { components } from '../generated/codepen-api-v2.js';

type Schemas = components['schemas'];
const fileId = '01a0884b-3177-71c3-a1c2-9452bfb9a3fb';

// FileChange is a union of the documented forms, not `unknown`.
export const fileChanges: Schemas['FileChange'][] = [
  { path: 'index.html', content: '<h1>Hi</h1>' },
  { id: fileId, content: 'x' },
  { id: fileId, path: 'src/app.js' },
  { id: fileId, path: 'src/app.js', content: 'x' },
  { path: 'old', delete: true },
  { id: fileId, delete: true },
];
// @ts-expect-error a number is not a file change
export const notAChange: Schemas['FileChange'] = 42;
// @ts-expect-error an id alone is no documented form
export const idOnly: Schemas['FileWriteById'] = { id: fileId };

// Every version carries its build.
// @ts-expect-error a version without its build
export const versionWithoutBuild: Schemas['Version'] = {
  id: fileId,
  pen_id: fileId,
  hash: '',
  created_at: '',
  deployed: false,
  preview_url: '',
};

// Each error schema fixes and requires its code.
export const wrongCode: Schemas['ConflictError'] = {
  message: '',
  // @ts-expect-error a conflict must say CONFLICT
  code: 'NOT_FOUND',
  expected_version_id: fileId,
  current_version_id: fileId,
};
// @ts-expect-error an error must have a code
export const noCode: Schemas['NotFoundError'] = { message: '' };
export const notFound: Schemas['NotFoundError'] = { message: 'pen not found', code: 'NOT_FOUND' };
