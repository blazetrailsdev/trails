# Plan: Auto-Typed Models via Virtual Source Files

Status: **proposal / planning draft**.
Last updated: 2026-04-15.

Related:

- Current manual pattern: [CLAUDE.md § "The `declare` pattern for typed runtime-attached members"](../CLAUDE.md).
- Canonical compiled reference for the manual pattern:
  [`packages/activerecord/dx-tests/declare-patterns.test-d.ts`](../packages/activerecord/dx-tests/declare-patterns.test-d.ts).

## Why

Today, a user who writes

```ts
class Post extends Base {
  static {
    this.attribute("title", "string");
    this.hasMany("comments");
    this.belongsTo("author");
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}
```

has to also write these `declare` lines to get any typing:

```ts
declare title: string;
declare comments: Comment[];
declare author: Author | null;
declare static published: () => Relation<Post>;
```

Every attribute / association / scope / enum is typed twice — once in the
runtime call, once in the manual `declare`. Copying is error-prone (typos,
wrong target class, stale declares after a rename).

**Goal:** writing the runtime call alone is enough for the type system to
see the member. Zero `declare` for the common case.

## Before / after

**Before (today):**

```ts
// post.ts
import { Base, Relation } from "@blazetrails/activerecord";
import { Author } from "./author.js";
import { Comment } from "./comment.js";

class Post extends Base {
  declare title: string;
  declare comments: Comment[];
  declare author: Author | null;
  declare static published: () => Relation<Post>;

  static {
    this.attribute("title", "string");
    this.hasMany("comments");
    this.belongsTo("author");
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}
```

**After (post-rollout):**

```ts
// post.ts — the source the user writes and commits
import { Base } from "@blazetrails/activerecord";

class Post extends Base {
  static {
    this.attribute("title", "string");
    this.hasMany("comments");
    this.belongsTo("author");
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}
```

No generated files on disk. No `.trails/` directory. No gitignore entry.
The editor and `trails-tsc` see an in-memory version of this file with
`declare title: string; declare comments: Comment[]; declare author: Author | null; declare static published: () => Relation<Post>;`
injected at the top of the class body. Nothing else exists.

## Design

### Two entry points, one package, one transform

The virtualization logic — "given a source file, return a transformed
source with `declare` members injected inline" — is the entire product.
It ships as a single module inside `@blazetrails/activerecord` with two
shells around it:

1. **CLI shell: `@blazetrails/activerecord/tsc` (bin: `trails-tsc`)** —
   thin wrapper around `ts.createProgram` with a custom `ts.CompilerHost`
   whose `getSourceFile` and `readFile` apply the virtualization. Behaves
   like `tsc` for every purpose (accepts the same `tsconfig.json`,
   produces the same diagnostics format, same exit codes). Users replace
   `tsc` with `trails-tsc` in their typecheck script.

2. **Editor shell: `@blazetrails/activerecord/tsserver-plugin`** — a
   TypeScript language-service plugin. Enabled via `tsconfig.json`'s
   `compilerOptions.plugins`. Intercepts
   `LanguageServiceHost.getScriptSnapshot` to return the virtualized
   snapshot for each affected file. The user gets live completions,
   quick-info, and go-to-definition on the synthesized members with no
   save/regenerate loop.

Both shells call the same `virtualize(source, fileName)` function. Same
AST walker, same declaration synthesizer, same type registry. There is
no on-disk output at any point — the user's source is never written to,
and there is no sidecar file to stale, gitignore, or postinstall.

### The virtualize function

```ts
// packages/activerecord/src/type-virtualization/virtualize.ts
export interface VirtualizeResult {
  text: string;
  deltas: LineDelta[]; // injected-line offsets; consumed by diagnostic remapping
}
export function virtualize(originalText: string, fileName: string): VirtualizeResult;
```

Operation is **purely syntactic** — no `ts.Program` or `TypeChecker` is
needed. The function works off a single source file's text.

Steps:

1. Parse `originalText` with `ts.createSourceFile`.
2. Walk top-level class declarations whose `heritageClauses` contain an
   `extends` identifier literally named `Base` (or any class name the
   caller configures via a small allow-list — see "Transitive extends"
   below). Intentionally does not resolve symbols: a user who writes
   `class User extends Base` is covered, a user who writes
   `class Admin extends User` is not picked up by `virtualize` alone.
