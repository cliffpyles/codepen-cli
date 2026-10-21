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
  codepen-api-v2.yaml  # OpenAPI description of the REST API v2
  lib/spec.ts          # loads, walks and validates the spec
  test/                # offline checks of the spec
  vendor/              # the official OpenAPI 3.2 meta-schema, unmodified
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

### Live checks

The suite never touches the network. To try a command against the real API, run it from source with your own key, and keep to read-only commands unless you are working on a Pen you created for the purpose:

```bash
npm run dev -- pens list --per-page 3
```

If a live response has a field the spec does not list, or is missing one it requires, the spec is out of date. Updating it is optional; mentioning it in the pull request is enough.

## API spec

`specs/codepen-api-v2.yaml` describes CodePen's REST API v2 in OpenAPI 3.2: every operation, request and response, with examples. It is the reference for what the client sends and what the API answers, and it is meant for generating types, interactive docs and Postman collections, checking test coverage, and catching changes in the live API. It is not published to npm. GraphQL is out of scope.

For now the spec is optional. Nothing in `npm run check`, CI or the release process depends on it, and a CLI change never has to wait for it. That will change once the CLI's types are generated from it.

### Checking the spec

`specs/` is a separate private package with its own dependencies and lockfile, so installing or updating them never touches the CLI's. The root `typecheck`, `lint`, `format:check` and `test` scripts all skip it. Install once, then check:

```bash
npm --prefix specs ci
npm run spec:check
```

`spec:check` runs offline in a few seconds. It typechecks and formats `specs/`, then checks that:

- the document is valid against the OpenAPI 3.2 meta-schema in `specs/vendor/` (copied unmodified from [spec.openapis.org](https://spec.openapis.org/oas/3.2/schema/2025-09-17), Apache-2.0)
- every `$ref` resolves and every component is used
- operationIds are unique, and every operation has declared tags and path parameters that match its path
- every example (request, response, parameter, header and schema) validates against its schema, with JSON Schema 2020-12 and format checking

`npm --prefix specs run format` fixes formatting.

### Writing the spec

- **Sources.** It is written from CodePen's [API v2](https://blog.codepen.io/docs/api/api-v2/) and [REST API v2](https://blog.codepen.io/docs/api/api-v2/rest-api-v2/) docs pages. `info.version` is the date of the newest docs revision it was written from, not a semver; update it when you bring in a newer revision.
- **3.1-compatible.** Use only features that also exist in OpenAPI 3.1, so a tool that stops at 3.1 can read the file by changing the `openapi:` line to `3.1.1`.
- **No duplication.** Every shape is defined once under `components` and reused with `$ref`. Shared fields live in open `*Base`, `*Fields` and `*Input` schemas; the final shapes combine them with `allOf` and close with `unevaluatedProperties: false`. Example objects are written once under `components/examples` and reused with YAML anchors and aliases, each anchor before its aliases.
- **Closed on purpose.** Response schemas reject unknown fields, so a change in the live API fails validation instead of passing silently. Request schemas are closed too, so a misspelled key is caught even though the server ignores it. When the API and the spec disagree, change the spec to match the API instead of loosening a schema.
- **Evidence extensions.** Fields the docs do not cover, or have not been seen in a live response, carry an `x-codepen-*` extension. The meaning of each is listed under "Specification extensions" in the spec's `info.description`.
- **Keeping it in step.** When a client change follows a change in the API, updating the spec in the same pull request helps, but is not required.

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
2. Merge that pull request. release-please tags the commit (`vX.Y.Z`) and creates a GitHub release.
3. The `publish` job in `.github/workflows/release.yml` checks out the tag and runs `npm publish --provenance`. `prepublishOnly` cleans, runs the full check and builds first, so a red check blocks the publish.

The CLI reads its version from `package.json` at runtime (`src/version.ts`), so there is nothing else to bump by hand.

One-time setup for the repository:

- On npmjs.com, add a trusted publisher for the `codepen-cli` package pointing at `cliffpyles/codepen-cli`, workflow `release.yml`, environment `npm`. No token is stored in GitHub.
- In the GitHub repository settings, create an environment named `npm`, and under Actions → General enable "Allow GitHub Actions to create and approve pull requests" so release-please can open its pull request.
- Pull requests opened with the default `GITHUB_TOKEN` do not trigger the CI workflow. If you want CI on the release pull request, give release-please a personal access token via the `token` input.
