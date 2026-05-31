# Standalone ActiveRecord: DX findings + `activerecord-cli` proposal

> **Status:** proposal / findings — 2026-05-29. No code committed against
> this yet. Born from building `examples/twitter-clone` (an Express app on
> bare `@blazetrails/activerecord`, no `trailties`).

## 1. Motivation

We built a Twitter-clone Express app on `@blazetrails/activerecord` alone, to
see what using the ORM **without the full Trails/web stack** feels like. It
works, but a bare-AR user today either (a) hand-rolls migrations, a `db:*`
CLI, config resolution, and a bootstrap sequence, or (b) pulls in
`trailties` — which drags the entire web framework (`actionpack`, `rack`,
`vite`) in for what is purely a data-layer need.

That machinery **already exists**, but only at the `trailties` layer:

- `@blazetrails/activerecord/tasks` → `DatabaseTasks` (create/drop per
  adapter) already ships in AR.
- `trailties` has the rest: a `trails` CLI, `commands/` (`db`, `server`,
  `console`, `generate`, `destroy`, `new`…), `generators/` (model,
  migration, app), `migration-loader.ts` (`discoverMigrations`),
  `database.ts` (config resolution keyed on `TRAILS_ENV`).

So the example re-implemented `discoverMigrations`, the db tasks, and config
resolution that already exist — just to avoid the web-stack dependency. That
is the gap this doc addresses.

## 2. Findings — friction a bare-AR user hits

1. **Three-step bootstrap dance.** You must `establishConnection`, then
   `registerModel` each model, then `loadSchema` each model, in that order —
   or you get `INSERT … DEFAULT VALUES` (no columns) or "Model not found in
   registry" errors.
2. **`registerModel` is required** for `className:` / `through:` resolution
   and is easy to forget; nothing reminds you.
3. **`loadSchema` must be called** after migrating for zero-attribute
   (schema-driven) models — there is no lazy reflection on the in-memory /
   pool-1 path.
4. **No pending-migration check** in the box; the example wrote its own.
5. **`ApplicationRecord` is broken** (see §6.2) — a core bug skips schema
   reflection for every model under an abstract base.
6. **Config discovery diverges.** `trailties` uses `config/database.ts` +
   `TRAILS_ENV` (deliberately _not_ `NODE_ENV`, see `trailties/database.ts`);
   the example now follows that same convention (`config/database.ts` +
   `TRAILS_ENV`); core already supports both file forms and env vars.
7. **Minor:** `validates({ uniqueness })` is not routed (must use
   `validatesUniqueness`); named scopes need a manual `declare static` under
   plain `tsc`; running a scratch script from outside the workspace pulls a
   second copy of `@blazetrails/arel` (dual-package hazard → `Unknown node
type: InsertStatement`).

## 3. Why it's like this: the Ruby/TS gap

Rails has **no bootstrap step** beyond `establish_connection` (a railtie does
even that). Everything else rides on five Ruby capabilities, four of which
have **no TypeScript equivalent**:

| Rails mechanism                   | Used for                                         | TS equivalent                                    |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Zeitwerk autoload                 | models exist without explicit import             | ❌ a module must be imported to exist            |
| `constantize`                     | resolve `has_many :comments` → `Comment` by name | ❌ no runtime constant-by-name                   |
| `self.inherited(subclass)`        | auto-register every model on definition          | ❌ no class-definition hook (noted in CLAUDE.md) |
| `method_missing` + `load_schema!` | reflect columns lazily on first attribute touch  | ❌ not without a per-instance `Proxy`            |
| synchronous DB                    | reflect inside that first access                 | ⚠️ Trails reflection is async                    |

So `registerModel` + `loadSchema` aren't an oversight — they stand in for the
`inherited` hook + `constantize` + `method_missing` that TS lacks. The design
below embraces that rather than fighting it:

- **Registration cannot be automated** in TS (no `inherited`, no
  `constantize`). The principled substitute is a **generated manifest**
  (`models/index.ts`) that imports + registers the models. The generator is
  the stand-in for Zeitwerk; the explicit import is load-bearing (it's what
  makes the class exist and survive bundling).
