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

### BC-1 — this document (~250 LOC, plan-only)

Establishes vocabulary, cross-links existing plans, and sequences the work.
No code changes.

### BC-2 — `getEnv()` accessor + migrate 6 activerecord files (~80 LOC)

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

### BC-3 — database-adapter registry (~250 LOC)

**Block until sqlite-driver PR M (#1247) merges** so the registry pattern is
proven and we can copy it verbatim.

- Add `packages/activerecord/src/connection-adapters/registry.ts` mirroring
  the sqlite `DriverFactory` / `registerDriver` shape.
- Add subpath exports:
  - `@blazetrails/activerecord/adapters/postgresql`
  - `@blazetrails/activerecord/adapters/mysql2`
  - `@blazetrails/activerecord/adapters/sqlite3`
- Move `import pg from "pg"` and `import Database from "better-sqlite3"` out
  of barrel-reachable files and into the adapter subpath entry points only.
- Promote `pg` and `mysql2` to optional peer deps in `package.json`.

**Important:** registries self-register on import. An app that never imports
`@blazetrails/activerecord/adapters/postgresql` will find no registered
driver and get a clear "no adapter registered for postgresql" error at
connection time. The error message should name the missing subpath import so
the fix is obvious.

Files that currently eagerly import native deps (all move to subpath entries):

- `connection-adapters/postgresql-adapter.ts` — `import pg from "pg"`
- `connection-adapters/postgresql/temporal-type-parsers.ts` — `import pg from "pg"`
- `connection-adapters/sqlite3-adapter.ts` — `import Database from "better-sqlite3"`
- `connection-adapters/sqlite3/drivers/better-sqlite3.ts` — `import Database from "better-sqlite3"`

### BC-4 — lint rules + browser-bundle CI smoke test (~150 LOC)

Three gates, all additive (no existing code changes):

1. **`no-native-import` lint rule** — reject `node:*`, `pg`, `mysql2`,
   `better-sqlite3` outside designated adapter files
   (`**/adapters/{postgresql,mysql2,sqlite3}/**`).
2. **`no-direct-process-env` lint rule** — reject `process.env.X` outside
   `bin/`, `test-setup-*.ts`, `*-adapter.ts`, and the new `environment.ts`.
3. **Browser-bundle smoke test** — per-package CI step:
   `esbuild --bundle --platform=browser <barrel>` and fail on any `node:*`
   resolution error. Added to the `DX Type Tests` job or a new
   `Browser Bundle` job.

### BC-5 — per-package portability audit + fixes (iterative)

One PR per gap discovered. Packages not yet audited (actionview, actionpack,
rack) get their status set to ✅ or flagged as ❌ after a grep-and-review pass.

## 4. Per-package portability matrix

| Package         | Status                        | Notes                                                                    |
| --------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `arel`          | ✅ portable today             | No native deps                                                           |
| `activemodel`   | ✅ portable today             | No native deps                                                           |
| `activesupport` | ✅ portable                   | Adapter layer is the template; adapters live here                        |
| `activerecord`  | 🟡 portable after BC-2 + BC-3 | Core is portable; adapters server-only by design, lazy-loaded after BC-3 |
| `trailties`     | ❌ server-only intentionally  | CLI tool; Node-only is correct                                           |
| `actionpack`    | ⏳ audit needed               | Likely portable; no known native deps                                    |
| `actionview`    | ⏳ audit needed               | Likely portable                                                          |
| `rack`          | ⏳ audit needed               | Likely portable                                                          |

## 5. CI gates (added in BC-4)

| Gate                    | Tooling                                                                | Job                    | Trigger    |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------- | ---------- |
| Browser-bundle smoke    | `esbuild --bundle --platform=browser <barrel>` — fail on non-zero exit | `Browser Bundle` (new) | Every push |
| No bare native imports  | `blazetrails/no-native-import` ESLint rule                             | `Lint` (existing)      | Every push |
| No direct `process.env` | `blazetrails/no-direct-process-env` ESLint rule                        | `Lint` (existing)      | Every push |

A package barrel that resolves `node:fs` causes esbuild to exit non-zero,
failing the `Browser Bundle` job. Rely on esbuild's own exit code — don't
pipe to grep (grep exits 1 on no matches, which would fail CI when the build
is clean).

## 6. Open questions

- **Buffer / node: polyfills.** Do we offer a `Buffer` shim or similar on the
  browser side, or strictly require activesupport adapters? Current stance:
  strictly require adapters; polyfills hide leaks.
- **PG browser execution.** Should a future `pg-driver-abstraction-plan.md`
  mirror the sqlite plan and allow a browser-capable PG driver (e.g. via
  WebSocket)? Current stance: PostgreSQL and MySQL remain server-only; the
  goal is _bundle-cleanliness_, not browser execution. Revisit only if an
  explicit consumer requests it.
- **MySQL driver abstraction.** Should MySQL follow the same driver-registry
  path as SQLite (a `MysqlDriver` interface, `mysql2` as the default
  implementation, a future `planetscale-driver` possible)? Or is MySQL
  strictly server-only forever? Currently leaning server-only — the bundle
  goal is met by BC-3's lazy loading alone — but document this if a consumer
  requests it.
