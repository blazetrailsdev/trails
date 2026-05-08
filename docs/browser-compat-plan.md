# Browser Compatibility Plan

This document codifies the portability policy for the trails monorepo so each
new package doesn't rediscover it. It also tracks the migration from the
current ad-hoc state to a fully enforced baseline.

## 1. Principles

**Native deps are never imported eagerly from any package barrel/index.**
`node:fs`, `node:path`, `node:crypto`, `pg`, `mysql2`, `better-sqlite3` are
all server-only. Eagerly bundling them into a barrel causes tree-shakers to
leave them in browser builds even when the feature is unused. Lint rules and
browser-bundle CI (added in BC-4) enforce this.

**Database adapters opt in via registry, not eager import.**
Apps that use PostgreSQL import `@blazetrails/activerecord/adapters/postgresql`,
MySQL import `@blazetrails/activerecord/adapters/mysql2`, SQLite import
`@blazetrails/activerecord/adapters/sqlite3`. Core activerecord has zero top-level imports of
adapter packages. The goal is _PG-not-bundled-when-unused_, not
_PG-in-the-browser_.

**Env vars are accessed through `getEnv()` in activesupport.**
Direct `process.env` reads break in environments that lack `process`
(browsers, Deno, Bun edge runtimes). All env reads go through `getEnv(key,
defaultValue?)`, which falls back gracefully. The single canonical name for
the application environment is `TRAILS_ENV` — see §2 for the rationale.

**Each package owns a one-line portability status** (the matrix in §4).
New packages must declare their status before merging.

## 2. Existing plumbing

### activesupport adapter pattern

`packages/activesupport/src` already ships `fsAdapter`, `pathAdapter`,
`cryptoAdapter` (and others — see [activesupport.md](activesupport.md) §Adapters).
Twenty files across activerecord use `getFs()` / `getPath()` / `getCrypto()`
instead of importing `node:*` directly, and there are zero bare `node:*`
imports in `packages/activerecord/src` (excluding `tsc-wrapper/`, a
build-time tool). This pattern is the template for every future native-dep
abstraction.

### `TRAILS_ENV` vs `NODE_ENV`

The JS ecosystem treats `NODE_ENV` as a _build-time hint_ (bundlers replace it
statically), not a reliable runtime value. BC-2 replaces all `NODE_ENV` reads
with `TRAILS_ENV` — no fallback, no shim. Pre-release means no backwards
compat obligations.

### SQLite driver registry

`docs/sqlite-driver-abstraction-plan.md` describes the registry pattern:
a `DriverFactory` interface, a `registerDriver()` call in the adapter subpath
export, and capability flags so the adapter layer can branch on
async vs sync. The database-adapter registry in BC-3 copies this shape
verbatim — read that doc for implementation detail.

## 3. Migration plan

### BC-1 — this document (~250 LOC, plan-only) ✅ #1250

Establishes vocabulary, cross-links existing plans, and sequences the work.
No code changes.

### BC-2 — `getEnv()` accessor + migrate 6 activerecord files (~80 LOC) ✅ #1251

Add `getEnv` to `packages/activesupport/src/environment.ts` with two
overloads:

```ts
function getEnv(key: string, defaultValue: string): string;
function getEnv(key: string): string | undefined;
```

Read-back policy: read `TRAILS_ENV` only — no `NODE_ENV` fallback.
Pre-release; direct replacement. The `defaultValue` argument (e.g.
`getEnv("TRAILS_ENV", "development")`) is for explicit caller-supplied
defaults, not for `NODE_ENV` aliasing.

Files to migrate:

| File                                 | Sites | Old name                                         | New name                                                  |
| ------------------------------------ | ----- | ------------------------------------------------ | --------------------------------------------------------- |
| `token-for.ts:32`                    | 1     | `process.env` guard                              | `getEnv()` guard                                          |
| `connection-handling.ts`             | 3     | `process.env.NODE_ENV`                           | `getEnv("TRAILS_ENV", "development")`                     |
| `schema.ts:114`                      | 1     | `process.env.NODE_ENV`                           | `getEnv("TRAILS_ENV", "development")`                     |
| `database-configurations.ts:254,269` | 2     | `NODE_ENV`, `DATABASE_URL`                       | `TRAILS_ENV`; `DATABASE_URL` stays                        |
| `migration.ts:1461,1931`             | 2     | `NODE_ENV`, `DISABLE_DATABASE_ENVIRONMENT_CHECK` | `TRAILS_ENV`, `TRAILS_DISABLE_DATABASE_ENVIRONMENT_CHECK` |
| `tasks/database-tasks.ts:350,358`    | 2     | `VERSION`                                        | `TRAILS_MIGRATION_VERSION`                                |

`DATABASE_URL` is an industry standard and stays unchanged.