- **Schema reflection can be made lazy** — queries are already `async`, so the
  query path can `await` a one-shot reflection. (Only the _sync_ reflection
  path deadlocks on in-memory/pool-1; the async path works — verified.)

## 4. Proposal

### 4.1 New package: `@blazetrails/activerecord-cli`

Owns **generators, the migrator, `init`, the `db:*` CLI, and the
pending-migration check**. Installable on its own; `trailties` depends on it
and re-exports, deleting its duplicate copies.

### 4.2 Dependency graph — acyclic; runtime vs tooling split

Target end-state, **after relocating the AR tsc-wrapper + bins** into the CLI
(see §4.8):

```
trails-tsc          (generic tsc-plugin framework; dep: tse-compiler — no AR dep)
   ▲
   │            ┌────────────────────────────┐
activerecord    │  (pure runtime ORM + DatabaseTasks; NO trails-tsc dep)
   ▲            │
   └────────────┤
activerecord-cli │  (AR tsc-wrapper + model-scanner, the trails-tsc /
   ▲            │   trails-schema-dump bins, generators, migrator, init,
   │            │   db CLI, pending-check)  →  depends on activerecord + trails-tsc
trailties          (drops its copies; re-exports from activerecord-cli)
```

Edges: `activerecord-cli → activerecord`, `activerecord-cli → trails-tsc`,
`trailties → activerecord-cli`. No cycles.

Key facts:

- `trails-tsc` is **generic** and does **not** import `activerecord` → no
  `activerecord ↔ trails-tsc` loop, regardless of where the AR wrapper lives.
- **Today** the AR model-scanner + tsc-wrapper live in `activerecord`
  (`src/tsc-wrapper/`), which is why `activerecord` currently depends on
  `trails-tsc`. The plan **moves them to `activerecord-cli`** (§4.8), so
  `activerecord` becomes pure runtime with one fewer dependency and the
  scanner sits next to the generator that also needs it.
- The only multi-edge node is `activerecord-cli` (→ `activerecord` +
  `trails-tsc`), which is honest: it's the tooling layer.

### 4.3 No new `connect()` in core

We considered a `connect()` bootstrap helper and concluded it's unnecessary
sugar. With registration in the generated manifest and lazy reflection on the
roadmap, the durable bootstrap is **two things that already exist**:

```ts
import { models } from "./models"; // generated barrel → registers on import
await Base.establishConnection(); // existing core API → reads config/database.ts
// interim only, removed once lazy reflection lands:
await Promise.all(models.map((m) => m.loadSchema()));
```

- **No core additions** for bootstrap.
- The interim `loadSchema` step lives in **generated userland code** (the
  manifest can export `loadSchemas()`, or `ar init` scaffolds a `db.ts`) — the
  Rails shape, where glue is generated boilerplate in your app, not hidden API
  in the gem.
- Lazy async reflection (§6.1) later deletes the `loadSchema` step, leaving
  bootstrap = `establishConnection()` + the manifest import.

### 4.4 Registration via a generated `models/index.ts`

The manifest is the TS substitute for Zeitwerk + the `inherited` hook:

```ts
// AUTO-GENERATED by @blazetrails/activerecord-cli. Do not edit by hand.
// Re-run `ar generate:manifest` (or `ar init`) to update.
import { registerModel } from "@blazetrails/activerecord";
import { Follow } from "./follow.js";
import { Like } from "./like.js";
import { Tweet } from "./tweet.js";
import { User } from "./user.js";

export const models = [Follow, Like, Tweet, User] as const;
for (const m of models) registerModel(m);

export { Follow, Like, Tweet, User };
```

(Entries are emitted in stable alphabetical order; `ar generate model <name>`
will splice a new entry into this same file at its sorted position in a later
slice.)

- Model files stay **pure** (associations / scopes / validations only — no
  `declare`, no `this.attribute`, no `registerModel`).
- **Generators are incremental, not scanning.** `ar generate model Tweet`
  knows the name; it writes `app/models/tweet.ts` and **inserts** the
  import/register/export lines into `app/models/index.ts` at the spot that
  keeps it alphabetically sorted (so the file stays byte-identical to a full
  regenerate — no append-out-of-order drift). No project scan needed for the
  common path (mirrors Rails generators, which also don't scan — autoload
  covers discovery, our sorted insert covers it).
