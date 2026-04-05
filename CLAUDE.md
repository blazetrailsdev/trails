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
- Do open new PRs in draft status.
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