3. For each matched class, walk every `ClassStaticBlockDeclaration` and
   collect `this.attribute(...)`, `this.hasMany(...)`,
   `this.hasAndBelongsToMany(...)`, `this.belongsTo(...)`,
   `this.hasOne(...)`, `this.scope(...)`, `this.enum(...)` calls — plus
   top-level `defineEnum(this, ...)` calls that reference the class.
4. Map each call to a `declare` member string via the runtime call →
   declaration table below.
5. Splice the rendered declares in immediately after each affected
   class body's opening `{`. Record each insertion's original-source
   line and inserted line count as a `LineDelta` entry so the wrapper /
   plugin can remap diagnostics back to user coordinates.

The function is byte-stable: same input, same output, regardless of call
site. This is the entire test surface.

### Transitive extends

`class Admin extends User` — where `User extends Base` — is a real case.
Two layers of handling:

- **Walker step (symbol-aware, shared by CLI + plugin):** a separate
  pass that _does_ hold a `ts.Program` / `TypeChecker` walks the entire
  compilation, resolves each class's extends chain to its root, and
  produces the set of classes transitively rooted at `Base`. That set
  becomes the allow-list passed into `virtualize()` per file.
- **`virtualize()` stays pure:** the function itself performs no symbol
  resolution, so unit tests and fixture-pair snapshots don't need a
  `Program`. The allow-list is an input.

Splitting it this way means `virtualize()` is trivially testable and
the expensive checker work happens once per program, not per file.

### Runtime call → declaration mapping

| Runtime call                                                    | Injected declaration                                                                                                                                          | Target inference                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `this.attribute(name, "string", opts?)`                         | `declare name: string;`                                                                                                                                       | literal `"string" \| "integer" \| ...` → `string \| number \| ...`                                   |
| `this.attribute(name, "string", { default: ..., null: false })` | `declare name: string;`                                                                                                                                       | `null: false` drops nullability                                                                      |
| `this.hasMany(name, opts?)`                                     | `declare name: TargetClass[];`                                                                                                                                | classify(singularize(name)) or `opts.className`                                                      |
| `this.hasAndBelongsToMany(name)`                                | `declare name: TargetClass[];`                                                                                                                                | same                                                                                                 |
| `this.belongsTo(name)`                                          | `declare name: TargetClass \| null;`                                                                                                                          | classify(name) or `opts.className`                                                                   |
| `this.hasOne(name)`                                             | `declare name: TargetClass \| null;`                                                                                                                          | same                                                                                                 |
| `this.scope(name, fn)`                                          | `declare static name: (...args: ScopeArgs) => Relation<ThisClass>;` where `ScopeArgs` is `fn`'s parameter list with the leading `Relation<ThisClass>` dropped | extract the inline `fn` expression's parameters, drop the first (`rel`), preserve the rest literally |
| `this.enum(attr, map, opts?)`                                   | per-value: `declare is<Value>: () => boolean; declare <value>Bang: () => this; declare static <value>: () => Relation<ThisClass>;`                            | `Base.enum` shape                                                                                    |
| `defineEnum(this, attr, map)`                                   | richer shape: + `declare <value>: () => void; declare <value>Bang: () => Promise<void>; declare static not<Value>: () => Relation<ThisClass>;`                | per `src/enum.ts`                                                                                    |

### Target-class resolution

Inside the virtualizer, target-class names are **strings**, not types. The
virtualizer writes `declare comments: Comment[];` as literal text; TS
resolves `Comment` against whatever's in scope in `post.ts` (imports,
local declarations, etc.). This means:

1. If options include `className: "Foo"`, emit `Foo`.
2. Otherwise apply Rails inflection from `@blazetrails/activesupport`
   (`camelize(singularize("posts"))` → `Post`).
3. If `Foo` isn't in scope in the user's file, TS raises
   `Cannot find name 'Foo'`. The fix is an import in the user's source —
   same as today. We do not auto-inject imports into the virtual file
   (that path leads to invisible-source-edit debugging hell).

**Escape hatch for names that can't be inferred:** `className: "..."`
mirrors Rails' `class_name:`. If it's still wrong, hand-written `declare`
wins (see below).

### Handling polymorphic / through / aliasAttribute

- `polymorphic: true` → emit `name: Base | null`. Narrowing beyond `Base`
  is user-side (runtime branch on `<name>_type`).
- `through:` → walk both associations to pick up the final target type.
- `aliasAttribute(new, old)` → alias carries the resolved type of the
  original.

### Escape hatches

- **Opt out per class:** `/** @trails-typegen skip */` JSDoc above the
  class declaration — virtualizer skips that class entirely.
