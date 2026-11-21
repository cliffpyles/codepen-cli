# Contributing

Thanks for helping build codepen-cli. This document covers the local setup, the conventions, and how we keep test coverage high.

## Setup

```bash
nvm use            # reads .nvmrc (Node 24); Node 22.12+ works
npm install
cp .env.example .env   # optional; add your CODEPEN_API_KEY for manual testing
```

`npm run dev` loads `.env` automatically through Node's `--env-file-if-exists` flag, so `npm run dev -- auth status` works with no further setup. The file is gitignored. Alternatively run `npm run dev -- auth login` once and skip `.env` entirely.

The project is ESM TypeScript. Use `import`/`export` everywhere and keep the `.js` extension on relative imports (NodeNext resolution needs it).

## Day-to-day commands

| Command                 | What it does                                                           |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run dev -- <args>` | Run the CLI from source via `tsx`, e.g. `npm run dev -- pens list`.    |
| `npm test`              | Run the Vitest suite once.                                             |
| `npm run test:watch`    | Re-run affected tests on save.                                         |
| `npm run test:coverage` | Run tests and enforce coverage thresholds; HTML report in `coverage/`. |
| `npm run typecheck`     | `tsc --noEmit` over source and tests.                                  |
| `npm run lint`          | ESLint with type-aware rules. `lint:fix` applies autofixes.            |
| `npm run format`        | Prettier. `format:check` only reports.                                 |
| `npm run check`         | Everything CI runs, in order.                                          |
| `npm run build`         | Emit `dist/` with declarations and source maps.                        |

Run `npm run check` before opening a pull request. CI runs the same steps on Node 22 and 24.

Workflow actions are pinned to commit SHAs with the version in a trailing comment. Dependabot updates both together; do not loosen a pin back to a tag.

## Project layout

```
src/
  cli.ts            # bin entry: wires stdout/stderr and sets the exit code (not unit tested)
  program.ts        # builds the commander program; `run()` returns an exit code
  index.ts          # public library exports
  types.ts          # API response shapes
  commands/         # one file per command group, registered onto the program
    context.ts      # injected dependencies (client, output, prompts, confirm)
    shared.ts       # option parsers, paging output, build summaries
    auth.ts pens.ts files.ts versions.ts collaborators.ts collections.ts assets.ts
  lib/
    client.ts       # fetch-based API client, pagination, error mapping
    config.ts       # key/URL resolution: flag > env > config file
    store.ts        # config file location, 0600 read/write/delete
    tty.ts          # hidden prompt, stdin reading, TTY detection
    errors.ts       # error classes and exit-code mapping
    output.ts       # table/JSON rendering
test/
  helpers.ts        # fakeFetch, jsonResponse, fixtures
  cli.test.ts       # end-to-end runs of the CLI in-process
  auth.test.ts      # auth commands against a temp config file
  <group>.test.ts   # one file per command group, using cliHarness
specs/                 # its own package; see API spec below
  codepen-api-v2.yaml  # the spec, built from upstream/ and overlays/; do not edit
  contract/            # contract tests against the live API (read-only)
  dist/                # built docs page and Postman collection (gitignored)
  endpoints/           # endpoint coverage of the CLI's client tests
  generated/           # TypeScript types generated from the spec; do not edit
  lib/changelog.ts     # describes how one copy of the official spec differs from the next
  lib/merge.ts         # applies the overlays, then flattens and closes the schemas
  lib/spec.ts          # loads, walks and validates the spec
  lib/postman.ts       # converts the spec to a Postman collection
  lib/upstream.ts      # where the official spec is published, and how a pull is judged
  overlays/            # what we add to the official spec; edit these
  redocly.yaml         # Redocly lint settings
  scripts/generate.ts  # writes the spec and generated/, or with --check reports them stale
  scripts/pull.ts      # saves the official spec to upstream/ and adds to its changelog
  scripts/postman.ts   # writes the Postman collection to dist/
  test/                # offline checks, type tests and type parity tests
  upstream/            # CodePen's official spec as published, YAML and JSON, and CHANGELOG.md; do not edit
  vendor/              # the official OpenAPI 3.1 meta-schema, unmodified
