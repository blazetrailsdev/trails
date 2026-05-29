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
// models/index.ts — AUTO-GENERATED by activerecord-cli. Do not edit by hand.
// Re-run `ar generate model <name>` (or `ar init`) to update.
import { registerModel } from "@blazetrails/activerecord";
import { User } from "./user.js";
import { Tweet } from "./tweet.js";
import { Follow } from "./follow.js";
import { Like } from "./like.js";

export const models = [User, Tweet, Follow, Like] as const;
for (const m of models) registerModel(m); // registration lives here

export { User, Tweet, Follow, Like };
```

- Model files stay **pure** (associations / scopes / validations only — no
  `declare`, no `this.attribute`, no `registerModel`).
- **Generators are incremental, not scanning.** `ar generate model Tweet`
  knows the name; it writes `models/tweet.ts` and **appends** the
  import/register/export lines to `models/index.ts`. No project scan needed
  for the common path (mirrors Rails generators, which also don't scan —
  autoload covers discovery, our append covers it).
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

```
config/database.ts           # TRAILS_ENV-keyed, like database.yml
db/migrate/<ts>_<name>.ts     # Migration subclasses, reversible change()
db/seeds.ts
models/<name>.ts              # pure models
models/index.ts               # GENERATED manifest (import + register + export)
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
| `ar generate model <Name> [field:type …]` | write model + migration; append to manifest                     |
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

### 6.2 `_abstractClass` own-property fix (bug)

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