- **Manual override per member:** any hand-authored `declare <name>` the
  user writes _wins_ — the virtualizer detects existing members by name
  and skips injection for collisions. Useful for polymorphic narrowing
  and for members with shapes the synthesizer can't infer.

### Rails fidelity

Rails generates these accessors via Ruby metaprogramming; the developer
never sees the declarations written anywhere. Virtualization gets us the
closest TypeScript equivalent:

- **Same call surface.** `this.attribute(...)`, `this.hasMany(...)`, etc.
  read identically to Rails.
- **Same naming conventions.** singularize / camelize / `class_name:`
  come from `@blazetrails/activesupport`.
- **Same mental model.** The declares exist — they're just injected by
  the tooling, the way Rails injects accessors at class-body evaluation
  time.

### Shared internals

Both shells share one module tree, all inside
`packages/activerecord/src/type-virtualization/`:

1. **`virtualize.ts`** — the pure text-transform above.
2. **`walker.ts`** — finds `class X extends Base { static { ... } }`
   bodies and extracts runtime calls. Also owns the symbol-aware
   transitive-extends pass. Shared with other tooling that wants to
   introspect models statically.
3. **`synthesize.ts`** — renders one declaration string per call,
   driven by the type registry.
4. **`type-registry.ts`** — `"string" → "string"`, `"integer" → "number"`,
   etc. Imported by runtime attribute typing as well, so the two can't
   drift.

### Testing strategy

- **`virtualize()` unit tests** — fixture pairs: `input.ts` +
  `expected.virtualized.ts`. Snapshot drift catches regressions. This
  is the primary test surface because the virtualizer is a pure function.
- **Type-level correctness tests** — a new `virtualized-patterns.test-d.ts`
  in `packages/activerecord/dx-tests/`. Runs `expectTypeOf` /
  `assertType` assertions on fixture models that contain _only_ runtime
  calls. Runs under `trails-tsc`, not plain `tsc`, so the virtualization
  is exercised end-to-end.
- **Language-service integration test** — spawn `tsserver` with the
  plugin loaded, open a fixture, send a completion request at `record.|`,
  assert synthesized members appear.
- **Parity test** — same fixture file, two runs: one with the declares
  written by hand, one with only runtime calls + virtualization. Assert
  the two programs produce identical diagnostic output.

## Packaging & rollout

### Phase 1 — virtualizer + `trails-tsc`

- Land `packages/activerecord/src/type-virtualization/` (virtualize,
  walker, synthesize, type-registry).
- Land `packages/activerecord/src/tsc-wrapper/` shipping as
  `@blazetrails/activerecord/tsc` with `bin: trails-tsc`.
- Fixture-pair tests for every supported runtime call.
- Add `dx-tests/virtualized-patterns.test-d.ts` run under `trails-tsc`.
- Two-package composite fixture to verify `trails-tsc --build`
  correctly respects the virtualization across project references
  and build-info caching.

**Phase 1 exit criteria:**

- Virtualizer handles `attribute`, `hasMany`, `hasAndBelongsToMany`,
  `belongsTo`, `hasOne`, `scope`, `enum`, `defineEnum`.
- `trails-tsc` is byte-compatible with `tsc` for non-Base files
  (identical diagnostics).
- At least 3 in-repo models migrated by deleting their declares; repo
  typechecks under `trails-tsc`.
- CI runs `pnpm trails-tsc --noEmit` as a second typecheck job alongside
  plain `tsc` until the ecosystem is confident.

### Phase 2 — tsserver plugin

- Land `packages/activerecord/src/tsserver-plugin/` shipping as
  `@blazetrails/activerecord/tsserver-plugin`.
- Plugin intercepts `getScriptSnapshot` and reuses the same
  `virtualize()` from Phase 1.
- Repo's own `tsconfig.json` enables the plugin so contributors get live
  types for the in-repo models.
- Dogfood: all in-repo models migrated.

**Phase 2 exit criteria:**

- Plugin produces virtualized snapshots matching `trails-tsc` byte-for-byte.
- VS Code completions/quick-info/go-to-def work for synthesized members.
- Perf: plugin overhead <50 ms per file open on a repo with 500+ models.
- Documented install for VS Code, Zed, WebStorm, nvim (tier-1: VS Code).

### Phase 3 — docs + consumer-facing cutover

- Update CLAUDE.md, the declare catalog, website guides to show the
  zero-declare form as the default. Keep the declare pattern documented
  as an escape hatch.
