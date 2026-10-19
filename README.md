# codepen-cli

A command-line interface for the [CodePen API v2](https://blog.codepen.io/docs/api/api-v2/). Manage your Pens, their files, Collections, and Assets from the terminal, and script against CodePen with `--json` output.

> **Status:** early development. The command surface below marks what is implemented and what is planned. The API itself launched in October 2026, so expect changes.

## Install

```bash
npm install -g codepen-cli
```

Requires Node.js 20 or newer. Run one-off with `npx codepen-cli --help`.

## Authentication

1. Generate a key at [codepen.io/settings/api](https://codepen.io/settings/api). Personal keys start with `cp_user_`, Team keys with `cp_team_`.
2. Export it:

```bash
export CODEPEN_API_KEY=cp_user_your_key_here
```

You can also pass `--api-key <key>` on any command. The key only ever reaches `https://api.codepen.io` (or whatever you set in `CODEPEN_API_URL` / `--api-url`).

A personal key sees your own work. A Team key sees that Team's work. Other people's Pens return `404` even when public.

## Usage

```bash
codepen --help
codepen pens list
codepen pens list --tag css --tag svg --per-page 50
codepen pens list --json | jq '.[].id'
codepen pens get <id>
```

Global options:

| Option            | Description                                         |
| ----------------- | --------------------------------------------------- |
| `--api-key <key>` | API key. Defaults to `$CODEPEN_API_KEY`.            |
| `--api-url <url>` | API base URL. Defaults to `https://api.codepen.io`. |
| `--json`          | Print raw JSON from the API instead of a table.     |
| `-v, --version`   | Print the version.                                  |

### Commands

| Command                                      | Status   | Notes                                             |
| -------------------------------------------- | -------- | ------------------------------------------------- |
| `pens list`                                  | done     | Filters: `--access`, `--tag`, `--search`, paging. |
| `pens get <id>`                              | done     |                                                   |
| `pens create` / `fork` / `update` / `delete` | planned  |                                                   |
| `pens files list                             | get      | put                                               | delete` | planned | Writes build the Pen; see `--wait`. |
| `pens versions list                          | restore` | planned                                           |         |
| `pens deploy` / `undeploy`                   | planned  |                                                   |
| `pens collaborators ...`                     | planned  |                                                   |
| `collections ...`                            | planned  | List, create, update, delete, add/remove Pens.    |
| `assets ...`                                 | planned  | List, upload, rename, replace, delete.            |

### Exit codes

Scripts can branch on the exit code. Error messages go to stderr; data goes to stdout.

| Code | Meaning                                               |
| ---- | ----------------------------------------------------- |
| 0    | Success                                               |
| 1    | Generic failure, including `FORBIDDEN` and `CONFLICT` |
| 64   | Bad input (`BAD_USER_INPUT` or usage error)           |
| 66   | Not found                                             |
| 75   | Rate limited. Retry after the hour or day resets.     |
| 77   | Unauthenticated                                       |
| 78   | Configuration problem, such as a missing API key      |

### API limits to know about

| Plan | Requests   | Reads      | Creates per day            |
| ---- | ---------- | ---------- | -------------------------- |
| Free | 100/hour   | 1,000/day  | 3 Pens and 3 Collections   |
| PRO  | 3,000/hour | 10,000/day | 50 Pens and 50 Collections |

Non-public access levels and Team keys require PRO. Classic Pens are readable but cannot be modified through the API.

## Use as a library

The package also exports a small typed client:

```ts
import { CodePenClient, resolveConfig } from 'codepen-cli';

const client = new CodePenClient(resolveConfig());
const { items, links } = await client.listPens({ per_page: 10 });
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow. The short version:

```bash
npm install
npm run dev -- pens list     # run from source with tsx
npm test                     # vitest, single run
npm run test:watch           # vitest in watch mode
npm run check                # typecheck + lint + format + tests with coverage
```

## License

[MIT](LICENSE)
