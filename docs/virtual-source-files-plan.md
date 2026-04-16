# Plan: Auto-Typed Models via Virtual Source Files

Status: **proposal / planning draft** (Rails-fidelity revision).
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
declare comments: Comment[]; // becomes AssociationProxy<Comment> after Phase R
declare author: Author | null;
declare static published: () => Relation<Post>;
```

Every attribute / association / scope / enum is typed twice — once in the
runtime call, once in the manual `declare`. Copying is error-prone (typos,
wrong target class, stale declares after a rename).

**Goal:** writing the runtime call alone is enough for the type system to
see the member. Zero `declare` for the common case.

## Rails fidelity is the bar

The plan now explicitly calls for runtime changes where the existing
runtime diverges from Rails. Backwards compatibility is **not** a
constraint — pre-1.0 trails has no external consumers depending on the
divergence, and getting the runtime right is what makes the virtualizer
output honest.

The first divergence this plan addresses:

- **`blog.posts` returns `Base[]` today; Rails returns a `CollectionProxy`.**
  Rails (`activerecord/lib/active_record/associations/collection_association.rb#reader`):
  `@proxy ||= CollectionProxy.create(klass, self); @proxy.reset_scope`.
  CollectionProxy inherits from Relation and is awaitable / chainable.
  Trails' `AssociationProxy<T>` is the exact analog. The
  `CollectionProxy` class lives in
  `packages/activerecord/src/associations/collection-proxy.ts` and the
  `new Proxy(...)` wrapper that adds Relation delegation is in
  `packages/activerecord/src/associations.ts` (`wrapCollectionProxy`).
  It just isn't wired into the reader. Phase R below swaps it in.

Other surfaces (`belongsTo` / `hasOne` returning the record or null,
`scope` returning a Relation, attribute getters returning the typed
value) already match Rails; no runtime change needed.

The second divergence this plan addresses:

- **Sync access to unloaded `post.author` silently returns `null`.**
  Rails would have lazy-loaded; trails today returns `this.target` —
  whatever happens to be cached. That's a footgun: `if (post.author)`
  may be `false` because nobody preloaded, not because there is no
  author. Phase R.3 below adopts the Rails-style strict-loading
  posture: sync access to an unloaded association throws
  `StrictLoadingViolationError` (the error type already exists in
  trails, currently optional). The fix is preloading via
  `Post.includes("author")` or `await post.loadBelongsTo("author")`
  — the same pattern Rails users already write to avoid N+1.

**Pragmatic divergences left in place (out of scope for this plan):**

- **Enum predicate / bang naming.** Rails: `post.draft?` / `post.draft!`.
  TypeScript can't have `?` or `!` in identifiers, so trails uses
  `post.isDraft()` / `post.draftBang()`. Permanent deviation — TS
  identifier rules.

## Before / after

