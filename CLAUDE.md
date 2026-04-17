# trails

A set of TypeScript packages that mirror the Rails API as closely as possible.
Someone reading the Rails API docs should be able to use these packages with
near-identical intent and naming.

## Project Structure

This is a TypeScript monorepo. Packages live under `packages/`:

- `packages/arel` — Query building and AST (Arel)
- `packages/activemodel` — Validations, callbacks, dirty tracking, serialization (ActiveModel)
- `packages/activerecord` — ORM layer tying Arel and ActiveModel together (ActiveRecord)
- `packages/activesupport` — Core utilities, inflection, caching, notifications, encryption (ActiveSupport)
- `packages/rack` — Web server interface, middleware, request/response (Rack)
- `packages/actionpack` — ActionDispatch (routing, cookies, sessions) and ActionController

## Design Principles

- **Rails API fidelity**: Class names, method names, and call signatures should
  match Rails as closely as TypeScript allows. When the Rails docs say
  `User.where(name: "dean").order(:created_at)`, the TS equivalent should feel
  the same.
- **Idiomatic TypeScript**: Use TypeScript's type system to provide safety that
  Ruby can't. Generics, literal types, and discriminated unions are encouraged
  where they improve the developer experience without breaking Rails parity.
- **No magic strings where types work**: Prefer typed column references over
  raw strings when possible, but always support the string form for parity.
- **Use the package ecosystem like Rails does**: ActiveRecord's power comes
  from Arel. When building queries, subqueries, or SQL conditions in
  `activerecord`, use `@blazetrails/arel` (Table, SelectManager, Nodes, Attribute)
  to build AST nodes — never construct raw SQL strings. Similarly, use
  `@blazetrails/activemodel` for validations/callbacks and `@blazetrails/activesupport`
  for inflection/utilities rather than reimplementing them.
- **Implementation-first**: The goal is to implement Rails features in
  TypeScript. Tests being unskipped is a side effect of implementation, not
  the goal. Don't scan for easy tests to flip — build the feature, then
  unskip the tests that prove it works. Read the Rails source to understand
  the feature before implementing.
- **Read existing code before writing new code**: Before implementing a new
  class or module, trace how the existing codebase already handles the same
  concern. Check Base for the actual persistence API (`isNewRecord()`,
  `isPersisted()`, `readAttribute()`, `writeAttribute()` — not `_persisted`
  or direct property access). Check existing load/build functions before
  duplicating logic. Check how existing code handles composite primary keys
  (`primaryKey` can be `string | string[]`). Methods should delegate to
  existing infrastructure, not reimplement it.
- **Ship behavior, not signatures**: Never commit methods that match an API
  surface but return null/undefined or only manipulate in-memory state when
  the Rails equivalent hits the database. If a method can't be fully
  implemented yet, don't add it — a missing method is better than a
  misleading one. `api:compare` coverage is a side effect of correct
  implementation, not a goal to optimize for.
- **Test-driven against Rails**: Progress is measured by `api:compare`,
  which matches our test files and test names against the actual Rails test suite.

## Module Mixins (Ruby `include` → TypeScript)

Rails uses `include`/`extend` to mix module methods into a class. TypeScript
has no equivalent, so we use **`this`-typed functions assigned directly to the
class**. This is the closest TS equivalent of Ruby's module inclusion.

### Pattern

Define the function in the module file with a `this` parameter:

```ts
// attribute-methods.ts
export function aliasAttribute(this: AttributeMethodHost, newName: string, oldName: string): void {
  // `this` is the class (e.g., Model) — use it like Ruby's `self`
  this._attributeAliases[newName] = oldName;
  // ...
}
```

Assign it directly on the class — no wrapper:

```ts
// model.ts
import { aliasAttribute } from "./attribute-methods.js";

export class Model {
  static aliasAttribute = aliasAttribute;
}
```

### Why this pattern

- **Code lives in the right file.** `aliasAttribute` lives in
  `attribute-methods.ts`, matching Rails where it's in
  `attribute_methods.rb`. The `api:compare` script can find it.
- **No delegation wrappers.** `static aliasAttribute = aliasAttribute` is
  a direct assignment — no `static aliasAttribute(...args) { fn(this, ...args) }`.
- **Type-safe.** TypeScript checks that Model satisfies `AttributeMethodHost`
  at compile time. The `this` parameter is erased at runtime.
- **Subclass-safe.** `this` resolves to the actual calling class at runtime
  (e.g., `User` not `Model`), just like Ruby's `self`.