```

Unit tests live next to the module they cover (`foo.ts` → `foo.test.ts`). Cross-cutting tests live in `test/`.

## Testing philosophy

- **No real home directory in tests.** Point `CODEPEN_CONFIG_PATH` at a `mkdtemp` directory (see `test/auth.test.ts`) so tests never read or write your actual config file.
- **No network in tests.** Every HTTP interaction goes through an injected `fetch`. Use `fakeFetch` from `test/helpers.ts` and assert on the URL, method, headers and body it received.
- **Test the CLI the way users run it.** `run(argv, io)` executes the real commander program in-process and returns the exit code. Assert on stdout, stderr and the code.
- **Cover the error paths.** Every API error code has a test for the message and exit code it produces.
- **Coverage thresholds are enforced** in `vitest.config.ts` (90% statements/lines/functions, 85% branches). Raise them when the number comfortably exceeds the floor; never lower them to make a build pass.

### Adding a command

1. Add a client method in `src/lib/client.ts` with a unit test in `client.endpoints.test.ts` that pins the exact URL, method and payload.
2. Register the command in `src/commands/<group>.ts` using the injected `CommandContext`. Use the parsers in `shared.ts` for enums, booleans and paging, and `ctx.confirmOrAbort` for anything destructive.
3. Add cases to `test/<group>.test.ts` via `cliHarness` for the happy path, the `--json` path, and at least one failure.
4. Update the command table in `README.md`.

`specs/codepen-api-v2.yaml` describes every operation and is a good place to check request and response shapes. If the API has changed, updating the spec too is welcome but not required (see [API spec](#api-spec)).

### Manual testing

The suite never touches the network. To try a command against the real API, run it from source with your own key, and keep to read-only commands unless you are working on a Pen you created for the purpose:

```bash
npm run dev -- pens list --per-page 3
```

To check that the live API still matches the spec, run the [contract tests](#contract-tests). If a response has a field the spec does not list, or is missing one it requires, the spec is out of date. Updating it is optional; mentioning it in the pull request is enough.

## API spec

`specs/codepen-api-v2.yaml` describes CodePen's REST API v2 in OpenAPI 3.1: every operation, request and response, with examples. It is the reference for what the client sends and what the API answers, and it is meant for generating types, interactive docs and Postman collections, checking test coverage, and catching changes in the live API. It is not published to npm. GraphQL is out of scope.

It is built, not written by hand. CodePen publishes an [official spec](https://api.codepen.io/docs); we save unmodified copies of its YAML and JSON in `specs/upstream/` and keep our additions in `specs/overlays/`, so upstream stays the source of truth and every difference from it is in one reviewable place.

The spec gates releases, not merging. A pull request never has to wait for it, and the root `npm run check` and the CI workflow skip it, but nothing is released or published to npm until `npm run spec:gate` passes (see [Release gate](#release-gate)).

### Checking the spec

`specs/` is a separate private package with its own dependencies and lockfile, so installing or updating them never touches the CLI's. The root `typecheck`, `lint`, `format:check` and `test` scripts all skip it. Install once, then check:

```bash
npm --prefix specs ci
npm run spec:check
```

`spec:check` runs offline:

- **Golden-file test.** `specs/codepen-api-v2.yaml` and `specs/generated/codepen-api-v2.ts` must match what `upstream/` and `overlays/` build now.
- **Type tests.** `specs/` typechecks, including `test/generated-types.ts`, whose `@ts-expect-error` lines fail the typecheck if a spec edit weakens the generated types.
- **Type parity tests.** `test/type-parity.ts` lists, field by field, how each hand-written type in `src/types.ts` differs from its generated counterpart: fields where real data conflicts with the hand-written type, fields it types more loosely, and fields only one side has. A change to either side fails the typecheck until the list is updated, so a CLI change to `src/types.ts` can fail `spec:check`; updating the list is optional, like any spec work.
- **Lint.** [Redocly](https://redocly.com/docs/cli/)'s recommended rules pass, with the exceptions in `specs/redocly.yaml`.
- **Formatting.** `specs/` is formatted.
- **Spec validation.** The document is valid against the OpenAPI 3.1 meta-schema in `specs/vendor/` (copied unmodified from [spec.openapis.org](https://spec.openapis.org/oas/3.1/schema/2025-09-15), Apache-2.0). Every `$ref` resolves and every component is used. OperationIds are unique, and every operation has declared tags and path parameters that match its path.
- **Example validation.** Every example (request, response, parameter, header and schema) validates against its schema, with JSON Schema 2020-12 and format checking.
- **Upstream comparison.** `test/hybrid.test.ts` checks that the built spec has exactly upstream's operations, parameters, statuses and body types, and that every example is valid against upstream's schemas too, so the overlays can only narrow what upstream says.
- **Overlay checks.** Building fails if an overlay's target no longer exists upstream, so an upstream change cannot silently leave a refinement behind.
- **Endpoint coverage.** Runs the CLI's own client tests (`src/lib/client.test.ts` and `client.endpoints.test.ts`) unchanged, records every request their `fakeFetch` receives, and matches each to a spec operation by method and path template. It fails if an operation is never requested, or a request matches no operation. An operation upstream adds before the client calls it goes in `NOT_IN_CLIENT` in `specs/endpoints/coverage.ts`, which is empty today; remove the entry when the client gains it. A failing client test fails it too.

`npm --prefix specs run format` fixes formatting.

### Contract tests

The contract tests read your own Pens, Collections and Assets from the live API and check each response against both our spec and upstream's: its status, the headers the spec requires (such as `Link` on lists) and its body. Request paths are built from the spec's own path templates, so they test those too.

```bash
npm run spec:contract
```

They use the same key as the CLI (`$CODEPEN_API_KEY`, a root `.env`, or the file `codepen auth login` writes) and make about 21 requests, which count against your plan's limits. They are read-only: any request other than `GET` is refused before it is sent. IDs are found from your first page of each list, so an operation is skipped, not failed, when you have nothing to read it with (for example no Classic Pen, or no failed build in your first four 2.0 Pens).

They need the network and your key, so neither `spec:check` nor the Spec workflow runs them. Run them by hand when you change the spec or suspect the API has changed.

### API docs and Postman

Both are built from the spec into `specs/dist/`, which is not committed:

```bash
npm run spec:docs
npm run spec:postman
```

`spec:docs` writes `codepen-api-v2.html`, an interactive reference built by Redocly. It is a single file you can open in a browser; it loads its viewer script and fonts from the web.

`spec:postman` writes `codepen-api-v2.postman_collection.json` with Postman's own converter, the one the Postman app uses on import. Import that file in Postman (File → Import). The collection has one folder per tag and one request per operation, filled from the spec's examples, with the documented responses saved as examples. It sends your key as a Bearer token from a `bearerToken` variable that it does not define, so the key never ends up in the collection: set `bearerToken` in a Postman environment. Optional query parameters are listed but unticked. Requests send the first body type the spec lists, which is JSON; switch the body to form-data in Postman to upload binary files.

The collection includes every operation, writes and deletes too, and they act on your real work.

### Generated types

`specs/generated/codepen-api-v2.ts` holds TypeScript types for every path, operation and schema, generated by [openapi-typescript](https://openapi-ts.dev/) and formatted with the repo's Prettier settings. It is committed so changes to it show up in review. After changing `upstream/` or `overlays/`, regenerate and commit everything together:

```bash
npm --prefix specs run generate
```

The CLI does not use these types yet; `src/types.ts` stays hand-written until they are complete and stable. They live outside `src/` until then and will move there when they replace it. The type parity tests show how close that is: the generated types are ready to replace the hand-written ones when every difference they list is gone or is one we choose to keep.

The [Spec workflow](.github/workflows/spec.yml) runs `spec:check` on pushes and pull requests that touch `specs/`, so a problem shows up before it reaches a release. It is not a required check for merging.

### Updating from the official spec

CodePen does not version its spec: `info.version` is the API's major version, and there is no changelog or revision date. The only way to notice a change is to compare, so the [Spec drift workflow](.github/workflows/spec-drift.yml) does that every Monday and fails if the published spec differs from `specs/upstream/`. It never changes the repository. To bring a change in:

```bash
npm run spec:pull
npm --prefix specs run generate
npm run spec:check
npm run spec:contract
```

`spec:pull` fetches `https://api.codepen.io/openapi.yaml` and `openapi.json` and saves both byte for byte, only if what either says has changed (key order and formatting do not count). The build reads the YAML; the JSON is kept beside it, and the pull warns if the two say different things.