**Before (today — Phase R hasn't landed yet):**

```ts
// post.ts
import { Base, Relation } from "@blazetrails/activerecord";
import { Author } from "./author.js";
import { Comment } from "./comment.js";

class Post extends Base {
  declare title: string;
  declare comments: Comment[]; // Phase R will flip this to AssociationProxy<Comment>
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
the matching `declare` members spliced in. Nothing else exists.

## Design

### Two entry points, one package, one transform

The virtualization logic — "given a source file, return a transformed
source with `declare` members injected inline" — is the entire product.
It ships as a single module inside `@blazetrails/activerecord` with two
shells around it:

1. **CLI shell: `@blazetrails/activerecord/tsc` (bin: `trails-tsc`)** —
   thin wrapper around `ts.createProgram` with a custom `ts.CompilerHost`
   whose `getSourceFile` and `readFile` apply the virtualization.
2. **Editor shell: `@blazetrails/activerecord/tsserver-plugin`** — a
   TypeScript language-service plugin. Intercepts
   `LanguageServiceHost.getScriptSnapshot` and returns the virtualized
   snapshot per file.

Both shells call the same `virtualize(source, fileName, options?)`
function. Same AST walker, same declaration synthesizer, same type
registry.

### The virtualize function

```ts
// packages/activerecord/src/type-virtualization/virtualize.ts
export interface VirtualizeResult {
  text: string;
  deltas: LineDelta[]; // injected-line offsets; consumed by diagnostic remapping
}
export interface VirtualizeOptions {
  baseNames?: readonly string[]; // root class allow-list (default ["Base"])
  prependImports?: readonly string[]; // `import type` lines to splice at file top
}
export function virtualize(
  originalText: string,
  fileName: string,
  options?: VirtualizeOptions,
): VirtualizeResult;
```

Operation is purely syntactic; no `ts.Program` or `TypeChecker` is
needed. The `prependImports` option lets the CLI / plugin shell — which
does hold a `Program` — feed pre-resolved `import type` lines for
target classes the user didn't import. See "Auto-import resolution"
under Phase 1b.

Steps:

1. Parse `originalText` with `ts.createSourceFile`.
2. Walk top-level class declarations whose `heritageClauses` contain an
   `extends` identifier in the configured allow-list (default `["Base"]`).
3. For each matched class, walk every `ClassStaticBlockDeclaration` and
   collect runtime calls.
4. Map each call to a `declare` member string via the runtime call →
   declaration table below.
5. Splice the rendered declares immediately after each affected class
   body's opening `{`, recording `LineDelta` entries so the wrapper /
   plugin can remap diagnostics back to user coordinates.

### Transitive extends

`class Admin extends User` — where `User extends Base` — is real:

- A **symbol-aware walker pass** (held by the CLI / plugin, not by
  `virtualize()` itself) holds a `ts.Program` / `TypeChecker`, resolves
  each class's extends chain to its root, and produces the allow-list
  passed to `virtualize()` per file.
- `virtualize()` stays pure and unit-testable.

### Runtime call → declaration mapping

| Runtime call                                                    | Injected declaration                                                                                                                                          | Target inference                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `this.attribute(name, "string", opts?)`                         | `declare name: string;`                                                                                                                                       | literal `"string" \| "integer" \| ...` → `string \| number \| ...`                                   |
| `this.attribute(name, "string", { default: ..., null: false })` | `declare name: string;`                                                                                                                                       | `null: false` drops nullability                                                                      |
| `this.hasMany(name, opts?)`                                     | `declare name: AssociationProxy<TargetClass>;`                                                                                                                | `classify(name)` (which composes `camelize(singularize(...))`) or `opts.className`                   |
| `this.hasAndBelongsToMany(name)`                                | `declare name: AssociationProxy<TargetClass>;`                                                                                                                | same                                                                                                 |
| `this.belongsTo(name)`                                          | `declare name: TargetClass \| null;`                                                                                                                          | `classify(name)` or `opts.className`                                                                 |
| `this.hasOne(name)`                                             | `declare name: TargetClass \| null;`                                                                                                                          | same                                                                                                 |
| `this.scope(name, fn)`                                          | `declare static name: (...args: ScopeArgs) => Relation<ThisClass>;` where `ScopeArgs` is `fn`'s parameter list with the leading `Relation<ThisClass>` dropped | extract the inline `fn` expression's parameters, drop the first (`rel`), preserve the rest literally |
| `this.enum(attr, map, opts?)`                                   | per-value: `declare is<Value>: () => boolean; declare <value>Bang: () => this; declare static <value>: () => Relation<ThisClass>;`                            | `Base.enum` shape; honors `prefix` / `suffix` options                                                |
| `defineEnum(Class, attr, map, opts?)`                           | richer shape: + `declare <value>: () => void; declare <value>Bang: () => Promise<void>; declare static not<Value>: () => Relation<ThisClass>;`                | per `src/enum.ts`; honors `prefix` / `suffix`                                                        |

`AssociationProxy<T>` is the existing chainable, awaitable Rails-style
collection surface. Once Phase R lands the runtime change, the type the
virtualizer emits and what `blog.posts` returns at runtime will agree.

### Target-class resolution

Inside the virtualizer, target-class names are **strings**, not types.
Rules:

1. If options include `className: "Foo"`, emit `Foo`.
2. Otherwise apply Rails inflection from `@blazetrails/activesupport`
   (`classify("posts")` → `Post`; `classify` already singularizes
   internally).
3. If `Foo` is in scope in the user's file (already imported, or the
   model class lives in the same file), TS resolves it normally.
4. If `Foo` is **not** in scope, the CLI / plugin shell auto-injects
   `import type { Foo } from "<relative-path>";` into the virtualized
   text using the model-name → file-path map produced by the
   symbol-aware walker (see Phase 1b). Result: zero-declare files also
   need zero-import ceremony for sibling models.
5. If `Foo` isn't in scope **and** isn't found in the program at all
   (e.g. `hasMany("commentz")` typo, or a model outside the
   compilation), TS raises `Cannot find name 'Commentz'` against the
   injected declare. The user sees the exact missing name and fixes
   the call site.

`className: "..."` mirrors Rails' `class_name:`.

### Handling polymorphic / through / aliasAttribute

- `polymorphic: true` → emit `name: Base | null`. Narrowing beyond
  `Base` is user-side (runtime branch on `<name>_type`).
- `through:` → walk both associations to pick up the final target type.
- `aliasAttribute(new, old)` → alias carries the resolved type of the
  original.

### Escape hatches

- **Opt out per class:** `/** @trails-typegen skip */` JSDoc above the
  class declaration — virtualizer skips that class entirely.
- **Manual override per member:** any hand-authored `declare <name>` the
  user writes _wins_ — the virtualizer detects existing members by name
  and skips injection for collisions. Useful for polymorphic narrowing
  and members the synthesizer can't infer.

### Rails fidelity (recap)

- **Same call surface.** `this.attribute(...)`, `this.hasMany(...)`, etc.
  read identically to Rails.
- **Same naming conventions.** `classify` (which composes
  `camelize(singularize(...))`) and `class_name:` come from
  `@blazetrails/activesupport`.
- **Same return shapes after Phase R.** `blog.posts` is the Rails-style
  CollectionProxy/AssociationProxy; `post.author` is the loaded record
  or null; `Post.published()` is a Relation.

### Shared internals

Both shells share one module tree, all inside
`packages/activerecord/src/type-virtualization/`:

1. **`virtualize.ts`** — pure text-transform.
2. **`walker.ts`** — finds matching classes and extracts runtime calls.
   Symbol-aware transitive-extends pass also lives here.
3. **`synthesize.ts`** — renders one declaration string per call.
4. **`type-registry.ts`** — Rails attribute type → TypeScript type.

### Testing strategy

- **`virtualize()` unit tests** — fixture pairs (input.ts +
  expected.ts). Snapshot drift catches regressions.
- **Type-level correctness** — `dx-tests/virtualized-patterns.test-d.ts`
  exercising the synthesized members under `trails-tsc`.
- **Language-service integration** — spawn `tsserver` with the plugin,
  open a fixture, send completion at `record.|`, assert synthesized
  members appear.
- **Parity** — same fixture, two runs (manual declares vs. virtualized).
  Diagnostic output must match.
- **Runtime parity (new)** — for the Phase R reader change, verify
  `for (const p of blog.posts)`, `blog.posts.length`, `blog.posts[0]`,
  `blog.posts.map(...)`, and `await blog.posts` all behave the same as
  the previous `Base[]` while also unlocking `blog.posts.where(...)`.

## Packaging & rollout

Status legend: ✅ merged, 🚧 in flight, 📋 planned.

### Phase 0 — decorator-flag cleanup ✅ (#528)

Removed `experimentalDecorators` / `emitDecoratorMetadata` from the
four tsconfigs that carried them.

### Phase 1a — virtualize() pure text transform ✅ (#529)

Landed `packages/activerecord/src/type-virtualization/` (virtualize,
walker, synthesize, type-registry). 27 passing tests, 18 fixture pairs.
Emitted `Target[]` for hasMany / HABTM as of landing; Phase 1a-fixup
(#539) flipped this to `AssociationProxy<Target>` after R.2 merged.

### Phase R — Rails-fidelity runtime fix ✅ (R.1 ✅ → R.2 ✅ → R.3 ✅)

Made `blog.posts` (and every collection association reader) return the
existing `AssociationProxy<T>` instead of `Base[]`, and adopted
strict-loading semantics for singular readers. Pre-1.0 breaking
changes — by design.

Three sub-PRs, all merged:

- **R.1 — make CollectionProxy a drop-in for arrays ✅ (#532).**
  Added `Symbol.iterator`, `length`, numeric indexing (via the JS
  Proxy `get` trap on string-coerced numeric keys), and the array
  prototype methods consumers actually use (`map`, `filter`,
  `forEach`, `some`, `every`, `slice`, `reduce`, `at`, `flatMap`,
  `indexOf`, `keys`, `entries`). Each delegates to the loaded
  `_target`. `Array#find` / `Array#includes(record)` / `Array#values()`
  were deliberately **not** added — they would shadow Relation methods
  (`find(id)` PK lookup, `includes(...associations)` eager loading,
  `values(): Record<string, unknown>` query state). Also added an
  `[index: number]: T | undefined` index signature on
  `AssociationProxy` for typed bracket access, and routed the
  thenable through `load()` (was `toArray()`) so `await proxy`
  hydrates `_target`. Zero regressions.

- **R.2 — swap the reader ✅ (#536).** Overrode `defineReaders` in
  `packages/activerecord/src/associations/builder/collection-association.ts`
  so the `<name>` getter returns `association(this, name)` (the
  AssociationProxy) instead of `this.association(name).reader`.
  Writers (`blog.posts = [...]`) stay routed through `defineWriters`
  as today — the setter is preserved by the base `defineWriters`
  reading the existing getter descriptor and overlaying only `set`.
  Concrete update list:
  - `packages/activerecord/src/associations/builder/collection-association.ts` (the reader override)
  - `packages/activerecord/dx-tests/declare-patterns.test-d.ts` (lines ~62, ~175 — the `declare comments: Comment[]` pattern + matching test name)
  - `packages/activerecord/dx-tests/associations.test-d.ts` (line ~101)
  - `packages/activerecord/src/associations.test.ts` audit for `.posts.length` / `.posts.map(...)` / `for (const ... of blog.posts)` patterns (~3 hits today; all stay green via R.1's array-likeness)
  - `CLAUDE.md` — the declare catalog snippet (`declare posts: Post[]` → `declare posts: AssociationProxy<Post>`); update the prose around "synchronous reader" too
  - `docs/activerecord-rails-deviations.md` — record that the collection reader is now Rails-faithful (negative deviation removed)
  - `AssociationProxy` is already exported from
    `@blazetrails/activerecord` (verified — see
    `packages/activerecord/src/index.ts`); no new export needed.

  Side benefit: `blog.posts.published()` and other named scopes start
  type-checking through the existing `AssociationProxy<T>` Proxy
  delegation, matching Rails' `blog.posts.published`.

- **R.3 — strict-loading catches sync singular-reader access ✅ (#543).**
  Previously `post.author` returned `this.target` (the cached record
  or `null`) — silently `null` when nobody preloaded. Under strict
  loading, sync access on an unloaded singular association now throws
  `StrictLoadingViolationError` with a message naming the association
  and pointing at the fix (`Post.includes("author")` or
  `await post.loadBelongsTo("author")`). The error type is already
  defined in
  trails (`packages/activerecord/src/errors.ts`); today, direct
  property access still returns the cached target, but strict loading
  can already raise via the explicit lazy-load helpers / proxy-delegated
  loads when `strictLoading` is opted in. R.3 generalizes the rule to
  singular reader access itself:
  - **Singular reader (`belongsTo` / `hasOne`):** sync access throws
    if the association has never been loaded AND the FK is non-null.
    Loaded-and-`null` (FK is null) returns `null` cleanly — that's a
    real answer.
  - **Collection reader (`hasMany` / HABTM):** the AssociationProxy
    from R.2 is awaitable; iterating sync uses the loaded `_target`,
    same as R.1. Strict loading on iterating-while-unloaded is a
    natural follow-up but not required for R.3.
  - **Per-instance opt-out:** `record.strictLoading = false` (matches
    Rails' instance-level toggle).
  - **Class-level opt-out:** `Post.strictLoadingByDefault = false`
    (matches Rails' `self.strict_loading_by_default = false` on the
    model).
  - **Global opt-out:** initializer-style switch under
    `ActiveRecord::Base` for project-wide off — symmetric with Rails'
    `config.active_record.strict_loading_by_default = true`.
  - Audit + update tests that rely on silent-`null` behavior. Likely
    finds real latent bugs (the whole point).
  - Synergy with `includes` / `preload`: those already populate the
    cache, so preloaded records pass the sync-access check
    transparently. The error message thrown by
    `StrictLoadingViolationError.forAssociation` names the model and
    association; users reach for `Post.includes("author")` or
    `await post.loadBelongsTo("author")` as the fix.

  Virtualizer-side: no change. `declare author: Author | null;` stays
  honest — at sync access time the value really is the loaded record
  or `null` (or the access threw, which TS doesn't model anyway).

**Phase R exit criteria:**

- `blog.posts` returns the AssociationProxy at runtime.
- All existing array-style consumers (`for ... of`, `.length`, `.map`,
  indexed access) still work via the additive surface from R.1.
- `blog.posts.where(...).order(...).limit(...)` works without the
  `association(blog, "posts")` helper.
- CLAUDE.md updated; declare catalog references the new shape.
- `pnpm api:compare` is unchanged or up (the swap removes a fidelity
  divergence from the runtime; tests stay where they were).
- Sync access to an unloaded singular association throws
  `StrictLoadingViolationError` by default; preloaded access returns
  the record cleanly; FK-null access returns `null`.
- Per-instance, per-class, and global strict-loading toggles all work
  and match Rails' surface (`record.strictLoading`,
  `Class.strictLoadingByDefault`, project-wide config switch).

### Phase 1a-fixup — flip virtualizer to `AssociationProxy<T>` ✅ (#539)

Once R.2 landed, `synthesize.ts` flipped from
`declare ${name}: ${target}[];` to
`declare ${name}: AssociationProxy<${target}>;` for hasMany /
hasAndBelongsToMany. Updated matching fixtures
(`02-has-many/expected.ts`, `13-has-and-belongs-to-many/expected.ts`,
`08-combined/expected.ts`, `11-class-name-override/expected.ts`). Also
qualified the emitted `AssociationProxy` / `Relation` built-ins with
inline `import("@blazetrails/activerecord").<Type>` so zero-declare
user files don't need to import those types either. One file in
source + multiple fixture updates; no behavior change beyond emit.

### Phase 1b — `trails-tsc` CLI shell 📋

The CLI that users opt into by swapping `tsc` for `trails-tsc` in
their typecheck script. Biggest phase by surface area, so broken into
**six sub-PRs**, each independently testable and shippable:

| PR   | Name                                            | Depends on | Blocks                    |
| ---- | ----------------------------------------------- | ---------- | ------------------------- |
| 1b.1 | CLI skeleton + single-file virtualization       | —          | 1b.2, 1b.3                |
| 1b.2 | Diagnostic range remap                          | 1b.1       | —                         |
| 1b.3 | Transitive-extends walker                       | 1b.1       | 1b.4                      |
| 1b.4 | Auto-import resolution                          | 1b.3       | 1b.5, 1b.6                |
| 1b.5 | `--build` / composite project support           | 1b.4       | —                         |
| 1b.6 | In-repo migration + CI + `virtualized-patterns` | 1b.4       | Phase 2 (tsserver plugin) |

Each sub-section below is scoped so a contributor can pick it up,
ship it, and merge without the rest of Phase 1b landing first. After
all six merge, Phase 1b's exit criteria (bottom of this section) are
satisfied and Phase 2 (tsserver plugin) is unblocked.

---

#### 1b.1 — CLI skeleton + single-file virtualization 📋

**Goal:** `trails-tsc` runs, produces tsc-compatible output, and
virtualizes any source file whose top-level class declaration
literally extends `Base`. Enough to demo zero-declare on a flat
single-file model.

**Deliverables:**

- `packages/activerecord/src/tsc-wrapper/`:
  - `cli.ts` — entry for the bin; argv parsing (minimally: `-p`
    tsconfig path, `--noEmit`, passthrough of everything else).
  - `program.ts` — `createTrailsProgram(options)` wrapping
    `ts.createProgram` with the custom host.
  - `host.ts` — `buildCompilerHost(options)` overriding
    `getSourceFile` / `readFile` to run `virtualize()` on matching
    files.
- `@blazetrails/activerecord/tsc` subpath export in
  `packages/activerecord/package.json`.
- `bin: trails-tsc` pointing at the compiled CLI entry.
- Integration test: fixture `post.ts` with
  `this.attribute("title", "string")` and no manual declares; invoke
  the CLI programmatically; assert `(new Post()).title` types as
  `string` end-to-end with zero diagnostics.

**Non-goals (deferred to later sub-PRs):** transitive extends,
auto-import, `--build`, diagnostic remap.

**Exit:** `pnpm build` / `pnpm typecheck` clean; one fixture
integration test passing; `trails-tsc --noEmit -p fixture/tsconfig.json`
runs from the command line and returns 0.

---

#### 1b.2 — Diagnostic range remap 📋

**Goal:** user-facing error messages reference the user's original
line numbers, not virtualized ones. Lands right after the CLI skeleton
because wrong line numbers make the zero-declare DX regress vs. plain
`tsc` from day one.

**Deliverables:**

- CLI wraps `ts.formatDiagnostics` /
  `ts.formatDiagnosticsWithColorAndContext`.
- Per-file `LineDelta[]` table stored on the `CompilerHost` (keyed by
  absolute path) alongside the virtualized text.
- `remapLine` (already exported from `virtualize()`) applied to each
  diagnostic's start/end ranges before printing.
- Edge case: error INSIDE an injected declare block (shouldn't happen
  when the virtualizer is correct, but if it does, report at the
  original class body's opening `{` with a note pointing at
  `--print-virtualized` for debugging).
- `trails-tsc --print-virtualized <file>` subcommand — dumps the
  synthesized source for any model file. Ships here for
  debuggability.
- Integration test: fixture with a genuine type error in user code
  AFTER a class body that gets declares injected. Assert the
  reported line matches the original line, not the shifted
  virtualized line.

**Exit:** every diagnostic reported by `trails-tsc` matches the line
number a user would have seen with plain `tsc` against the "before"
(declare-heavy) form of the same file.

---

#### 1b.3 — Transitive-extends walker 📋

**Goal:** `class Admin extends User` (where `User extends Base`) is
virtualized. Most real codebases have an abstract intermediate class
like `ApplicationRecord`.

**Deliverables:**

- `packages/activerecord/src/type-virtualization/transitive-extends-walker.ts`:
  - Takes a `ts.Program` + `ts.TypeChecker`.
  - Walks every top-level class declaration, resolves each `extends`
    clause to its symbol, follows transitively to root.
  - Returns the set of class names whose `extends` chain ends at
    `Base` (or any configured root).
  - Caches per-program — walker runs once, not per file.
- CLI wiring: compute the allow-list once per program, pass via
  `VirtualizeOptions.baseNames` so `virtualize()` treats every
  transitive descendant as a Base-rooted class.
- Fixture: three files — `base.ts` exports `Base`, `user.ts` defines
  `class User extends Base`, `admin.ts` defines
  `class Admin extends User`. `admin.ts`'s
  `this.attribute("role", "string")` results in
  `declare role: string;` being injected on Admin's class body (the
  transitive walker recognizes Admin as a Base descendant).

**Exit:** transitive-extends fixture passes; flat `extends Base` case
from 1b.1 still works.

---

#### 1b.4 — Auto-import resolution 📋

**Goal:** zero-declare AND zero-import model files. User writes
`this.hasMany("comments")`; `Comment` is auto-imported from wherever
it lives in the program.

**Deliverables:**

- Walker step extends the transitive-extends pass to also produce a
  model registry:

  ```ts
  type ModelRegistry = Map<string, string>; // class name → absolute source path
  // e.g. { "Comment" → "/abs/comment.ts", "Author" → "/abs/author.ts" }
  ```

- CLI per-file pipeline:
  1. Collect target class names referenced by the file's association
     calls (post-`className:` override / Rails inflection).
  2. Subtract names already in scope (existing imports, local
     declarations, same-file classes).
  3. Look remaining names up in the registry; compute relative paths
     from the source file's directory to each target's file (with
     the `.js` suffix ESM TypeScript wants); build
     `import type { Name } from "<relative>";` lines.
  4. Pass the resulting list as `VirtualizeOptions.prependImports`.
- `virtualize()` gains `prependImports?: readonly string[]` (already
  spec'd in the § "The virtualize function" signature — implement
  now). Splice lines at the top of the file before the rest of the
  transform; `LineDelta` accounting absorbs the prepended lines so
  1b.2's diagnostic remap stays accurate.
- `import type` keeps injected imports erased at runtime — no
  module-load cycles.
- Failure modes handled:
  - Name collisions (two `Comment` classes in different paths): log
    a `trails-tsc` diagnostic; pick closest-by-path, then
    lexicographic. Document `className:` as the disambiguation.
  - Class not in the program: no auto-import; TS surfaces
    `Cannot find name 'X'` against the injected declare.
  - User explicitly imports a different class with the same name:
    their existing import wins; wrapper does not shadow.
- Fixture: two files. `post.ts` has
  `class Post extends Base { static { this.belongsTo("author"); } }`
  with NO `import` for Author. `author.ts` exports `Author`. Verify
  `post.author` types as `Author | null` under `trails-tsc` with no
  user-written imports for Author.

**Exit:** auto-import fixture passes; single-file (1b.1) and
transitive (1b.3) cases still work.

---

#### 1b.5 — `--build` / composite project support 📋

**Goal:** users with `tsc --build` / `references:` in their tsconfigs
get the same behavior as the `--noEmit` path. Matters for monorepos.

**Deliverables:**

- CLI supports `--build` / `-b`: delegates to
  `ts.createSolutionBuilder` with the custom host applied to each
  project in the solution.
- Build-info caching audit: a `.tsbuildinfo` file written by a
  pre-virtualization run must not leak incorrect diagnostics.
  Either invalidate when `trails-tsc` first sees the project, or
  scope the tsbuildinfo path per-tool.
- Two-package composite fixture: `@fixture/models` owns the
  Base-rooted classes; `@fixture/app` imports from it and declares
  local models that use `@fixture/models`' classes as association
  targets. Both compile under `trails-tsc --build`.
- Integration test: modify an attribute on a model; re-run
  `trails-tsc --build`; assert the new declares are reflected and
  dependents type-check.

**Exit:** composite fixture passes; docs call out `--build` in the
consumer install path.

---

#### 1b.6 — In-repo migration + CI + `virtualized-patterns.test-d.ts` 📋

**Goal:** dogfood, close the loop. Delete manual declares from in-repo
models, wire CI to catch regressions, add the parallel dx-tests
reference that exercises the zero-declare form end-to-end.

**Deliverables:**

- Pick ≥3 models from the repo's packages or dx-tests fixtures that
  currently carry `declare` lines. Delete those declares; verify
  `trails-tsc --noEmit` still typechecks the repo.
- New CI job in `.github/workflows/ci.yml`:
  `pnpm trails-tsc --noEmit` runs alongside the existing
  `pnpm typecheck` job. Both must pass for PRs to merge.
- `packages/activerecord/dx-tests/virtualized-patterns.test-d.ts` —
  parallel structure to `declare-patterns.test-d.ts`, but the model
  classes carry zero declares and are verified via `expectTypeOf`
  assertions under `trails-tsc` (invoked via Vitest's
  `typecheck.checker` config — confirmed feasible in the original
  Spike 5).
- CLAUDE.md update: `declare-patterns.test-d.ts` becomes "manual
  escape hatches reference"; `virtualized-patterns.test-d.ts`
  becomes the default "here's what `trails-tsc` injects" reference.
- Vitest typecheck config: point `typecheck.checker` at `trails-tsc`
  for the activerecord dx-tests so typecheck-mode runs use the
  virtualizer end-to-end.

**Exit:** repo green with declares removed from ≥3 models; CI runs
the new job; dx-tests cover both forms; CLAUDE.md updated.

---

**Phase 1b exit criteria (satisfied after 1b.1–1b.6 merge):**

- `trails-tsc` is byte-compatible with `tsc` for non-Base files
  (identical diagnostics).
- Transitive extends, auto-import, `--build` all work.
- Diagnostic ranges map back to user source lines.
- At least 3 in-repo models migrated by deleting their declares;
  repo typechecks under `trails-tsc`.
- CI runs `pnpm trails-tsc --noEmit` as a second typecheck job
  alongside plain `tsc`.
- `virtualized-patterns.test-d.ts` ships as the canonical
  zero-declare reference.

### Phase 2 — tsserver plugin 📋

- Land `packages/activerecord/src/tsserver-plugin/` shipping as
  `@blazetrails/activerecord/tsserver-plugin`.
- Plugin intercepts `getScriptSnapshot` and reuses the Phase 1
  `virtualize()`.
- Repo's own `tsconfig.json` enables the plugin.

**Phase 2 exit criteria:**

- Plugin produces virtualized snapshots matching `trails-tsc`
  byte-for-byte.
- VS Code completions / quick-info / go-to-def work for synthesized
  members.
- Perf: plugin overhead <50 ms per file open on a repo with 500+
  models.
- Documented install for VS Code, Zed, WebStorm, nvim (tier-1: VS
  Code).

### Phase 3 — docs + consumer cutover 📋

- Update CLAUDE.md, the declare catalog, website guides to show the
  zero-declare form as the default.
- `declare-patterns.test-d.ts` becomes "manual escape hatches"; the
  virtualized-patterns suite becomes the default reference.
- Publish consumer docs: one plugin line in `tsconfig.json`, swap `tsc`
  → `trails-tsc` in their typecheck script.
- Audit third-party tools that invoke `tsc` (tsup, vite, esbuild,
  rollup, ts-node); document the drop-in path for each.

**Phase 3 exit criteria:**

- 100% of in-repo models use the virtualized path.
- Website "getting started" shows the zero-declare form.
- External consumers can follow the install doc top-to-bottom without
  reading this plan.

### Ordering

The dependency graph:

```
Phase 0 ✅ (#528)
   │
   ├── Phase 1a ✅ (#529)
   │       │
   │       └── Phase 1a-fixup ✅ (#539)  — AssociationProxy<T> emit
   │
   ├── Phase R ✅
   │      R.1 ✅ additive array-likeness on CollectionProxy   (#532)
   │      R.2 ✅ swap collection reader → AssociationProxy    (#536)
   │      R.3 ✅ strict-loading catches sync singular reader  (#543)
   │
   ├── Singular loaders ✅ (#541)  — post.loadBelongsTo(...) / post.loadHasOne(...)
   │
   └── Phase 1b 📋 — needs Phase 1a + Phase R (all done, unblocked)
         │
         ├── 1b.1 CLI skeleton + single-file virtualization
         ├── 1b.2 Diagnostic remap          (after 1b.1)
         ├── 1b.3 Transitive-extends walker (after 1b.1)
         ├── 1b.4 Auto-import resolution    (after 1b.3)
         ├── 1b.5 --build support           (after 1b.4)
         └── 1b.6 In-repo migration + CI    (after 1b.4)
                  │
                  └── Phase 2 📋 — tsserver plugin (needs 1b.6's dx-tests)
                        │
                        └── Phase 3 📋 — docs + consumer cutover
```

All prerequisite work is merged. Phase 1b is the next stretch — six
sub-PRs totaling the CLI shell and associated dogfooding. 1b.1 and
1b.2 are independent of each other after the skeleton lands, so two
contributors can work in parallel. 1b.3 and 1b.4 serialize; 1b.5 and
1b.6 can run in parallel after 1b.4.

## Key design decisions

- **Packaging:** tooling ships as subpath exports on
  `@blazetrails/activerecord` (`/tsc`, `/tsserver-plugin`). One
  install, no version skew. `typescript` is a peerDependency.
- **User declares win.** Hand-authored `declare <name>` is left alone.
- **Editor matrix:** VS Code tier-1 (explicit install steps,
  integration test). Zed / WebStorm / nvim should work via the
  standard tsserver plugin mechanism.
- **Both-sides association typing.** `Post.belongsTo("author")` and
  `Author.hasMany("posts")` each emit their own declares.
- **Library publishing.** `trails-tsc --declaration` bakes injected
  declares into emitted `.d.ts`, so downstream consumers using plain
  `tsc` get correct types.
- **Source-line fidelity.** `virtualize()` returns transformed text
  plus a line-delta table; wrapper / plugin remap diagnostic ranges
  back to user coordinates before surfacing.
- **Vitest integration.** `typecheck.checker` accepts any executable,
  so `checker: "trails-tsc"` drops in.

## Risks

| Risk                                                      | Mitigation                                                                                                                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase R breaks consumers of `blog.posts` as an array      | R.1 (additive array-likeness on CollectionProxy) lands first and stays green; R.2 only flips the reader once R.1 covers every consumer pattern in the in-repo test suite                                                               |
| R.3 strict loading surfaces latent bugs in existing tests | Expected and intended — silent-null bugs are the whole reason for R.3. Audit pass updates real bugs; remaining cases that legitimately want "loaded-or-null without a throw" use `record.strictLoading = false` or eager-load up front |
| Virtualizer drifts from runtime behavior                  | Type registry is shared with runtime attribute typing; parity test runs in CI                                                                                                                                                          |
| Bad target-class inference                                | Emitted `Foo` surfaces as a normal "cannot find name" error in the user's file; escape hatch is `className:`                                                                                                                           |
| Auto-import picks the wrong `Foo` on name collisions      | Walker logs a diagnostic; resolver picks closest-by-path then lexicographic; user disambiguates via `className:` (or moves the model)                                                                                                  |
| Consumers run `tsc` directly (not `trails-tsc`)           | Fail loud: unvirtualized program prints "Property 'title' does not exist" exactly as today; docs call out                                                                                                                              |
| Bundlers / other tools invoke `tsc` under the hood        | Audit common bundlers (tsup, vite, esbuild — most use their own parser, not `tsc`); doc the few that matter                                                                                                                            |
| `tsc --build` / composite project references              | `trails-tsc` intended to support `--build`; verify build-info caching with a composite fixture in Phase 1b                                                                                                                             |
| tsserver plugin depends on TS language-service internals  | Pin supported TS range; re-test per TS minor release; keep plugin logic to public `LanguageServiceHost` API                                                                                                                            |
| Library consumers debugging "what TS sees"                | Ship `trails-tsc --print-virtualized <file>` to dump the synthesized source for any model                                                                                                                                              |
| Source maps / go-to-definition off by N lines             | Virtualizer splices text at known offsets; remap ranges via the delta table returned from `virtualize()`                                                                                                                               |
| Editor type mismatch during plugin boot                   | Plugin is purely additive — worst case during boot is the old "`unknown`" behavior, not a new wrong answer                                                                                                                             |

## Non-goals

- Replacing the `declare` pattern entirely. Stays as the escape hatch
  for shapes the virtualizer can't infer.
- Auto-typing `where` / `order` / `pluck` column arguments. Still
  blocked on `Model`'s `[key: string]: unknown` index signature.
- Full `tsc` feature parity on day one. `trails-tsc` targets the
  common typecheck flow (`--noEmit`, `--build`, `--watch`); exotic
  flags can be added as consumer bug reports arrive.
- Backwards compatibility with the current `Base[]` reader shape (see
  Phase R rationale).

## Follow-ups once this is in

- **Association-option typing** —
  `belongsTo("author", { scope: (rel) => ... })` can narrow `rel` to
  `Relation<Author>` because the virtualizer knows the target.
- **Attribute-keyed query args** — still blocked on removing
  `Model`'s `[key: string]: unknown` index signature.
- **Enum value-label union types** — `defineEnum(..., { draft: 0, published: 1 })`
  → union over the mapping keys.
- **External consumer adoption metrics** — once Phase 3 lands, track
  how many downstream projects run `trails-tsc` vs. plain `tsc`.
