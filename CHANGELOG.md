# Changelog

## [2.1.0](https://github.com/cliffpyles/codepen-cli/compare/v2.0.0...v2.1.0) (2026-10-19)


### Features

* **cli:** add --sort and --direction to collections, versions and assets lists ([6c53dcd](https://github.com/cliffpyles/codepen-cli/commit/6c53dcd8ab857c2761447472f7498c41f2ca0183))
* **client:** send binary files multipart on pen create and bulk file writes ([9454461](https://github.com/cliffpyles/codepen-cli/commit/9454461a85334cb265f68856ae44f7ea41c182f8))
* **pens:** upload binary files with pens create --file and pens files apply --file ([6005eef](https://github.com/cliffpyles/codepen-cli/commit/6005eef74a9cd0618ee373425395d72d78a238d6))

## [2.0.0](https://github.com/cliffpyles/codepen-cli/compare/v1.1.0...v2.0.0) (2026-10-19)


### ⚠ BREAKING CHANGES

* Node.js 22.12 or newer is required; Node 20 is no longer supported.

### Bug Fixes

* build upload blobs so they typecheck under @types/node 26 ([15f245a](https://github.com/cliffpyles/codepen-cli/commit/15f245a2f93eae4ca6576fd988518a0591cd6f3c))


### Build System

* require Node.js 22.12 or newer ([83b5c0e](https://github.com/cliffpyles/codepen-cli/commit/83b5c0ed16ae692661b8ff77a771c38e348cb1bb))

## 1.1.0 (2026-10-19)


### Features

* **assets:** add list, get, upload, update and delete commands ([48772b9](https://github.com/cliffpyles/codepen-cli/commit/48772b956d5476eb0a2e54801c93066cb76572c1))
* **auth:** add auth login, status and logout commands ([54e9bbe](https://github.com/cliffpyles/codepen-cli/commit/54e9bbe42c3c92b0f1d63339fbfdcaa858958ca8))
* **cli:** add commander program with pens list and get commands ([8a88270](https://github.com/cliffpyles/codepen-cli/commit/8a88270bfefceba49ecdfda4232e4d12e565b8a0))
* **cli:** add shared option parsers, paging output and build reporting ([eea21e4](https://github.com/cliffpyles/codepen-cli/commit/eea21e48cdfdaebfaeb8eff467af38465860173a))
* **client:** add fetch-based CodePen API v2 client ([b275510](https://github.com/cliffpyles/codepen-cli/commit/b2755109e87962439f8ea4426960b452ebae949b))
* **client:** cover every REST v2 endpoint ([916543f](https://github.com/cliffpyles/codepen-cli/commit/916543f56dc0baaa2c55a3efdb0d4c10d10b4492))
* **collaborators:** add list, invite, set-role, remove and invites commands ([43a9191](https://github.com/cliffpyles/codepen-cli/commit/43a919116288e1d1eab43d73d383a9d7956ed58f))
* **collections:** add list, get, create, update, delete, pens, add and remove commands ([8583dae](https://github.com/cliffpyles/codepen-cli/commit/8583dae67035a288a27afcee3d9a47d5c490fdd3))
* **config:** resolve API key and base URL from flags and environment ([d636d73](https://github.com/cliffpyles/codepen-cli/commit/d636d730dfdadc97fcdd466e1ca22eb0b8e7c196))
* **config:** resolve the API key from flag, then env, then config file ([045592d](https://github.com/cliffpyles/codepen-cli/commit/045592d8d15bbb03cd63da31ea55d1d9d54f50c2))
* **files:** add pens files list, get, put, apply and delete commands ([2d9c837](https://github.com/cliffpyles/codepen-cli/commit/2d9c8377bf5d5e1eca9a23fcb841da58142d7837))
* **output:** add key/value record renderer for single objects ([3e3f649](https://github.com/cliffpyles/codepen-cli/commit/3e3f649b8a13dcf1fe2e05397c5721c4cc94e3c9))
* **output:** add table and JSON renderers ([7d3d182](https://github.com/cliffpyles/codepen-cli/commit/7d3d18259920070ae31ca17f9a8fd21d256d3124))
* **pens:** add create, update, delete, fork and settings commands ([e18f725](https://github.com/cliffpyles/codepen-cli/commit/e18f7253a73811c05a6b90dcfe684c87a4f2335c))
* **store:** add config file store with owner-only permissions ([2b1db35](https://github.com/cliffpyles/codepen-cli/commit/2b1db3553733b3ee32c9ac86afb64c89770d14d8))
* **tty:** add confirm prompt and confirmOrAbort guard for destructive commands ([6a32298](https://github.com/cliffpyles/codepen-cli/commit/6a32298d1c922f9b41a9134d33c3c2628c1e5eed))
* **tty:** add hidden secret prompt and stdin helpers ([752e8b0](https://github.com/cliffpyles/codepen-cli/commit/752e8b0412c62f3fe93a9fa7f418ab3440328a02))
* **types:** model the full API v2 surface ([c4cac2a](https://github.com/cliffpyles/codepen-cli/commit/c4cac2a866143b981cf3c5b551103b5e3ba99a14))
* **versions:** add versions list/get/restore, builds get, deploy and undeploy ([5ef0225](https://github.com/cliffpyles/codepen-cli/commit/5ef0225845be6f4dfd7cddef6b54090a23863a49))


### Bug Fixes

* **files:** download binaries from the version preview host ([ee7148c](https://github.com/cliffpyles/codepen-cli/commit/ee7148c5ed5f4ce236a75fdf20ee62bc0799fb4b))


### Miscellaneous Chores

* make the first real release 1.1.0 ([a293234](https://github.com/cliffpyles/codepen-cli/commit/a293234c2999bbe8600fe8df45a83adf0a18d449))