For **instance methods** mixed in bulk (like Rails' `include QueryMethods`),
use `include()` and `Included<>` from `@blazetrails/activesupport`.
See `activesupport/src/include.ts` for the API and
`relation.ts` + `relation/query-methods.ts` for usage.

### When NOT to use this

- **Ruby lifecycle hooks** (`extended`, `included`, `inherited`) have no TS
  equivalent. Don't add empty functions just for `api:compare` — add them
  to the skip list in `scripts/api-compare/compare.ts` instead.
- **If the method needs Model-specific state** beyond what the host interface
  declares, keep it in model.ts directly.

## Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Do NOT add "Co-Authored-By" lines to commit messages.
- Do NOT add "Generated with Claude Code" lines to PR descriptions.
- Tests live next to source files as `*.test.ts`.
- Prefer small, focused modules over large files.
- Do NOT use subagents unless explicitly requested. Do the work directly.
- Do use worktrees for any changes. Leave the default worktree for the user.
- Copilot automatically reviews every PR and every push, so no need to request review.
  Copilot reviews can be found at `~/.btwhooks/data/github/blazetrailsdev/trails/$PR`.
- Do open new PRs in draft status.
- After opening a PR, run the `/link` skill with the PR number so webhook
  notifications (Copilot reviews, CI failures) are delivered to this pane.
- Do NOT add code comments that just describe what the line does. Only add
  comments when they provide additional value — a potential bug hidden, or
  explanation about the larger context.
- Do NOT add empty stubs or placeholder interfaces. Only add real
  implementations with meaningful logic. If a feature isn't implemented yet,
  don't create an empty file for it.
- **NEVER rename or reword test names.** Test names are derived from the Rails
  test suite and are how `api:compare` matches our tests to Rails tests.
  If a test is failing or the behavior doesn't match the name, fix the test body
  (the implementation under test), not the test name. Always look at the
  corresponding Rails test to understand the expected behavior before changing
  anything.

## Measuring Progress

The primary measure of progress is the `api:compare` script output.
It compares our test files and test names against the Rails test suite:

```bash
pnpm run api:compare
```

Run it to see current stats per package. Use `--package <name>` for a single package.

"Misplaced" means tests that exist but are in the wrong file according to
Rails conventions. These need to be moved, not rewritten.

CI runs `api:compare` on every push to track regressions.

## Measuring DX

A secondary signal is `pnpm test:types` — a Vitest typecheck-mode suite in
`packages/*/dx-tests/` that exercises the public API the way a Rails
developer would. It pins the current type contract and encodes DX gaps
(e.g. `Model.where` returning `any`) as assertions. When a gap is closed,
the assertion flips and signals the test should be tightened.

A dedicated `DX Type Tests` CI job runs on every push.

### The `declare` pattern for typed runtime-attached members

Several things in ActiveRecord are attached to a class/instance at
runtime (via `this.attribute`, `this.hasMany`, `this.scope`, `this.enum`,
...) and aren't visible to the TypeScript type system by default.

- **Instance members** (`record.name`, `post.comments`): `Model`'s
  `[key: string]: unknown` index signature means the access type-checks
  but resolves to `unknown`. Opt in with `declare name: string` etc.
- **Static members** (`Post.published`, enum class scopes): there's no
  static index signature, so without `declare static`, the access is a
  `Property 'published' does not exist on type 'typeof Post'` error.
  Always pair `this.scope(...)`, `this.enum(...)`, and
  `defineEnum(...)` with a matching `declare static`.

Every snippet below assumes:

```ts
import {
  Base,
  CollectionProxy,
  AssociationProxy,
  Relation,
  association,
  defineEnum,
  readEnumValue,
} from "@blazetrails/activerecord";
```

**Attributes** (`this.attribute(name, type)`):

```ts
class User extends Base {
  declare name: string;
  declare admin: boolean;
  static {
    this.attribute("name", "string");
    this.attribute("admin", "boolean", { default: false });
  }
}
```

**has_many / HABTM** (`this.hasMany(name)` — reader returns an
`AssociationProxy<Target>`, mirroring Rails' `CollectionProxy`. The proxy
is **chainable** like Relation, **awaitable** to the loaded array, and
**array-shaped** for sync ops over the loaded target):

```ts
class Blog extends Base {
  declare posts: AssociationProxy<Post>;
  static {
    this.hasMany("posts");
  }
}

const blog = await Blog.find(1);

// Chainable like Relation — `blog.posts.where(...).order(...)` —
// matches Rails' `blog.posts.where(published: true).order(:created_at)`.
const recent = await blog.posts.where({ published: true }).order("created_at").limit(10);

// Awaitable — single `await` hydrates and yields the array. This IS
// the explicit-load path for collections; no separate `loadPosts()`
// method exists (the proxy's thenable is the loader).
const all = await blog.posts;

// Array-shaped sync ops — read the loaded target. (Iteration / .length /
// .map / [0] don't trigger a fresh load; await first if you need one.)
for (const post of blog.posts) console.log(post.title);
const titles = blog.posts.map((p) => p.title);
const first = blog.posts[0];

// `association(record, name)` still returns the same proxy if you want
// to bind it to a local for clarity.
const proxy = association<Post>(blog, "posts"); // AssociationProxy<Post>
```

**belongs_to / has_one** (sync reader returns the currently loaded
record or `null`; `loadBelongsTo(name)` / `loadHasOne(name)` perform
an explicit async load, returning the cached/preloaded value if
present or running a query otherwise):

```ts
class Post extends Base {
  declare author: Author | null;
  static {
    this.belongsTo("author");
  }
}
class Author extends Base {
  declare profile: Profile | null;
  static {
    this.hasOne("profile");
  }
}

// Sync reads return whatever's currently cached (may be null if
// nothing loaded). Use `loadBelongsTo(name)` / `loadHasOne(name)` to
// explicitly load — method name matches the macro, so calling the
// wrong one is a TS error. Returns the cached/preloaded value if
// present, otherwise runs a query.
//
// Under strict loading (`record.strictLoadingBang()` or
// `Class.strictLoadingByDefault = true`, both off by default matching
// Rails), sync access on a singular association that WOULD require a
// DB load throws `StrictLoadingViolationError` instead of silently
// returning null. The check honors preloaded / cached associations
// (including keys mapped to null), null FKs on belongsTo, and new
// owners on hasOne — none of those would run a query, so none throw.
// The explicit async loaders (`loadBelongsTo` / `loadHasOne`) bypass
// the check — the caller asked for the load. Per-instance opt-out:
// `record.strictLoadingBang(false)`.
const post = await Post.find(1);
const author = await post.loadBelongsTo("author"); // Promise<Author | null>
const author2 = await Author.find(1);
const profile = await author2.loadHasOne("profile"); // Promise<Profile | null>

// Virtualizer emits typed overloads so the return type narrows
// automatically. Without the virtualizer, declare by hand:
//   declare loadBelongsTo: (name: "author") => Promise<Author | null>;
//   declare loadHasOne: (name: "profile") => Promise<Profile | null>;
//
// Collections (hasMany / hasAndBelongsToMany) have no explicit
// loader — the AssociationProxy is awaitable (`await blog.posts`).
// Calling `loadBelongsTo("posts")` throws with a pointer to the
// proxy-await form. Calling the wrong macro for a singular
// (`loadHasOne("author")` on a belongsTo) also throws with a
// pointer to the right method.
```

**Named scopes** (`this.scope(name, fn)` — class-level):

```ts
class Post extends Base {
  declare static published: () => Relation<Post>;
  static {
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}
```

**Enums** — two forms with different surfaces:

- `this.enum(name, mapping)` (`Base.enum`) generates a predicate +
  in-memory bang setter (returns `this`, no persistence) + class scope
  per value.
- `defineEnum(modelClass, name, mapping)` (`@blazetrails/activerecord`'s
  `defineEnum`) generates the same + a plain in-memory setter + an async
  persisting `*Bang` + `not*` class scopes per value. Use this when
  you want bang methods to persist, matching Rails' `enum` semantics
  (see section 7 of the ActiveRecord deviations guide).

```ts
// Base.enum — simpler
class Task extends Base {
  declare status: string;
  declare isLow: () => boolean;
  declare lowBang: () => this; // in-memory; does not persist
  declare static low: () => Relation<Task>;
  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}

// defineEnum — full surface
class Article extends Base {
  // defineEnum does NOT override the attribute accessor: `status` stays
  // the integer column. Use `readEnumValue(record, "status")` when you
  // want the string label.
  declare status: number;
  declare isDraft: () => boolean;
  declare draft: () => void; // plain in-memory setter
  declare draftBang: () => Promise<void>; // async; in-memory on new records,
  //                                         otherwise persists via updateColumn
  //                                         (bypasses validations/callbacks)
  declare static draft: () => Relation<Article>;
  declare static notDraft: () => Relation<Article>;
  static {
    this.attribute("status", "integer");
    defineEnum(this, "status", { draft: 0, published: 1 });
  }
}
```

**Do not** redeclare `id` on subclasses — `Base#id` is an accessor
(`PrimaryKeyValue`) and TS forbids overriding accessors with differently
typed instance properties. Narrow at the use site instead:
`record.id as number`.

See `packages/activerecord/dx-tests/declare-patterns.test-d.ts` for the
canonical manual-`declare` reference (the escape hatch — use when the
virtualizer doesn't yet produce the declare you need, or when you want
the shape documented locally).

`packages/activerecord/virtualized-dx-tests/virtualized-patterns.test-d.ts`
is the parallel **zero-declare** reference compiled by `trails-tsc`. It
shows the Rails-fidelity authoring form (pure `static { this.attribute(...) }`
blocks) and is the default you should prefer. CI runs it as the
`Virtualized DX Type Tests` job.

`CollectionProxy<T>` and `AssociationProxy<T>` are both generic in the
element type. Without the `declare` (manual) or without `trails-tsc`
compiling the file (virtualized), these runtime-attached members still
resolve to `unknown`.
