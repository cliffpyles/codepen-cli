# Contributing

Thanks for helping build codepen-cli. This document covers the local setup, the conventions, and how we keep test coverage high.

## Setup

```bash
nvm use            # reads .nvmrc (Node 24); Node 20+ works
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

Run `npm run check` before opening a pull request. CI runs the same steps on Node 20, 22 and 24.

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

### Live checks

The suite never touches the network. To try a command against the real API, run it from source with your own key, and keep to read-only commands unless you are working on a Pen you created for the purpose:

```bash
npm run dev -- pens list --per-page 3
```

## Style

Prettier formats; ESLint catches the rest. Prefer small pure functions that take their dependencies as arguments, so they can be tested without mocking modules.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<optional body explaining why, not what>
```

- **type**: `feat`, `fix`, `docs`, `test`, `build`, `ci`, `chore`, `refactor`, `perf`, `style`.
- **scope** (optional): the area touched, e.g. `cli`, `client`, `config`, `pens`, `deps`.
- **summary**: imperative, lower case, no trailing period, under 72 characters.

Each commit should leave `npm run check` passing. Keep tooling, source, tests and docs in separate commits when they are independent so history stays easy to bisect and review.

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
