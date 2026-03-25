# Copilot Instructions for rails-ts

## What this project is

A TypeScript monorepo that mirrors the Ruby on Rails API. Class names, method names, and call signatures should match Rails as closely as TypeScript allows. Someone reading the Rails API docs should be able to use these packages with near-identical intent and naming.

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

Test names are derived from the Rails test suite and are how `test:compare` matches our tests to Rails tests. **Never suggest renaming or rewording test names**, even if they contain typos, unusual phrasing, or look wrong. The names must match Rails exactly. If a test name looks like a typo (e.g. "shallow" instead of "swallow", "Text" instead of "Test"), it matches the Rails source and should not be changed.

If a test is failing or the behavior doesn't match the name, the fix is in the test body or the implementation under test, not the test name.

## Tests may use local helpers intentionally

Many test files define local helper classes or functions instead of importing production code. This is often intentional — the tests are placeholders matching Rails test names, written ahead of the production implementation. Don't flag these as issues unless the test is actively asserting something incorrect.

## Duplicate tests across describe blocks may be intentional

Some tests appear in multiple `describe` blocks within the same file. This is sometimes needed because `test:compare` matches tests by their full path (describe > test name), and different Ruby test classes may have tests with the same name. Only flag duplicates if they are within the **same** describe block.

## Use the package ecosystem like Rails does

ActiveRecord's power comes from Arel. When building queries, subqueries, or SQL conditions in `activerecord`, use `@rails-ts/arel` (Table, SelectManager, Nodes, Attribute) to build AST nodes — never construct raw SQL strings. Similarly, use `@rails-ts/activemodel` for validations/callbacks and `@rails-ts/activesupport` for inflection/utilities rather than reimplementing them. If you see raw SQL string construction in activerecord, flag it — it should be using Arel.

## Code style

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Prefer small, focused modules over large files.
- Don't add code comments that just describe what the line does. Only add comments when they provide additional value.
- Use `vi.spyOn` and `vi.restoreAllMocks()` for mocking instead of manual save/restore patterns.
- Notification tests should clean up subscribers with `afterEach(() => Notifications.unsubscribeAll())`.
- Use fixed dates in tests instead of `new Date()` to avoid time-dependent flakiness.

## Measuring progress

Progress is measured by `pnpm run test:compare`, which matches our test files and test names against the actual Rails test suite. CI runs this on every push.
