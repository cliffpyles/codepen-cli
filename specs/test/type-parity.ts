/**
 * Type parity tests: how the hand-written types in src/types.ts differ from the types generated
 * from the spec. Checked by `npm run typecheck`, not run.
 *
 * Each pair lists its differing fields exactly, in four groups (see parity.ts):
 * - conflicting: real data, as the spec describes it, that the hand-written type rejects
 * - looser: fields the hand-written type accepts more loosely, usually optional where the spec requires them
 * - missing: fields the spec has that the hand-written type does not declare
 * - handOnly: fields the hand-written type declares that the spec does not have
 *
 * When either side changes, the matching list stops being exact and the typecheck fails; update the
 * list to the new difference. The generated types can replace src/types.ts when every list is
 * `never`, or each remaining difference is one we choose to keep.
 */

import type * as Hand from '../../src/types.js';
import type { components } from '../generated/codepen-api-v2.js';
import type { Assert, Differences, Equals } from './parity.js';

type Gen = components['schemas'];
type GenError =
  | Gen['BadUserInputError']
  | Gen['UnauthenticatedError']
  | Gen['ForbiddenError']
  | Gen['NotFoundError']
  | Gen['ConflictError']
  | Gen['RateLimitedError']
  | Gen['InternalError']
  | Gen['BuildTimeoutError'];

// ── Enums ──────────────────────────────────────────────────────────────────────────────────

export type AccessParity = Assert<Equals<Hand.Access, Gen['PenAccess']>>;
export type BuildStatusParity = Assert<Equals<Hand.BuildStatus, Gen['Build']['status']>>;
export type RoleParity = Assert<Equals<Hand.Role, Gen['Role']>>;
export type ErrorCodeParity = Assert<Equals<Hand.ApiErrorCode, GenError['code']>>;

// ── Responses ──────────────────────────────────────────────────────────────────────────────

export type PenParity = Assert<
  Equals<
    Differences<Hand.Pen, Gen['Pen']>,
    {
      // Conflicts through Version.build, Build.patches and Patch.content.
      conflicting: 'saved_version';
      looser:
        | 'created_at'
        | 'deployment'
        | 'description'
        | 'editor'
        | 'password'
        | 'popularity'
        | 'screenshot_urls'
        | 'settings'
        | 'tags'
        | 'template'
        | 'updated_at'
        | 'urls';
      missing: 'build' | 'loves_count' | 'views_count';
      handOnly: never;
    }
  >
>;

export type VersionParity = Assert<
  Equals<
    Differences<Hand.Version, Gen['VersionDetail']>,
    {
      // Conflicts through Build.patches and Patch.content.
      conflicting: 'build';
      looser:
        'created_at' | 'deployed' | 'files' | 'hash' | 'label' | 'pen_id' | 'preview_url' | 'saved';
      missing: never;
      handOnly: never;
    }
  >
>;

export type BuildParity = Assert<
  Equals<
    Differences<Hand.Build, Gen['Build']>,
    {
      // Patch.content can be null in the spec.
      conflicting: 'applied_patches' | 'patches';
      looser:
        | 'diagnostics'
        | 'ended_at'
        | 'errors'
        | 'files'
        | 'next_id'
        | 'previous_id'
        | 'rounds'
        | 'started_at'
        | 'version_id';
      missing: never;
      handOnly: never;
    }
  >
>;

export type PatchParity = Assert<
  Equals<
    Differences<Hand.Patch, Gen['BuildPatch']>,
    {
      // The spec allows null content; the hand-written type allows only a string.
      conflicting: 'content';
      looser: 'file_id';
      missing: never;
      handOnly: never;
    }
  >
>;

export type DiagnosticParity = Assert<
  Equals<
    Differences<Hand.Diagnostic, Gen['BuildDiagnostic']>,
    {
      conflicting: never;
      looser: 'block_name' | 'code' | 'file_id' | 'path' | 'range' | 'url';
      missing: never;
      handOnly: never;
    }
  >
>;