**Implementation note (shipped in #1251):** The original spec called for the full
`EnvAdapter` / `registerEnvAdapter` / `getEnvAdapter` pattern mirroring `getFs`.
BC-2 shipped the simpler shape — a thin `getEnv()` wrapper over
`globalThis.process.env` with no registry. The simpler shape is sufficient for
every use case through BC-4. If a future consumer needs to inject a different env
source (e.g. `import.meta.env` in a browser shim), lift `environment.ts` to the
full adapter pattern at that point.

### BC-3 — database-adapter registry (~250 LOC) 🟡 partial

**Subpath exports shipped** (verify in `packages/activerecord/package.json`):

- `@blazetrails/activerecord/connection-adapters/postgresql-adapter.js`
- `@blazetrails/activerecord/connection-adapters/mysql2-adapter.js`
- `@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js`

The sqlite driver track shipped its own `DriverFactory` / `registerDriver`
registry independently of activerecord's adapter registry — see PRs #1238 (PR 1),
#1240 (PR 2), #1247 (PR M), #1264 (PR 3), #1271 (PR 5 node:sqlite). That registry
serves the sqlite-adapter side and is in `@blazetrails/activesupport/sqlite-adapter`.

**Still open under BC-3:**

1. **Eager native imports leak from non-subpath-entry files.** Live grep against `packages/activerecord/src/connection-adapters/`:
   - `postgresql/database-statements.ts` — `import pg from "pg"` (eager, not lazy)
   - `postgresql/temporal-type-parsers.ts` — `import pg from "pg"`
   - `mysql/temporal-type-cast.ts` — `import mysql from "mysql2/promise"`
   - `mysql2/database-statements.ts` — `import type mysql from "mysql2/promise"` (type-only — OK)

   These get pulled in transitively when the main adapter file imports from them. The path forward: either gate behind a registry (lazy) or move the dep-using bits into the subpath entry only.

2. **`pg` and `mysql2` peer-dep promotion** has not happened — `packages/activerecord/package.json` `dependencies` still lists only workspace deps (no native deps declared). They're picked up via the consumer app's installation. Worth formalizing as `optionalDependencies` so type-check works without a hard `pg` install.

3. **Self-registering adapter registry** (the `register at import time` pattern that the original BC-3 spec required) has NOT shipped. Today, `import @blazetrails/activerecord/connection-adapters/postgresql-adapter.js` exposes the class but no global registry tracks "postgresql is wired." The "no adapter registered for postgresql" error message described in the spec doesn't exist.

### BC-3b — encryption namespace bundle-cleanliness (~100-150 LOC)

Surfaced during the bundle-smoke pass on #1296. `packages/activerecord/src/encryption/config.ts:84` does `import { deflateSync, inflateSync } from "zlib"` at module top-level. Reachable from the activerecord barrel via:

```
index.ts → encryption/install.js (installExtendedQueriesIfConfigured)
  → encryption.ts → encryption/configurable.ts → encryption/config.ts → "zlib"
```

So `import @blazetrails/activerecord` transitively pulls `node:zlib`, even for apps that don't use encryption. Same class of bundle-cleanliness issue as the pg/mysql2 leaks #1296 just closed; promoted to its own line so it doesn't drown in BC-5's iterative bucket.

**Approach: subpath import, mirror the pg/mysql2 pattern from BC-3.** Move the encryption namespace out of barrel reachability:

- Add `@blazetrails/activerecord/encryption` (and potentially nested subpaths if needed) to `package.json` exports.
- Remove encryption symbols from `packages/activerecord/src/index.ts` (the barrel).
- Anything currently re-exported from the barrel for ergonomics — `Encryption.configure(...)`, `installExtendedQueriesIfConfigured`, etc. — moves to subpath-only access. Consumers update from `import { configure } from "@blazetrails/activerecord"` to `import { configure } from "@blazetrails/activerecord/encryption"`.

The encryption subsystem is server-only by design (key management, compressor, key generators). Moving the whole namespace to a subpath:

- Solves the `zlib` leak by making encryption barrel-unreachable.
- Matches the BC-3 pattern used for pg/mysql2 adapters — consistency.
- Frees `installExtendedQueriesIfConfigured` from being barrel-reachable.
- Closes the issue permanently — future encryption-internal uses of `node:crypto` / `zlib` / etc. won't reopen the same conversation.

LOC: ~100-150 net (subpath export + barrel cleanup + caller-migration if any internal-test callsites use the barrel).

**Out of scope:** alternatives like `pako` for in-browser deflate (option D from triage) are unnecessary because encryption is server-only forever — bundle-cleanliness is the goal, not browser execution.

### BC-4 — lint rules + browser-bundle CI smoke test (~150 LOC) 🟡 partial

Three gates were planned. Two ESLint rules shipped; the third gate (browser bundle CI) and a stricter native-package rule are still pending.

1. ✅ **`no-node-builtins` ESLint rule** (`eslint/no-node-builtins.mjs`) — rejects direct imports of Node.js built-in modules (`fs`, `path`, `crypto`, `os`, etc.) in browser-compatible packages, with autofix that rewrites the import + all usage sites to the activesupport adapter (`getFs`, `getPath`, `getCrypto`).
2. ✅ **`no-process-bypass` ESLint rule** (`eslint/no-process-bypass.mjs`) — covers `process.X` access for properties routed through activesupport's processAdapter (`platform`, `exit`, `stdout`, `stderr`, etc.). Autofixable for safe replacements.
3. ❌ **`no-direct-process-env` rule for `process.env.X`** — NOT yet shipped. The existing `no-process-bypass` covers `process.platform` etc. but does not gate `process.env`. Live grep shows direct `process.env` usage still in `test-databases.ts`, `test-setup-worker-db.ts`, and adapter test-helpers. Some of those are legitimately test-only; the rule should allow-list `**/*.test.ts` and `**/test-*.ts` and gate the rest.
4. ❌ **`no-native-package-import` rule** — NOT yet shipped. `pg`, `mysql2`, `better-sqlite3` are still importable from non-adapter files. A rule rejecting these outside `**/adapters/{postgresql,mysql2,sqlite3}/**` and the named subpath-entry files would close the gap.
5. ❌ **Browser-bundle smoke test in CI** — NOT yet shipped. No `esbuild --platform=browser` step in `.github/workflows/*.yml`. Per-package job (or extension to existing `DX Type Tests` job) needed.

### BC-5 — per-package portability audit + fixes (iterative) ⏳ ongoing

One PR per gap discovered. The matrix below tracks state.

## 4. Per-package portability matrix

| Package         | Status                       | Notes                                                                                                                                       |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `arel`          | ✅ portable today            | No native deps                                                                                                                              |
| `activemodel`   | ✅ portable today            | No native deps                                                                                                                              |
| `activesupport` | ✅ portable                  | Adapter layer is the template; sqlite-adapter / sqlite-drivers / process-adapter / fs-adapter / path-adapter / crypto-adapter all live here |
| `activerecord`  | 🟡 partial — see BC-3 / BC-4 | Core is portable; subpath exports for adapters shipped; eager pg/mysql2 imports still leak from non-subpath-entry files                     |
| `trailties`     | ❌ server-only intentionally | CLI tool; Node-only is correct                                                                                                              |
| `actionpack`    | ⏳ audit needed              | Likely portable; no known native deps                                                                                                       |
| `actionview`    | ⏳ audit needed              | Likely portable                                                                                                                             |
| `rack`          | ⏳ audit needed              | Likely portable                                                                                                                             |

## 5. CI gates (planned in BC-4)

| Gate                            | Tooling                                                                | Status             |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| No node:\* / fs / path / crypto | `blazetrails/no-node-builtins` ESLint rule                             | ✅ shipped         |
| No `process.<gated>` access     | `blazetrails/no-process-bypass` ESLint rule                            | ✅ shipped         |
| No direct `process.env.X`       | `blazetrails/no-direct-process-env` ESLint rule                        | ❌ planned in BC-4 |
| No bare native package imports  | `blazetrails/no-native-package-import` ESLint rule                     | ❌ planned in BC-4 |
| Browser-bundle smoke            | `esbuild --bundle --platform=browser <barrel>` — fail on non-zero exit | ❌ planned in BC-4 |

A package barrel that resolves `node:fs` causes esbuild to exit non-zero,
failing the `Browser Bundle` job. Rely on esbuild's own exit code — don't
pipe to grep (grep exits 1 on no matches, which would fail CI when the build
is clean).

## 6. Open questions

- **Buffer / node: polyfills.** Do we offer a `Buffer` shim or similar on the
  browser side, or strictly require activesupport adapters? Current stance:
  strictly require adapters; polyfills hide leaks.

## Resolved (formerly open questions)

- **PG browser execution.** ✅ Resolved: PostgreSQL is server-only. No browser-compat support. The goal for `pg` is bundle-cleanliness so a browser barrel doesn't pull `pg` transitively, not browser execution. No `pg-driver-abstraction-plan.md` needed.
- **MySQL driver abstraction.** ✅ Resolved: MySQL is server-only. Same shape as PG — bundle-cleanliness only. No `mysql-driver-abstraction-plan.md` needed.

These resolutions simplify BC-3: pg/mysql2 just need to be excluded from browser bundles (lint rule + bundle smoke test in BC-4), not abstracted behind a registry. A registry would still be useful for adapter selection ergonomics, but isn't required for the BC track.