- A **full scan** is needed only by `ar init` (adopt a pre-existing `models/`
  dir) and an optional `ar models:manifest --rebuild`/verify. Those reuse the
  **model-scanner that moves into `activerecord-cli` alongside the generator**
  (§4.8) — the same scanner the AR tsc-wrapper uses.

### 4.5 trails-tsc's role: scan + (optionally) verify, never write

- `trails-tsc` already discovers `Base` subclasses + associations to
  virtualize types. It keeps doing exactly that.
- Generating the manifest is **codegen**, not type-checking. It must not be a
  side effect of the type pass: `trails-tsc` runs on every check, in watch
  mode, in read-only CI, often `--noEmit`. A typechecker that rewrites source
  would dirty git, race watch mode, and fail read-only CI.
- **Optional safety net:** `trails-tsc` (or an ESLint rule) may **verify** the
  manifest is complete at check-time — a read-only error if a model file isn't
  registered, catching drift from hand-authored models. It never writes.

### 4.6 Config convention

Standardize the bare-AR path on **`config/database.ts` keyed by
`TRAILS_ENV`**, matching `trailties/database.ts` (which deliberately avoids
`NODE_ENV` — the JS ecosystem treats `NODE_ENV` as a build-time hint, so
conflating it with the runtime DB selector silently picks the wrong
database). One convention across the whole ecosystem. `ar init` scaffolds it;
`Base.establishConnection()` reads it with no arguments.

### 4.7 Project layout `ar init` scaffolds

Models live under `app/models/`, matching Rails and the `trailties` web layer
(`app/models`), so a standalone project keeps the same model path if it later
grows into a full Trails app. `ar generate:manifest` defaults to `app/models`
and takes `--root <dir>` to override.

```
config/database.ts           # TRAILS_ENV-keyed, like database.yml
db/migrate/<ts>_<name>.ts     # Migration subclasses, reversible change()
db/seeds.ts
app/models/<name>.ts          # pure models
app/models/index.ts           # GENERATED manifest (import + register + export)
db.ts                         # generated glue: establishConnection + loadSchemas
```

### 4.8 Install story, one CLI, and the tooling relocation

**Two packages + a driver.** A bare-AR user installs:

- `@blazetrails/activerecord` — runtime dep (you import models/Base from it).
- `@blazetrails/activerecord-cli` — dev dep (tooling). Brings the `trails-tsc`
  type-virtualizer transitively, so users never install `trails-tsc` directly.
- a driver peer (`better-sqlite3` / `pg` / `mysql2`).

Since `activerecord-cli` depends on `activerecord`, even installing only the
CLI pulls the runtime in. Splitting by role (runtime dep vs dev dep) keeps it
to two direct entries.

**One CLI surface.** `activerecord-cli` exposes a single `ar` command that
_delegates_ to the wrappers rather than asking users to learn several
binaries: `ar typecheck` → the `trails-tsc` virtualizer, `ar schema:dump` →
`trails-schema-dump`, plus `ar init / generate / db:*`. `trails-tsc` remains
directly invokable by its own name (editors, build pipelines, `tsconfig`
setups want the drop-in `tsc`); `ar typecheck` is the convenience alias, not a
replacement. Do **not** re-declare the `trails-tsc` bin in two packages — that
is a PATH-collision footgun.

**Relocation (part of this plan, not a future note).** Move the AR
type-tooling out of the runtime package:

- Move `activerecord/src/tsc-wrapper/` (the AR virtualizer plugin,
  `ar-program`, the model-scanner) into `activerecord-cli`.
- Move the `trails-tsc`, `trails-schema-dump`, `trails-models-dump` **bins**
  from `activerecord`'s `package.json` to `activerecord-cli`'s.
- Drop `@blazetrails/trails-tsc` from `activerecord`'s dependencies;
  `activerecord` becomes pure runtime. Add `activerecord` + `trails-tsc` as
  `activerecord-cli`'s deps.

This reinforces the runtime/tooling split and the two-package story (zero-
declare models _require_ the virtualizer, which now ships with the tooling
package, exactly where it belongs).

