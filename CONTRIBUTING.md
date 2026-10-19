# Contributing

Thanks for helping build codepen-cli. This document covers the local setup, the conventions, and how we keep test coverage high.

## Setup

```bash
nvm use            # reads .nvmrc (Node 24); Node 20+ works
npm install
cp .env.example .env   # optional; add your CODEPEN_API_KEY for manual testing
```

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

## Project layout

```
src/
  cli.ts            # bin entry: wires stdout/stderr and sets the exit code (not unit tested)
  program.ts        # builds the commander program; `run()` returns an exit code
  index.ts          # public library exports
  types.ts          # API response shapes
  commands/         # one file per command group, registered onto the program
    context.ts      # injected dependencies (client, output, format)
  lib/
    client.ts       # fetch-based API client, pagination, error mapping
    config.ts       # key/URL resolution from flags and env
    errors.ts       # error classes and exit-code mapping
    output.ts       # table/JSON rendering
test/
  helpers.ts        # fakeFetch, jsonResponse, fixtures
  cli.test.ts       # end-to-end runs of the CLI in-process
```

Unit tests live next to the module they cover (`foo.ts` → `foo.test.ts`). Cross-cutting tests live in `test/`.

## Testing philosophy

- **No network in tests.** Every HTTP interaction goes through an injected `fetch`. Use `fakeFetch` from `test/helpers.ts` and assert on the URL, method, headers and body it received.
- **Test the CLI the way users run it.** `run(argv, io)` executes the real commander program in-process and returns the exit code. Assert on stdout, stderr and the code.
- **Cover the error paths.** Every API error code has a test for the message and exit code it produces.
- **Coverage thresholds are enforced** in `vitest.config.ts` (90% statements/lines/functions, 85% branches). Raise them when the number comfortably exceeds the floor; never lower them to make a build pass.

### Adding a command

1. Add a client method in `src/lib/client.ts` with a unit test that pins the exact URL and payload.
2. Register the command in `src/commands/<group>.ts` using the injected `CommandContext`.
3. Add a `test/cli.test.ts` case for the happy path, the `--json` path, and at least one failure.
4. Update the command table in `README.md`.

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

`npm publish` runs `prepublishOnly`, which cleans, runs the full check, and builds. Bump the version in `package.json` and the `.version()` call in `src/program.ts` together.
