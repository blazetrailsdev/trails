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
- **Test-driven against Rails**: Progress is measured by `test:compare`,
  which matches our test files and test names against the actual Rails test suite.

## Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Do NOT add "Co-Authored-By" lines to commit messages.
- Tests live next to source files as `*.test.ts`.
- Prefer small, focused modules over large files.
- Do NOT use subagents unless explicitly requested. Do the work directly.
- Do use worktrees for any changes. Leave the default worktree for the user.
- Copilot automatically reviews every PR and every push, so no need to request review.
- Do NOT add code comments that just describe what the line does. Only add
  comments when they provide additional value — a potential bug hidden, or
  explanation about the larger context.
- **NEVER rename or reword test names.** Test names are derived from the Rails
  test suite and are how `test:compare` matches our tests to Rails tests.
  If a test is failing or the behavior doesn't match the name, fix the test body
  (the implementation under test), not the test name. Always look at the
  corresponding Rails test to understand the expected behavior before changing
  anything.

## Measuring Progress

The primary measure of progress is the `test:compare` script output.
It compares our test files and test names against the Rails test suite:

```bash
pnpm run test:compare
```

Run it to see current stats per package. Use `--package <name>` for a single package.

"Misplaced" means tests that exist but are in the wrong file according to
Rails conventions. These need to be moved, not rewritten.

CI runs `test:compare` on every push to track regressions.