**One wrinkle to plan for — a dev-only cycle.** `activerecord`'s own
`virtualized-dx-tests` are type-checked by the wrapper (today
`packages/activerecord/dist/tsc-wrapper/cli.js`). After the move, that
type-check consumes `activerecord-cli`, i.e. `activerecord` (devDependency) →
`activerecord-cli` → `activerecord`. This never reaches published runtime
deps — it's a monorepo dev-only edge that pnpm workspaces resolve fine — but
the `test:types:virtualized` script must repoint to the relocated CLI, and
`trailties` / any CI invoking `activerecord`'s old `trails-tsc` bin path must
update. If we'd rather avoid even the dev cycle, the lighter variant is to
relocate **only the bins** (thin wrappers) to `activerecord-cli` while leaving
the wrapper _library_ in `activerecord` for self-test — at the cost of
`activerecord` keeping its `trails-tsc` dep. The full move is the cleaner
end-state; the bin-only move is the low-risk increment.

## 5. CLI surface (`activerecord-cli`)

Backed by the existing `Migration` / `MigrationRunner` / `DatabaseTasks`, plus
the relocated type-tooling (§4.8):

| Command                                   | Notes                                                           |
| ----------------------------------------- | --------------------------------------------------------------- |
| `ar init`                                 | scaffold config/db dirs, empty manifest, glue                   |
| `ar generate model <Name> [field:type …]` | write model + migration; insert into manifest (sorted)          |
| `ar generate migration <Name>`            | timestamped migration stub                                      |
| `ar db:create` / `db:drop`                | via `DatabaseTasks`                                             |
| `ar db:migrate` / `db:rollback [n]`       | run migrations; dump schema-columns.json                        |
| `ar db:migrate:status`                    | up/down table                                                   |
| `ar db:seed`                              | run `db/seeds.ts`                                               |
| `ar db:schema:dump`                       | regenerate `db/schema-columns.json` (for `trails-tsc --schema`) |
| `ar db:setup` / `db:prepare` / `db:reset` | composites                                                      |
| `ar typecheck`                            | delegates to the `trails-tsc` virtualizer (`--schema`)          |
| `ar schema:dump`                          | delegates to `trails-schema-dump`                               |

`trails-tsc` / `trails-schema-dump` stay directly invokable by name;
`ar typecheck` / `ar schema:dump` are convenience aliases (§4.8).

The **pending-migration check** lives here (or in the web layer), invoked at
boot — mirroring Rails' `CheckPending` railtie middleware, **not** AR core.

## 6. Core `activerecord` changes (orthogonal to packaging)

Only two, both independent of the CLI work:

### 6.1 Lazy async schema reflection (roadmap)

Make the query/persistence path `await` a one-shot `ensureSchemaLoaded()`
when a model's schema hasn't been reflected. Queries are already async, so
this is contained; the async reflection path (`loadSchemaFromAdapter`) already
works (verified) — only the sync path deadlocks on in-memory/pool-1. This
deletes the explicit `loadSchema` step from every consumer.

Residual gap: attribute access on a record that was **never queried and never
loaded** (e.g. `new User().handle` before any DB hit) can't trigger async
reflection from a getter without wrapping instances in a `Proxy`. Rails solves
this with synchronous `method_missing`; for Trails this is an accepted
edge — schemas are loaded by the first query in practice.

### 6.2 `_abstractClass` own-property fix (bug — SHIPPED #2657)

> **Status:** shipped in #2657 (see the Post-merge follow-up queue below). The
> description below is retained as historical context for the bug that was
> fixed.

`primaryAbstractClass()` / `abstractClass = true` sets `_abstractClass` on
`ApplicationRecord`; concrete models **inherit** it via the prototype chain.
`loadSchemaFromAdapter` and `loadSchemaFromCacheSync` read `this._abstractClass`
**un-guarded** (model-schema.ts:819, :890; also :392), so every model under an
`ApplicationRecord` is wrongly treated as abstract and **skips reflection** —
`INSERT … DEFAULT VALUES`. Rails' `abstract_class?` is per-class (own-property
only); `inheritance.ts`'s `getAbstractClass` already guards with
`hasOwnProperty`. Fix: use the own-property check at those three sites. This
unblocks the common `class X extends ApplicationRecord` pattern (which the
example had to drop).

