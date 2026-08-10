# Copilot Instructions for trails

## What this project is

A TypeScript monorepo that mirrors the Ruby on Rails API. Someone reading the Rails API docs should be able to use these packages with near-identical intent and naming.

## Fidelity is the standard

This is a re-implementation of Rails, not a library inspired by it. When code has a Rails counterpart, it should be as close to the Ruby as TypeScript allows. The bar is **"would a Rails dev recognize this as the same method"**, not "does it pass the tests". Mirror:

- **Names** — method, class, module, constant, and field names, translated by the rules in [docs/ruby-ts-conventions.md](../docs/ruby-ts-conventions.md).
- **Locals and parameters** — a Rails local `stmt` stays `stmt`, not `statement`; `klass` stays `klass`. Same for parameter order and defaults.
- **Control flow** — same branches, same order, same guards and early returns. Collapsing, reordering, or inverting them is a finding.
- **Decomposition** — if Rails extracts a private helper, so should we, at the Rails name. One Rails method is one TS method.
- **Member order within the file**, and the file layout itself.
- **Errors** — same class, same message, same raise site.
- **No extra abstraction** — no helper, wrapper, indirection layer, or "cleaner" rewrite Rails doesn't have. `pnpm parity:api:extra` measures this; `@noRailsEquivalent <reason>` is the only sanctioned exception.

Only a genuine TypeScript language shortcoming justifies a deviation, and only after the settled workaround is ruled out (`setX()` where a Ruby `x=` setter must be async, `include()`/`Included<>` and `this`-typed functions for Ruby `include`). "Cleaner in TS", "more idiomatic", and "the tests pass either way" are not language shortcomings.

**Converge, never ratify.** An existing deviation — a `call-mismatches-*-exclude` baseline row, an `arity-exclude.json` entry, a `SKIP_GROUPS` name, a `@noRailsEquivalent` / `@missingRailsCall` tag, a story under `0023-surfaced-deviations` — is debt, not permission. It is never a reason to match the shape, extend it, or add a sibling row. A diff that _adds_ one is recording a new deviation: review its `reason` at least as hard as the code, and treat a seeded placeholder or a reason that only restates the code as a finding.

The full standard, and the pre-PR gates that detect drift, are in [CLAUDE.md](../CLAUDE.md) — "Fidelity is the job" and "Before you open the PR".

## Project structure

Packages live under `packages/`:

- `packages/arel` — Query building and AST (Arel)
- `packages/activemodel` — Validations, callbacks, dirty tracking, serialization (ActiveModel)
- `packages/activerecord` — ORM layer tying Arel and ActiveModel together (ActiveRecord)
- `packages/activesupport` — Core utilities, inflection, caching, notifications, encryption (ActiveSupport)
- `packages/rack` — Web server interface, middleware, request/response (Rack)
- `packages/actionpack` — ActionDispatch (routing, cookies, sessions) and ActionController

Tests live next to source files as `*.test.ts`.

## Test names are sacred

Test names are derived from the Rails test suite and are how `parity:test` matches our tests to Rails tests. **Never suggest renaming or rewording test names**, even if they contain typos, unusual phrasing, or look wrong. The names must match Rails exactly. If a test name looks like a typo (e.g. "shallow" instead of "swallow", "Text" instead of "Test"), it matches the Rails source and should not be changed.

If a test is failing or the behavior doesn't match the name, the fix is in the test body or the implementation under test, not the test name.

## Tests may use local helpers intentionally

Many test files define local helper classes or functions instead of importing production code. This is often intentional — the tests are placeholders matching Rails test names, written ahead of the production implementation. Don't flag these as issues unless the test is actively asserting something incorrect.

## Duplicate tests across describe blocks may be intentional

Some tests appear in multiple `describe` blocks within the same file. This is sometimes needed because `parity:test` matches tests by their full path (describe > test name), and different Ruby test classes may have tests with the same name. Only flag duplicates if they are within the **same** describe block.

## Use the package ecosystem like Rails does

ActiveRecord's power comes from Arel. When building queries, subqueries, or SQL conditions in `activerecord`, use `@blazetrails/arel` (Table, SelectManager, Nodes, Attribute) to build AST nodes — never construct raw SQL strings. Similarly, use `@blazetrails/activemodel` for validations/callbacks and `@blazetrails/activesupport` for inflection/utilities rather than reimplementing them. If you see raw SQL string construction in activerecord, flag it — it should be using Arel.

## Code style

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Prefer small, focused modules over large files.
- Don't add code comments that just describe what the line does. Only add comments when they provide additional value.
- Use `vi.spyOn` and `vi.restoreAllMocks()` for mocking instead of manual save/restore patterns.
- Notification tests should clean up subscribers with `afterEach(() => Notifications.unsubscribeAll())`.
- Use fixed dates in tests instead of `new Date()` to avoid time-dependent flakiness.
- Be suspiscious of all Regexs - make sure that is how rails solves the problem as well.

## Measuring progress

Progress is primarily measured by `pnpm run parity:api`, which tracks class/module existence and file placement against Rails source. `pnpm run parity:test` matches our test files and test names against the actual Rails test suite. CI runs both on every push.
