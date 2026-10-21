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

// ── Enums ──────────────────────────────────────────────────────────────────────────────────

export type AccessParity = Assert<Equals<Hand.Access, Gen['PenAccess']>>;
export type BuildStatusParity = Assert<Equals<Hand.BuildStatus, Gen['BuildStatus']>>;
export type RoleParity = Assert<Equals<Hand.Role, Gen['Role']>>;
export type ErrorCodeParity = Assert<Equals<Hand.ApiErrorCode, Gen['ErrorCode']>>;

// ── Responses ──────────────────────────────────────────────────────────────────────────────

export type PenParity = Assert<
  Equals<
    Differences<Hand.Pen, Gen['Pen']>,
    {
      // Conflicts through Version.build, Build.patches and Patch.content.
      conflicting: 'saved_version';
      looser:
        | 'description'
        | 'tags'
        | 'password'
        | 'template'
        | 'popularity'
        | 'editor'
        | 'created_at'
        | 'updated_at'
        | 'urls'
        | 'screenshot_urls'
        | 'deployment'
        | 'settings';
      missing: 'loves_count' | 'views_count';
      handOnly: never;
    }
  >
>;

export type VersionParity = Assert<
  Equals<
    Differences<Hand.Version, Gen['Version']>,
    {
      // Conflicts through Build.patches and Patch.content.
      conflicting: 'build';
      looser: 'pen_id' | 'hash' | 'created_at' | 'deployed' | 'preview_url';
      missing: never;
      // The hand-written Version also stands in for VersionDetail, which has files.
      handOnly: 'files';
    }
  >
>;

export type BuildParity = Assert<
  Equals<
    Differences<Hand.Build, Gen['BuildDetail']>,
    {
      // Patch.content can be null in the spec.
      conflicting: 'applied_patches' | 'patches';
      looser:
        | 'started_at'
        | 'ended_at'
        | 'rounds'
        | 'diagnostics'
        | 'errors'
        | 'files'
        | 'version_id'
        | 'next_id'
        | 'previous_id';
      missing: never;
      handOnly: never;
    }
  >
>;

export type PatchParity = Assert<
  Equals<
    Differences<Hand.Patch, Gen['Patch']>,
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
    Differences<Hand.Diagnostic, Gen['Diagnostic']>,
    {
      conflicting: never;
      looser: 'code' | 'url' | 'block_name' | 'path' | 'file_id' | 'range';
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
      looser: 'name' | 'content_hash' | 'is_binary' | 'content' | 'url';
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
      looser: 'url' | 'custom_domains' | 'created_at' | 'updated_at';
      missing: never;
      handOnly: never;
    }
  >
>;

export type PenSettingsParity = Assert<
  Equals<
    Differences<Hand.PenSettings, Gen['PenSettings']>,
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
      looser: 'name' | 'is_team_member';
      missing: never;
      handOnly: never;
    }
  >
>;

export type InviteParity = Assert<
  Equals<
    Differences<Hand.Invite, Gen['Invite']>,
    {
      conflicting: never;
      // role: the hand-written type allows Owner, which an invite cannot have.
      looser: 'email' | 'username' | 'role' | 'created_at';
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
      // access: the hand-written type allows the Pen-only Protected and Collaborators.
      looser: 'description' | 'access' | 'created_at' | 'updated_at';
      // The hand-written type reads these through its index signature as unknown.
      missing: 'items_count' | 'popularity' | 'url';
      handOnly: never;
    }
  >
>;

export type AssetParity = Assert<
  Equals<
    Differences<Hand.Asset, Gen['AssetDetail']>,
    {
      conflicting: never;
      looser: 'url' | 'is_binary' | 'content' | 'created_at' | 'updated_at';
      missing: never;
      handOnly: never;
    }
  >
>;

export type WriteResultParity = Assert<
  Equals<
    Differences<Hand.WriteResult, Gen['WriteResult']>,
    {
      // All three conflict through Patch.content.
      conflicting: 'pen' | 'version' | 'build';
      looser: never;
      missing: never;
      handOnly: never;
    }
  >
>;

export type ErrorBodyParity = Assert<
  Equals<
    Differences<Hand.ApiErrorBody, Gen['Error']>,
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