Each pull that saves a change adds a dated entry to [`specs/upstream/CHANGELOG.md`](specs/upstream/CHANGELOG.md): operations, parameters, responses, schemas, fields, required fields and enum values added or removed, then every other difference by location. CodePen publishes no changelog of its own, so this is the only history of the spec, and changes made between two pulls show up as one entry. Commit the changelog with the new copies.

The newest entry records a fingerprint of the copies it describes (`<!-- copies: … -->`), and `spec:check` fails if it no longer matches the files in `specs/upstream/`. Never edit either by hand: run `spec:pull`, or restore `upstream/` with git.

Review the changelog and the diff of the built spec. If `generate` fails, an overlay's target has moved or gone: change the overlay to match.

### Release gate

`npm run spec:gate` is the compliance check for a release. It passes only if:

- **Our spec complies.** `spec:check` passes in full: the built spec matches `upstream/` and `overlays/`, narrows upstream without contradicting it, validates, and covers every operation the client calls.
- **Changes are communicated.** The newest entry of `specs/upstream/CHANGELOG.md` describes the saved copies.
- **Our copy is the latest.** CodePen's published YAML and JSON say the same as `specs/upstream/`. This step needs the network.

It runs in two places, so neither a release nor a publish can slip past it. In `.github/workflows/release.yml`, the `release` job, which tags and creates the GitHub release, waits for the `spec-gate` job, so nothing is tagged while it fails. And `prepublishOnly` runs it again before `npm publish`, against the tagged commit, which also covers a publish from your own machine. Keeping the release pull request up to date is never gated.

