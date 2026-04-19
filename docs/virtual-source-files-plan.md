# Plan: Auto-Typed Models via Virtual Source Files

Status: **Phase 1b shipped; Phase 2 (tsserver plugin) planning.**
Last updated: 2026-04-16.

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

### Completed phases (#528 through Phase 1b PRs)

- **Phase 0 (#528)** — removed `experimentalDecorators` /
  `emitDecoratorMetadata` from the four tsconfigs that carried them.
- **Phase 1a (#529)** — `packages/activerecord/src/type-virtualization/`
  landed (virtualize, walker, synthesize, type-registry).
- **Phase R (#532, #536, #543)** — made `blog.posts` return
  `AssociationProxy<T>` instead of `Base[]`, added strict-loading for
  singular readers, and made the proxy array-like so existing consumers
  keep working.
- **Phase 1a-fixup (#539)** — `synthesize.ts` now emits
  `declare <name>: AssociationProxy<target>;` for hasMany / HABTM,
  with inline `import("@blazetrails/activerecord").<Type>` qualification
  so zero-declare files don't need extra imports.
- **Phase 1b** — six sub-PRs building the `trails-tsc` CLI shell: driver
  that virtualizes Base-extending files before tsc, diagnostic remap
  back to user coordinates, composite `--build` support, auto-import
  injection for associated types, and the `virtualized-dx-tests/`
  canonical zero-declare reference. CI runs `pnpm trails-tsc --noEmit`
  as a second typecheck job alongside plain tsc.

### Phase 2 — tsserver plugin 📋

The **editor** shell that brings the same virtualization the CLI does
to IDE autocomplete, hover, go-to-definition, rename, find-references,
and inline diagnostics. Users opt in with one line in their
`tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "@blazetrails/activerecord/tsserver-plugin" }],
  },
}
```

Broken into **six sub-PRs**, mirroring the Phase 1b cadence. Each is
independently testable and shippable:

| PR  | Name                                           | Depends on    | Blocks   |
| --- | ---------------------------------------------- | ------------- | -------- |
| 2.1 | Plugin skeleton + `getScriptSnapshot` override | 1b.6          | 2.2, 2.3 |
| 2.2 | Model-registry build + invalidation on change  | 2.1           | 2.3, 2.5 |
| 2.3 | Position/range remap for IDE features          | 2.2           | 2.4      |
| 2.4 | Diagnostic remap + quick-fix interception      | 2.3           | 2.6      |
| 2.5 | Incremental walker + perf budget               | 2.2           | 2.6      |
| 2.6 | Editor install docs + cross-editor smoke tests | 2.3, 2.4, 2.5 | Phase 3  |

**Shared prerequisites — what we can reuse verbatim from Phase 1b:**

- `packages/activerecord/src/type-virtualization/virtualize.ts` —
  `virtualize(originalText, fileName, { baseNames, prependImports })`
  returns `{ text, deltas }`. Pure syntactic transform; no Program or
  checker. The plugin calls it exactly the same way the CLI does.
- `packages/activerecord/src/type-virtualization/transitive-extends-walker.ts` —
  `collectBaseDescendants(program)` returns `{ baseNames, modelRegistry }`.
  Runs against the language service's `program` instead of a CLI-built
  one.
- `packages/activerecord/src/tsc-wrapper/auto-import.ts` —
  `resolveAutoImports(text, fileName, modelRegistry, baseNames)`
  returns the `import type { ... }` lines to prepend. Same call site.
- `packages/activerecord/src/type-virtualization/resolve-target.ts` —
  `resolveAssociationTarget(call)` already shared between the
  virtualizer and auto-import resolver.
- `packages/activerecord/src/type-virtualization/virtualize.ts#remapLine`
  - `packages/activerecord/src/tsc-wrapper/remap.ts#remapDiagnostics`
    (with the optional `originalSfCache`) — reused for mapping IDE
    positions back to user coordinates.

**New code lives in:**
`packages/activerecord/src/tsserver-plugin/` with entry
`index.ts` exporting the canonical TypeScript-plugin factory:

```ts
import type ts from "typescript/lib/tsserverlibrary";

function init({ typescript: ts }: { typescript: typeof import("typescript/lib/tsserverlibrary") }) {
  return {
    create(info: ts.server.PluginCreateInfo): ts.LanguageService {
      // sub-PRs below wire this up incrementally.
      return info.languageService;
    },
  };
}
export = init;
```

Plugin ships as the subpath export `@blazetrails/activerecord/tsserver-plugin`
(one install, no version skew with `/tsc`), resolving to a compiled
CJS file — tsserver's plugin loader requires CommonJS and
`module.exports = factory` shape. A dedicated
`tsconfig.tsserver-plugin.json` with `"module": "CommonJS"`,
`"moduleResolution": "Node"`, and its own `outDir`
(`dist/tsserver-plugin/`) emits the plugin artifact; the rest of
`@blazetrails/activerecord` keeps emitting ESM. `package.json`'s
`exports` map points the subpath at the CJS entry + its `.d.cts`.

**Scopes explicitly deferred to later phases:**

- **Inferred projects** (a file opened in the editor that isn't
  covered by any `tsconfig.json`). tsserver creates a synthetic
  project with no plugin config, so the plugin doesn't activate —
  the user sees plain-`tsc` behavior. Documented in 2.6; opt-in for
  future Phase 4+.
- **Composite project references** (`"references": [...]` in
  `tsconfig.json`). No extra plugin code needed: tsserver already
  spins up a distinct language service per referenced project, each
  of which loads the plugin via its own `tsconfig.json`. The 2.6
  smoke suite exercises a two-project composite fixture lifted from
  Phase 1b.5 to verify this.
- **User-written `declare` escape hatches** continue to work
  unchanged: `virtualize()` already skips injection for any member
  name present on the class (`memberPresent` in
  `synthesize.ts#renderCall`), so the plugin inherits this behavior
  for free.

---

#### 2.1 — Plugin skeleton + `getScriptSnapshot` override 📋

**Goal:** tsserver loads the plugin and returns the virtualized text
from `getScriptSnapshot` for every Base-rooted file in the project.
No walker yet — uses the default `baseNames: ["Base"]` heuristic.
Enough to prove the integration point works and that VS Code / Zed /
WebStorm pick up simple zero-declare models without any plugin logic
beyond a one-file text transform.

**Deliverables:**

- `packages/activerecord/src/tsserver-plugin/index.ts` with the
  canonical `function init({ typescript })` factory. CJS output so
  tsserver can `require()` it.
- `packages/activerecord/src/tsserver-plugin/host-proxy.ts` wrapping
  `info.languageServiceHost` to override `getScriptSnapshot(fileName)`:
  1. Call the underlying host to get the original snapshot text.
  2. Read the current file version from
     `info.languageServiceHost.getScriptVersion(fileName)` — the
     snapshot itself doesn't carry a version, the host does.
  3. If it doesn't need virtualization (no `static {` with
     `extends Base` — same fast pre-filter the CLI uses in
     `host.ts#STATIC_BLOCK_PATTERN` + `EXTENDS_IDENT` regex), return
     the original snapshot unchanged.
  4. Otherwise call `virtualize(originalText, fileName, { baseNames })`.
  5. Wrap the result in `ts.ScriptSnapshot.fromString(result.text)`.
  6. Cache by `(fileName, originalVersion)` — when the host's
     script version changes, re-virtualize. Avoid re-parsing
     unchanged files.
- `packages/activerecord/src/tsserver-plugin/snapshot-cache.ts` — a
  tiny `Map<string, { version: string; snapshot: ts.IScriptSnapshot; deltas: LineDelta[]; originalText: string }>`,
  where `version` is the host's script version string for that
  file. The LineDelta + originalText are needed by later sub-PRs
  for remapping.
- Override `LanguageServiceHost.getScriptVersion` too — return
  `<originalVersion>:<virtualizerVersion>` where `virtualizerVersion`
  is a monotonic counter bumped whenever the plugin's virtualization
  settings change (e.g. baseNames set refreshes in 2.2). Forces
  tsserver to invalidate cached SourceFiles after a walker rebuild.
- `@blazetrails/activerecord/tsserver-plugin` subpath export +
  dedicated `tsconfig.tsserver-plugin.json` emitting CJS + `.d.ts`.
- Integration test: spawn `tsserver` (via
  `typescript/lib/tsserver.js`) in a child process, open a
  single-file fixture `post.ts` with
  `this.attribute("title", "string")` and NO manual declares, send
  a `quickinfo` request at the cursor on `post.title` in an adjacent
  consumer file, assert the reply's `displayString` is `(property)
Post.title: string`.

**Non-goals (deferred):** transitive extends, auto-import, position
remap, diagnostic remap, perf budget.

**Exit:** on a flat `extends Base` fixture, VS Code / tsserver hover
shows `post.title: string` end-to-end with the plugin installed and
nothing else touched.

---

#### 2.2 — Model-registry build + invalidation on change 📋

**Goal:** plugin runs the same two-pass walker the CLI uses
(`program.ts` in Phase 1b.3 + 1b.4), so transitive-extends and
cross-file auto-imports work in the editor. Rebuilds the registry on
file add / remove / save, not on every keystroke.

**Deliverables:**

- `packages/activerecord/src/tsserver-plugin/registry.ts`:
  - `class RegistryCache { readonly baseNames: ReadonlySet<string>; readonly modelRegistry: ReadonlyMap<string, string>; constructor(program: ts.Program); }`
  - Populated by calling `collectBaseDescendants(program)` from the
    shared walker. Single pass; cached on the cache instance.
  - `invalidate(trigger: "fileAdded" | "fileRemoved" | "configChange" | "save")`
    — drops the cache so the next lookup rebuilds. Typing changes
    (within a single file) don't invalidate — transitive extends only
    changes when files are added/removed or when `extends` clauses
    shift, and those arrive via the save / onSourceFileChanged hook.
- Wire `info.project.projectService.onProjectUpdatedInBackground`
  (available on `ts.server.Project`) + polling for
  `program !== previousProgram` to decide when to rebuild. Program
  identity changes whenever the language service re-creates one
  (file add / remove, config change).
- `getScriptSnapshot` now asks the registry for `baseNames` and
  passes `modelRegistry` into `resolveAutoImports(...)`, then into
  `virtualize(..., { baseNames: [...baseNames], prependImports })`.
  Exact same pipeline as `tsc-wrapper/host.ts#getVirtualizedText`.
- Cross-file auto-import integration test: fixture with
  `author.ts` exporting `Author` + `post.ts` declaring
  `this.belongsTo("author")` and NO import. Open `post.ts` in
  tsserver; assert a `completionInfo` on `post.<cursor>` includes
  `author` as a member; assert go-to-def on `author` jumps to
  `author.ts`.

**Non-goals:** per-keystroke incrementality (that's 2.5). On every
program rebuild the walker scans the whole program — fine up to a few
hundred models; 2.5 optimizes.

**Exit:** plugin behaves identically to `trails-tsc` on all Phase 1b
fixtures (transitive-extends, auto-import, polymorphic belongsTo
skip). Verified by a parameterized test that runs the same fixtures
through both the CLI and the plugin and compares `getScriptSnapshot`
output byte-for-byte.

---

#### 2.3 — Position/range remap for IDE features 📋

**Goal:** every IDE feature returns positions in the user's
**original** coordinates, not virtualized ones. Without this,
clicking "go to definition" on `post.title` would land in the wrong
line; hover cards would underline the wrong range; rename would
rewrite injected `declare` text the user never wrote.

**Deliverables:**

- `packages/activerecord/src/tsserver-plugin/position-remap.ts` —
  two inverse helpers:
  - `virtualToOriginal(fileName, virtualPos, cache)` — the common
    case. Uses the cached `deltas` + a lazily-parsed original
    `SourceFile` to translate.
  - `originalToVirtual(fileName, originalPos, cache)` — needed when
    the IDE hands us an original-coord position (e.g. cursor pos) to
    forward into the underlying language service. Walk deltas in
    forward order, adding each `lineCount` when the original line is
    past `insertedAtLine`.
- `LanguageService` proxy wraps each feature with coord remapping.
  The **full** list of methods touched:
  - **Definition / implementation / references / rename:**
    `getDefinitionAtPosition`, `getDefinitionAndBoundSpan`,
    `getTypeDefinitionAtPosition`, `getImplementationAtPosition`,
    `getReferencesAtPosition`, `findReferences`, `getRenameInfo`,
    `findRenameLocations` — all take `position: number` in the file,
    return spans. Convert position original→virtual before calling;
    convert returned spans virtual→original.
  - **Hover / quick info / signature help:** `getQuickInfoAtPosition`,
    `getSignatureHelpItems` — same pattern. If the resulting
    `textSpan` falls inside an injected range, clamp to the class
    body's opening `{` in the original (Phase 1b.2 already ships this
    heuristic for diagnostics; reuse).
  - **Completions:** `getCompletionsAtPosition`,
    `getCompletionEntryDetails`, `getCompletionEntrySymbol` —
    positions translate; the completion list itself is correct
    without further work (it's computed against the virtualized
    source, which is exactly what we want — `post.title` shows up in
    the list). Verify in tests that suggestions don't include
    internal synthesized helpers like the `loadBelongsTo` method on
    classes that have no belongsTo (the virtualizer already avoids
    emitting these).
  - **Navigate / outline / folding:** `getNavigateToItems`,
    `getNavigationTree`, `getNavigationBarItems`, `getOutliningSpans` —
    return spans that must translate virtual→original. Also filter
    injected declares out of navigation items: users don't want to
    see `loadBelongsTo` in VS Code's outline when they didn't write
    it. Use the `deltas` ranges to detect injected spans.
  - **Formatting:** `getFormattingEditsForRange`,
    `getFormattingEditsForDocument`, `getFormattingEditsAfterKeystroke`,
    `getDocCommentTemplateAtPosition` — forward the range
    original→virtual, translate returned `TextChange` spans back.
    Drop any returned edit whose span overlaps an injected range —
    those are edits to the `declare` lines the user never wrote and
    shouldn't see.
  - **Semantic highlight / encoded classifications:**
    `getEncodedSyntacticClassifications`,
    `getEncodedSemanticClassifications` — return packed
    `span: number, length: number, classification` triples. Translate
    each span virtual→original and drop any inside injected ranges.
- New test util
  `packages/activerecord/src/tsserver-plugin/test-utils/language-service-harness.ts`:
  in-process harness that creates a `ts.server.LanguageService` with
  our plugin applied, so integration tests can call
  `service.getQuickInfoAtPosition(...)` directly. Cheaper than
  spawning `tsserver`; the byte-compatibility test in 2.2 already
  validates the out-of-process path.
- Fixture: Phase 1b.4's `auto-import/post.ts`. Tests assert:
  - Hover over `post.title` (virtual coords shift by N injected
    lines) returns a `textSpan` whose start/length point at the
    literal `title` identifier in the ORIGINAL file.
  - Hover over `post.author` returns
    `(property) Post.author: Author | null` with the span pointing at
    `author` in the original.
  - Rename `author` → `writer` in the original file produces edits
    only in original-coord spans and never touches the injected
    `declare author: Author | null;` line (it doesn't exist on disk).
  - Go-to-def on `Author` (the injected `import type`) jumps to
    `author.ts` — this exercises the auto-imported module resolving
    correctly through the virtualized snapshot.

**Non-goals:** diagnostics (2.4), perf (2.5).

**Exit:** every IDE feature returning a span or position returns it
in the user's original coordinates. No injected members leak into
navigation / outline / rename.

---

#### 2.4 — Diagnostic remap + quick-fix interception 📋

**Goal:** red squigglies appear on the user's lines, not shifted
virtual ones; quick-fixes ("Add missing property", "Rename in file")
produce edits against the original source.

**Deliverables:**

- Proxy `getSemanticDiagnostics`, `getSyntacticDiagnostics`,
  `getSuggestionDiagnostics` — same pattern as
  `tsc-wrapper/remap.ts#remapDiagnostics`, reusing the helper
  verbatim. Share `originalSfCache` across a single call so a file
  with N diagnostics reparses the original text once.
- Proxy `getCodeFixesAtPosition`, `getCombinedCodeFix`,
  `getApplicableRefactors`, `getEditsForRefactor` — each returns
  `FileTextChanges[]` with `TextChange[]` that must translate
  virtual→original. Any change whose span overlaps an injected range
  is dropped (same rule as formatting in 2.3); if the code fix
  would have inserted a `declare`, drop it outright — the
  virtualizer will regenerate it on the next pass.
- Handle the injected-block edge case — if the diagnostic genuinely
  lands inside an injected range (walker bug, or a declare the
  virtualizer produced but can't resolve against the user's imports),
  surface it at the class body's opening `{` with a hint pointing at
  `trails-tsc --print-virtualized <file>` for debugging. Same
  convention as Phase 1b.2.
- Filter diagnostics that reference injected-only symbols. Example:
  if TS emits "Property 'loadBelongsTo' does not exist" because our
  walker missed a belongsTo call, that diagnostic points at a user
  line but the _symbol_ is one we were supposed to synthesize.
  Don't suppress — users need to see these — but tag them with
  `messageText: "[trails-tsc] ..."` prefix so they're traceable back
  to the virtualizer.
- Fixture: Phase 1b.2's error-in-class-body fixture. Assert the
  diagnostic's `start`/`length` match the user's original line
  character-for-character, the `file.fileName` is the original path,
  and a QuickFix at that position (e.g., "Add missing declaration")
  produces no edits inside injected ranges.

**Non-goals:** watch-mode performance under large diagnostic bursts
(that's 2.5).

**Exit:** running `ts-server-test` against a virtualized fixture
with a genuine type error produces diagnostics indistinguishable
from the same file authored with hand-written declares — same line,
same column, same message text.

---

#### 2.5 — Incremental walker + perf budget 📋

**Goal:** plugin overhead is <50ms per file open and <10ms per
keystroke on a repo with 500+ models. Avoid re-running the walker
on every snapshot change.

**Deliverables:**

- Per-file incremental snapshot: when `getScriptSnapshot` is asked
  for a file whose version changed, only re-virtualize THAT file —
  do not rebuild the model registry. The walker rebuild happens on
  program identity change only (triggered by file add/remove/config
  change via the 2.2 hooks). Keystroke edits within a file don't
  change the program identity.
- Fast pre-filter: cheap string scan for `static {` + `extends ` +
  `Base` (or any known base name) before running the AST parse.
  Early-return the original snapshot if none match. Already used in
  the CLI host; hoist into a shared
  `packages/activerecord/src/type-virtualization/fast-filter.ts`
  module and reuse.
- Walker memoization keyed on the set of root source files. Since
  `ts.Program.getSourceFiles()` returns the same `SourceFile` objects
  across incremental edits within a single program, memoize the
  walker output by a `WeakSet<ts.SourceFile>` of scanned files; skip
  files whose symbols were already registered.
- `IScriptSnapshot.getChangeRange` passthrough. tsserver uses this
  to skip re-parsing when only a small span changed. Pass the change
  range through to our virtualized snapshot by composing ranges over
  the `deltas` array — a change of `[start, end)` in original coords
  maps to `[start + leadingDelta, end + cumulativeDelta)` in virtual.
  Fallback to "everything changed" if the change range straddles an
  injected block.
- Perf harness
  `packages/activerecord/src/tsserver-plugin/perf.bench.ts`: generate
  a synthetic repo with N∈{10, 100, 500, 2000} models, run
  `getScriptSnapshot` and `getQuickInfoAtPosition` under the plugin,
  record p50 / p95 / p99 latencies, fail if p95 exceeds the budget.
  Integrated into CI as a non-blocking job initially; becomes
  blocking once numbers stabilize.

**Exit:** perf harness green at N=500 with p95 under budget; no
per-keystroke walker invocations visible in the timeline trace.

---

#### 2.6 — Editor install docs + cross-editor smoke tests 📋

**Goal:** users in each tier-1 editor can install and use the
plugin without reading this plan.

**Deliverables:**

- `docs/editor-setup.md`:
  - **VS Code** (tier-1): just a `"plugins"` entry in `tsconfig.json`;
    VS Code uses its bundled TS automatically. Note the "Select
    TypeScript Version → Use Workspace Version" step for repos with a
    pinned TS.
  - **Zed** (tier-1): same `"plugins"` entry; Zed runs tsserver from
    the project's `node_modules/typescript`.
  - **WebStorm / IntelliJ** (tier-1): same `"plugins"` entry; Settings
    → Languages & Frameworks → TypeScript → "Use types from
    node_modules/typescript".
  - **Neovim** (tier-2): `tsserver` via nvim-lspconfig; document that
    the plugin is picked up automatically once the user's TS sees the
    tsconfig.
  - **Cursor / Windsurf / other VS Code forks**: same as VS Code.
- Smoke test script `scripts/editor-smoke/smoke.ts` — uses
  `typescript/lib/tsserver.js` directly (no editor) to assert a
  minimal "open file → receive quickInfo" roundtrip for each plugin
  feature. Runs in CI on Ubuntu + macOS + Windows to catch
  OS-specific path issues in the auto-import relative-path logic
  (Phase 1b.4 already normalizes `\\` → `/`; re-verify via this
  harness).
- TypeScript compatibility matrix in the doc: tested against TS
  5.4, 5.5, 5.6, 5.7, 5.8 (latest LTS range at time of writing).
  Plugin logic uses only public `LanguageServiceHost` APIs; pinned
  via `peerDependencies: { "typescript": ">=5.4 <6" }`.
- CLAUDE.md § "editor support" paragraph pointing at the new doc and
  noting that `trails-tsc` and the plugin are expected to produce
  the same diagnostics — if they diverge, file a bug.

**Exit:** someone unfamiliar with the project can follow
`docs/editor-setup.md` top-to-bottom on any tier-1 editor and get
zero-declare models working; smoke-test job is green on all three
OSes.

---

**Phase 2 exit criteria (satisfied after 2.1–2.6 merge):**

- Plugin produces virtualized snapshots that match `trails-tsc`
  byte-for-byte on every Phase 1b fixture.
- VS Code / Zed / WebStorm show correct quick-info, completions,
  go-to-def, references, and rename on synthesized members (zero
  declares, zero association-target imports in the user's source).
- Diagnostics in the editor land on the user's original lines — no
  off-by-N errors from injected declares.
- p95 plugin overhead <50ms per file open on a 500-model synthetic
  repo; p95 <10ms per keystroke.
- Docs cover the tier-1 editors; compatibility matrix pins the
  tested TS range.
- `typescript` stays a peerDependency; no version skew with `/tsc`.

### Key risks + mitigations specific to Phase 2

- **tsserver plugin API stability.** The plugin surface is public but
  evolves. Mitigation: use only `LanguageServiceHost` methods
  declared in the public `ts.server` types; add a contract test that
  runs the plugin against the pinned TS range on every push.
- **Snapshot caching inside tsserver.** Getting `getScriptVersion`
  wrong causes stale snapshots (edits invisible) OR thrashing (every
  keystroke re-parses). The 2.1 composite-version scheme
  (`<original>:<virtualizerVersion>`) is the mitigation; the 2.5
  perf harness catches regressions.
- **Plugin load order.** Users with multiple plugins (e.g. a styled-components
  plugin + ours) need a predictable order. Document that ours should
  come last so it sees the final snapshot after other plugins
  transform. Test with one well-known plugin in the smoke suite.

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
   ├── Phase 1b ✅ — `trails-tsc` CLI shell
   │      1b.1 ✅ CLI skeleton + single-file virtualization  (#549)
   │      1b.2 ✅ Diagnostic remap                           (#551)
   │      1b.3 ✅ Transitive-extends walker                  (#553)
   │      1b.4 ✅ Auto-import resolution                     (#557)
   │      1b.5 ✅ --build support                            (#561)
   │      1b.6 ✅ In-repo migration + CI                     (#563)
   │
   └── Phase 2 📋 — tsserver plugin (Phase 1b done; unblocked)
         │
         ├── 2.1 Plugin skeleton + getScriptSnapshot override
         ├── 2.2 Model-registry build + invalidation  (after 2.1)
         ├── 2.3 Position/range remap                 (after 2.2)
         ├── 2.4 Diagnostic remap + quick-fix         (after 2.3)
         ├── 2.5 Incremental walker + perf budget    (after 2.2)
         └── 2.6 Editor install docs + smoke tests   (after 2.3/2.4/2.5)
                  │
                  └── Phase 3 📋 — docs + consumer cutover
```

Phase 1b shipped in six merged PRs. Phase 2 picks up the same cadence
against the **editor** shell, reusing every module the CLI built:
`virtualize()`, `collectBaseDescendants()`, `resolveAutoImports()`,
`remapDiagnostics()`, `resolve-target.ts`. Only new code is the
tsserver plugin adapter, the position-remap layer, and the perf
harness. 2.1 must land first; after 2.2 the rest fan out — 2.3 and
2.5 are independent, 2.4 depends on 2.3's position-remap helpers,
and 2.6 needs all three for the smoke tests.

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
