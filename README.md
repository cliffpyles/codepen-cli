# codepen-cli

A command-line interface for the [CodePen API v2](https://blog.codepen.io/docs/api/api-v2/). Manage your Pens, their files, Collections, and Assets from the terminal, and script against CodePen with `--json` output.

> **Status:** early development. The command surface below marks what is implemented and what is planned. The API itself launched in October 2026, so expect changes.

## Install

```bash
npm install -g codepen-cli
```

Requires Node.js 22.12 or newer. Run one-off with `npx codepen-cli --help`.

## Authentication

Generate a key at [codepen.io/settings/api](https://codepen.io/settings/api). Personal keys start with `cp_user_`, Team keys with `cp_team_`. Then store it:

```bash
codepen auth login
```

The prompt hides what you paste. The key is written to a config file that only your user can read (mode `0600`):

| Platform      | Location                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| macOS / Linux | `$XDG_CONFIG_HOME/codepen/config.json`, else `~/.config/codepen/config.json` |
| Windows       | `%APPDATA%\codepen\config.json`                                              |
| Any           | `$CODEPEN_CONFIG_PATH`, when set                                             |

Check what is active and that the API accepts it:

```bash
codepen auth status
```

Remove the stored key with `codepen auth logout`.

### Other ways to supply the key

The CLI looks for a key in this order and uses the first one it finds:

1. `--api-key <key>` on the command line. Handy for scripts, but the key ends up in shell history, so avoid it interactively.
2. The `CODEPEN_API_KEY` environment variable. Best for CI and secret managers. Pipe one into the config file with `codepen auth login --with-token < key.txt`.
3. The config file written by `auth login`.

The key only ever reaches `https://api.codepen.io`, or whatever you set in `CODEPEN_API_URL` / `--api-url`. A personal key sees your own work. A Team key sees that Team's work. Other people's Pens return `404` even when public.

## Usage

```bash
codepen --help
codepen pens list --tag css --sort updated
codepen pens list --json | jq '.[].id'
codepen pens get <id>
codepen pens create --title "Hello" --file index.html --file src/main.css=style.css
codepen pens files put <id> index.html --wait 0
codepen pens files apply <id> changes.json --expected-version <version>
codepen pens deploy <id>
codepen collections add <collection> <pen>
codepen assets upload ./logo.png
```

Every command takes `--json` for raw API output. Listing commands take `--page` and `--per-page` (max 100) and print a `More results: --page N` hint on stderr when there is another page. Commands that trash or delete something ask for confirmation; pass `-y` / `--yes` in scripts, and they refuse to run without it when there is no terminal.

Global options:

| Option            | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `--api-key <key>` | API key. Defaults to `$CODEPEN_API_KEY`, then the config file. |
| `--api-url <url>` | API base URL. Defaults to `https://api.codepen.io`.            |
| `--json`          | Print raw JSON from the API instead of a table.                |
| `-v, --version`   | Print the version.                                             |

### Commands

| Command                                                                  | Notes                                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `auth login` / `status` / `logout`                                       | Store, inspect and remove the API key. See [Authentication](#authentication).                                                        |
| `pens list`                                                              | Filters: `--access`, `--tag`, `--search`, `--deployed`, `--template`, `--forks`, `--editor`, `--sort`, `--direction`.                |
| `pens get <id>`                                                          | Key/value record with editor and preview URLs.                                                                                       |
| `pens create`                                                            | `--title`, `--description`, `--tag`, `--access`, `--password`, `--template`, `--file local[=pen/path]` (repeatable). Builds the Pen. |
| `pens update <id>`                                                       | Same metadata flags as create.                                                                                                       |
| `pens delete <id>`                                                       | Moves to the trash; restorable on codepen.io for 3 days.                                                                             |
| `pens fork <id>`                                                         | Copies a 2.0 Pen, with optional metadata overrides. Builds the copy.                                                                 |
| `pens settings <id>`                                                     | `--auto-deploy`, `--auto-run`, `--auto-save`, `--indent-with`, `--tab-size`.                                                         |
| `pens files list <pen>`                                                  | Files in the saved head, with IDs and content hashes.                                                                                |
| `pens files get <pen> <path>`                                            | Prints text, or saves with `-o`. Binary files need `-o` and come from the saved version's preview host.                              |
| `pens files put <pen> <path>`                                            | From a local file (default `./<path>`), `--from`, `--content` or `--stdin`. Binary data goes multipart.                              |
| `pens files apply <pen> <changes.json>`                                  | Several writes, moves and deletes as one version. `-` reads stdin.                                                                   |
| `pens files delete <pen> <path>`                                         | Deletes a file, or everything under a directory.                                                                                     |
| `pens versions list <pen>` / `get <version>`                             | Browse saved versions. `get` includes file paths and build status.                                                                   |
| `pens versions restore <pen> <version>`                                  | Copies an older version to the head without building.                                                                                |
| `pens builds get <build>`                                                | Status, diagnostics, patches and compiled files. `--follow` polls until settled.                                                     |
| `pens deploy <pen>` / `undeploy <pen>`                                   | Deploy the head or `--version-id <id>`; take it down.                                                                                |
| `pens collaborators list` / `invite` / `set-role` / `remove` / `invites` | Roles are `Editor` or `Viewer`.                                                                                                      |
| `collections list` / `get` / `create` / `update` / `delete`              | Collection metadata.                                                                                                                 |
| `collections pens <id>` / `add <id> <pen>` / `remove <id> <pen>`         | Membership.                                                                                                                          |
| `assets list` / `get` / `upload` / `update` / `delete`                   | `get -o` downloads; `upload` and `update --from` detect binaries.                                                                    |

### Writes and builds

Every file write on a 2.0 Pen saves a new version and starts a build. Write commands accept:

- `--wait <seconds>`: how long the API itself waits for the build (0 to 75, server default 45).
- `--expected-version <id>`: refuse the write with `CONFLICT` (HTTP 409) if someone else saved first. Take the ID from the previous write's output or `pens versions list`.
- `--no-follow`: return as soon as the API does instead of polling an unfinished build.

The CLI prints the build result on stderr. A `Failed` build means the files were saved but do not compile; the command exits non-zero and lists the diagnostics. A `Canceled` build with a follow-up version is followed automatically. Classic Pens are readable but cannot be modified through the API.

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