- `declare-patterns.test-d.ts` becomes "manual escape hatches" and sits
  alongside `virtualized-patterns.test-d.ts` as the default.
- Publish consumer docs: one plugin line in `tsconfig.json`, swap `tsc`
  → `trails-tsc` in their typecheck script. That's the whole install.
- Audit third-party tools that invoke `tsc` (tsup, vite, esbuild,
  rollup, ts-node); document the drop-in path for each.

**Phase 3 exit criteria:**

- 100% of in-repo models use the virtualized path.
- Website "getting started" shows the zero-declare form.
- External consumers can follow the install doc top-to-bottom without
  reading this plan.

## Key design decisions

- **Packaging:** tooling ships as subpath exports on
  `@blazetrails/activerecord` (`/tsc`, `/tsserver-plugin`). One install,
  no version skew. `typescript` is a peer dependency.
- **User declares win.** Any hand-authored `declare <name>` is left
  alone; the virtualizer only injects members the user hasn't written.
- **Supported editor matrix:** VS Code is tier-1 (explicit install
  instructions, integration test). Zed, WebStorm, and nvim should work
  via the standard tsserver plugin mechanism and are covered on a
  case-by-case basis.
- **Both-sides association typing.** `Post.belongsTo("author")` and
  `Author.hasMany("posts")` each emit their own declares, with
  `import type` keeping runtime imports out of the virtualization loop.
- **Library publishing.** Authors who publish packages containing
  trails models compile with `trails-tsc --declaration`; emitted `.d.ts`
  bakes the injected declares in as real class members, so downstream
  consumers using plain `tsc` get correct types without opting into the
  wrapper.
- **Source-line fidelity.** `virtualize()` returns both transformed
  text and a line-delta table; the wrapper and plugin remap diagnostic
  ranges back to the user's coordinates before surfacing them.
- **Vitest integration.** Vitest's `typecheck.checker` accepts any
  executable, so `checker: "trails-tsc"` drops in alongside existing
  `pnpm test:types` workflows.

## Risks

| Risk                                                     | Mitigation                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Virtualizer drifts from runtime behavior                 | Type registry is shared with runtime attribute typing; parity test runs in CI                                |
| Bad target-class inference                               | Emitted `Foo` surfaces as a normal "cannot find name" error in the user's file; escape hatch is `className:` |
| Consumers run `tsc` directly (not `trails-tsc`)          | Fail loud: unvirtualized program prints "Property 'title' does not exist" exactly as today; docs call out    |
| Bundlers / other tools invoke `tsc` under the hood       | Audit common bundlers (tsup, vite, esbuild — most use their own parser, not `tsc`); doc the few that matter  |
| `tsc --build` / composite project references             | `trails-tsc` intended to support `--build`; verify build-info caching with a composite fixture in Phase 1    |
| tsserver plugin depends on TS language-service internals | Pin supported TS range; re-test per TS minor release; keep plugin logic to public `LanguageServiceHost` API  |
| Library consumers debugging "what TS sees"               | Ship `trails-tsc --print-virtualized <file>` to dump the synthesized source for any model                    |
| Source maps / go-to-definition off by N lines            | Virtualizer splices text at known offsets; remap ranges via the delta table returned from `virtualize()`     |
| Editor type mismatch during plugin boot                  | Plugin is purely additive — worst case during boot is the old "`unknown`" behavior, not a new wrong answer   |

## Non-goals

- Replacing the `declare` pattern entirely. It stays as the escape hatch
  for shapes the virtualizer can't infer.
- Runtime changes. Virtualization is purely type-level; runtime behavior
  is the source of truth.
- Auto-typing `where` / `order` / `pluck` column arguments. Still blocked
  on `Model`'s `[key: string]: unknown` index signature, which this plan
  does not remove.
- Full `tsc` feature parity on day one. `trails-tsc` targets the common
  typecheck flow (`--noEmit`, `--build`, `--watch`); exotic flags can be
  added as consumer bug reports arrive.

## Follow-ups once this is in

- **Association-option typing** — `belongsTo("author", { scope: (rel) => ... })`
  can narrow `rel` to `Relation<Author>` because the virtualizer knows
  the target. Doable once the walker already has the inference data.
- **Attribute-keyed query args** — still blocked on removing the
  `[key: string]: unknown` index signature.
- **Enum value-label union types** — `defineEnum(..., { draft: 0, published: 1 })`
  → union over the mapping keys.
- **External consumer adoption metrics** — once Phase 3 lands, track how
  many downstream projects run `trails-tsc` vs. plain `tsc`.