## 7. Non-goals / open questions

- **Not** porting the web stack; this is the data layer only.
- Whether `ar` reuses the `trails` binary name or ships its own — TBD.
- Whether the manifest verify is `trails-tsc` built-in vs a separate ESLint
  rule — TBD.
- Exact generator field DSL (`field:type`, references, indexes) — follow Rails
  but TBD.

## 8. Reference implementation

`examples/twitter-clone` is the hand-rolled version of all of the above:
timestamped `db/migrate/`, a `db:*` CLI (`src/cli.ts` + `src/migrator.ts`),
`config/database.ts` (`TRAILS_ENV`-keyed), a generated-style `models/index.ts`, schema-driven
zero-attribute models typed via `trails-tsc --schema db/schema-columns.json`.
It is what `activerecord-cli` should make unnecessary to write by hand.

## Post-merge follow-ups

Forward-looking items needing follow-up work, grouped into PR-sized work units.
This doc is a proposal — nothing implemented yet beyond the `examples/twitter-clone`
reference (#2638).

### Actionable PR queue

**Ready now:**

- [x] Done (#2657) — **§6.2 `_abstractClass` own-property fix**. Routed the three
      un-guarded `_abstractClass` reads in `model-schema.ts` (`resetTableName` :392,
      `loadSchemaFromAdapter` :819, `loadSchemaFromCacheSync` :890) through
      `getAbstractClass`'s own-property `hasOwnProperty` check, matching Rails'
      per-class `abstract_class?`. Concrete models under `ApplicationRecord` no
      longer inherit abstractness and skip reflection.

**Larger / multi-PR:**

- **`@blazetrails/activerecord-cli` package** (the proposal's core deliverable).
  New package owning generators, migrator, `init`, the `db:*` CLI, and the
  pending-migration check, plus relocating the AR `tsc-wrapper`/bins into it so
  `activerecord` becomes pure runtime. Multi-PR effort per the proposal's own
  A/B/C split (§4). Not implemented (docs + example only). Source: #2638.
- **§6.1 lazy async schema reflection** (roadmap). Make the query/persistence
  path `await` a one-shot `ensureSchemaLoaded()` so consumers no longer call
  `loadSchema()` explicitly (the async reflection path already works; only the
  sync path deadlocks on in-memory/pool-1). Deletes the explicit `loadSchema`
  step from every consumer. Source: #2638.

**Optional / deferred:**

- **CI examples job.** `examples/` is classified as `docs_only` in `ci.yml`
  (deliberate, per repo owner — examples should not run in CI most of the time).
  If signal is ever wanted, add a lightweight `examples/**`-gated job running
  `pnpm -C examples/twitter-clone typecheck && smoke` with
  `install --frozen-lockfile`, without the full package matrix. Source: #2638.

**From #2657 (§6.2 `_abstractClass` own-property fix):**

- ~10–20 LOC: `resetTableName` mirrors Rails' `abstract_class?` branch but does
  NOT implement the `superclass.abstract_class?` branch
  (`model_schema.rb:295` — `superclass.table_name || compute_table_name`).
  Pre-existing gap; add it if STI-under-abstract table-name resolution surfaces
  a need. Low priority; no known failing case.

### Notes / gotchas (from #2638)

- Examples should **inherit workspace dep versions** (omit `@types/node` /
  `typescript` pins) rather than re-pin: a divergent `@types/node ^22` pin in an
  example pulled a second `@types/node` into the lockfile and broke `trails-tsc`'s
  typecheck across the whole matrix (`FSWatcher.on` error) — looked like a flake
  for many review rounds.
- The example deliberately keeps `NODE_ENV` as a _fallback_ DB-env selector
  (`TRAILS_ENV ?? NODE_ENV ?? "development"`) to stay in sync with core's own
  resolution in `connection-handling.ts` / `database-configurations.ts` (§4.6
  recommends standardizing the bare-AR path on `TRAILS_ENV`-keyed config; the
  fallback is the pragmatic interim).