export type PenFileParity = Assert<
  Equals<
    Differences<Hand.PenFile, Gen['File']>,
    {
      conflicting: never;
      looser:
        | 'bytes'
        | 'content'
        | 'content_hash'
        | 'content_type'
        | 'download_url'
        | 'is_binary'
        | 'name'
        | 'url';
      missing: never;
      handOnly: never;
    }
  >
>;

export type DeploymentParity = Assert<
  Equals<
    Differences<Hand.Deployment, Gen['Deployment']>,
    {
      conflicting: never;
      looser: 'created_at' | 'custom_domains' | 'updated_at' | 'url';
      missing: never;
      handOnly: never;
    }
  >
>;

export type PenSettingsParity = Assert<
  Equals<
    Differences<Hand.PenSettings, Gen['Settings']>,
    {
      conflicting: never;
      looser: 'auto_deploy' | 'auto_run' | 'auto_save' | 'indent_with' | 'tab_size';
      missing: never;
      handOnly: never;
    }
  >
>;

export type CollaboratorParity = Assert<
  Equals<
    Differences<Hand.Collaborator, Gen['Collaborator']>,
    {
      conflicting: never;
      looser: 'is_team_member' | 'name';
      missing: never;
      handOnly: never;
    }
  >
>;

export type InviteParity = Assert<
  Equals<
    Differences<Hand.Invite, Gen['CollaboratorInvite']>,
    {
      conflicting: never;
      looser: 'created_at' | 'email' | 'role' | 'username';
      missing: never;
      handOnly: never;
    }
  >
>;

export type CollectionParity = Assert<
  Equals<
    Differences<Hand.Collection, Gen['Collection']>,
    {
      conflicting: never;
      looser: 'access' | 'created_at' | 'description' | 'updated_at';
      missing: 'items_count' | 'popularity' | 'url';
      handOnly: never;
    }
  >
>;

export type AssetParity = Assert<
  Equals<
    Differences<Hand.Asset, Gen['AssetWithContent']>,
    {
      conflicting: never;
      looser: 'content' | 'created_at' | 'is_binary' | 'updated_at' | 'url';
      missing: never;
      handOnly: never;
    }
  >
>;

export type WriteResultParity = Assert<
  Equals<
    Differences<Hand.WriteResult, Gen['FilesWriteResult']>,
    {
      // All three conflict through Patch.content and Diagnostic.type.
      conflicting: 'build' | 'pen' | 'version';
      looser: never;
      missing: never;
      handOnly: never;
    }
  >
>;

// Every error fits the hand-written body, which keeps the fields the CLI reads.
export type ErrorBodyParity = Assert<[GenError] extends [Hand.ApiErrorBody] ? true : false>;

export type PenDomainParity = Assert<
  Equals<
    Differences<Hand.PenDomain, Gen['PenDomain']>,
    { conflicting: never; looser: never; missing: never; handOnly: never }
  >
>;

export type DnsRecordParity = Assert<
  Equals<
    Differences<Hand.DnsRecord, Gen['DnsRecord']>,
    { conflicting: never; looser: never; missing: never; handOnly: never }
  >
>;

export type TrashItemParity = Assert<
  Equals<
    Differences<Hand.TrashItem, Gen['TrashItem']>,
    { conflicting: never; looser: never; missing: never; handOnly: never }
  >
>;

// ── Requests ───────────────────────────────────────────────────────────────────────────────

// Every documented file change fits the hand-written FileChange, which also accepts combinations
// the spec rejects (such as an id alone).
type GeneratedChangeFitsHand = Assert<[Gen['FileChange']] extends [Hand.FileChange] ? true : false>;
type HandChangeFitsGenerated = Assert<
  Equals<[Hand.FileChange] extends [Gen['FileChange']] ? true : false, false>
>;
export type FileChangeParity = [GeneratedChangeFitsHand, HandChangeFitsGenerated];

// Every documented hunk fits the hand-written FileEdit, which also accepts one with no file.
type GeneratedEditFitsHand = Assert<[Gen['FileEdit']] extends [Hand.FileEdit] ? true : false>;
type HandEditFitsGenerated = Assert<
  Equals<[Hand.FileEdit] extends [Gen['FileEdit']] ? true : false, false>
>;
export type FileEditParity = [GeneratedEditFitsHand, HandEditFitsGenerated];