#### Skipping the gate

Some releases cannot wait for the spec, such as a security fix while CodePen's spec has changed or `api.codepen.io` is down. Skipping always takes a reason, and it is recorded:

- **In CI.** Merge the release pull request as usual; the gate fails and nothing is tagged. Then run the Release workflow by hand (Actions → Release → Run workflow, on `main`) with **Skip the spec gate** ticked and a reason. It tags, creates the GitHub release and publishes, and the run's summary records who skipped the gate and why. Anyone with write access can do this.
- **From your machine.** `SKIP_SPEC_GATE="<reason>" npm publish` skips the gate in `prepublishOnly` and prints the reason. The rest of `prepublishOnly` (clean, check, build) still runs.

Bring the spec up to date in a later release, so the next one passes the gate again.

When CodePen changes its spec, releases stop until someone brings the change in: `npm run spec:pull`, `npm --prefix specs run generate`, review, commit. CI never pulls or commits for you. The [contract tests](#contract-tests) are not part of the gate, because they need an API key; run them by hand when you pull.

### Changing the spec

- **Edit the overlays, never the built spec or `upstream/`.** `overlays/refinements.yaml` holds our changes and `overlays/examples.yaml` our examples, in [OpenAPI Overlay](https://spec.openapis.org/overlay/v1.0.0.html) form. Targets are plain paths such as `$.components.schemas.Pen`, with no wildcards. An update merges objects; to replace an array, `remove` it first.
- **Only narrow.** An overlay adds detail or tightens a rule, and never contradicts upstream. If upstream is wrong about the live API, report it to CodePen and record the difference, rather than widening a schema here.
- **Keep overlays small.** Restructuring is what makes them fragile, so add a separate schema only where it changes what a caller can rely on, such as `PenWithBuild`. Model each documented form of a request as its own schema so generated types can follow it.
- **Closed on purpose.** The build closes every object under `components/schemas`, after flattening `allOf`, so a change in the live API fails the contract tests instead of passing silently. It does not affect the CLI at runtime. An object that really is open sets `additionalProperties` itself.
- **Keeping it in step.** When a client change follows a change in the API, pull the official spec in the same pull request if it has the change. This helps, but is not required.

## Style

Prettier formats; ESLint catches the rest. Prefer small pure functions that take their dependencies as arguments, so they can be tested without mocking modules.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<optional body explaining why, not what>
```

- **type**: `feat`, `fix`, `docs`, `test`, `build`, `ci`, `chore`, `refactor`, `perf`, `style`.
- **scope** (optional): the area touched, e.g. `cli`, `client`, `config`, `pens`, `spec`, `deps`.
- **summary**: imperative, lower case, no trailing period, under 72 characters.

Each commit should leave `npm run check` passing. Keep tooling, source, tests and docs in separate commits when they are independent so history stays easy to bisect and review.

Changes that touch only `specs/` are `docs(spec)`. The spec is not published, so a `feat` or `fix` there would cut a release that changes nothing for users.

## Releasing

Releases are automated from Conventional Commits.

1. Merge work into `main`. [release-please](https://github.com/googleapis/release-please) keeps a "chore(main): release x.y.z" pull request open that bumps `package.json` and `package-lock.json` and updates `CHANGELOG.md` from the commit history. `feat` bumps the minor version, `fix` the patch, and a `!` or `BREAKING CHANGE:` footer the major.
2. Merge that pull request. Once the [spec gate](#release-gate) passes, release-please tags the merge (`vX.Y.Z`) and creates a GitHub release.
3. The `publish` job in `.github/workflows/release.yml` checks out the tag and runs `npm publish --provenance`. `prepublishOnly` cleans, runs the full check, runs the [spec gate](#release-gate) and builds first, so a red check blocks the publish.

Only merging the release pull request releases anything. Every push to `main`, whether you push directly or merge a pull request, runs the Release workflow: its `release-pr` job opens or updates the release pull request, and its `release` job tags and publishes only when the push is that pull request's merge. Tagging and publishing wait for the [spec gate](#release-gate); updating the release pull request does not.

The CLI reads its version from `package.json` at runtime (`src/version.ts`), so there is nothing else to bump by hand.

One-time setup for the repository:

- On npmjs.com, add a trusted publisher for the `codepen-cli` package pointing at `cliffpyles/codepen-cli`, workflow `release.yml`, environment `npm`. No token is stored in GitHub.
- In the GitHub repository settings, create an environment named `npm`, and under Actions → General enable "Allow GitHub Actions to create and approve pull requests" so release-please can open its pull request.
- Pull requests opened with the default `GITHUB_TOKEN` do not trigger the CI workflow. If you want CI on the release pull request, give release-please a personal access token via the `token` input.
