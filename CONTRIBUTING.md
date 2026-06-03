# Contributing to trails

Conventions for contributing to trails, plus the Rails-port domain knowledge you
need to build features that match Rails. See [README.md](README.md) for project
overview, package list, and the `declare` / associations / enums / schema
reference, and [CLAUDE.md](CLAUDE.md) for rules specific to the Claude agent
harness.

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Tests live next to source files as `*.test.ts`.
- Prefer small, focused modules.
- **PR size ceiling: 500 LOC** (additions + deletions, excluding lockfiles,
  snapshots, and generated parity fixtures). Check before opening with
  `git diff --shortstat origin/main...HEAD -- ':!**/pnpm-lock.yaml' ':!**/__snapshots__/**'`.
  Tests and fixtures count. The historical 20-method rule is a soft guide;
  500 LOC is the hard one — review-cycle data shows PRs ≥400 LOC need 4–6
  rounds minimum and ≥700 LOC need 13+, so 500 sits just above the 400-LOC
  inflection and well below the 700-LOC danger zone. If a feature is larger, split via the
  `<base>` / `<base>b` / `<base>c` pattern before opening — these are sibling
  branches each off `main` with **non-overlapping files**, merged sequentially,
  **not** stacked branches (see "Do NOT stack PRs" below). Splitting heuristic,
  in order:
  (1) impl + smoke test in `<base>`, full Rails-mirrored tests in `<base>b`;
  (2) public surface first, privates follow; (3) one Rails source file per
  PR when multiple are touched; (4) happy path vs edges only as a last
  resort. The only exception is a single mechanical rename — note it in the
  PR body.
- **Do NOT stack PRs.** Each PR branches from `main` and stands alone.
  We don't have spare CI runners or review bandwidth — stacked branches
  (`<base>b` off `<base>`, `<base>c` off `<base>b`, etc.) re-run CI on
  every parent rebase and force Copilot/the human to re-review the same
  diff multiple times. They also produce file-overlap conflicts with
  sibling agents working in parallel. If a feature needs splitting,
  open each split PR from `main` with **non-overlapping files**; if
  true ordering is required, ship the first PR, wait for merge, then
  open the next from updated `main`.
- Open new PRs in **draft** status.
- Do NOT reply to PR comments — replies are invisible to reviewers. Address
  feedback via code changes or PR description edits instead, or discuss with
  the user in conversation.
- Do NOT add code comments that just describe what a line does. Only add
  comments for non-obvious context (hidden bug, broader invariant, etc.).
- Do NOT add empty stubs or placeholder interfaces. If a feature isn't
  implemented yet, don't create an empty file for it.
- **NEVER rename or reword test names.** Test names are how `test:compare`
  matches our tests to Rails tests. If a test fails or the behavior doesn't
  match the name, fix the implementation — not the name. Read the
  corresponding Rails test first.

## Working principles

- **Implementation-first.** The goal is to implement Rails features, not to
  flip skipped tests. Build the feature, then unskip the tests that prove it.
  Read the Rails source first to understand the expected behavior.
- **Read existing code before writing new code.** Trace how the codebase
  already handles the concern. Use the real persistence API (`isNewRecord()`,
  `isPersisted()`, `readAttribute()`, `writeAttribute()`) — not ad-hoc state.
  Handle composite primary keys (`primaryKey` can be `string | string[]`).
  Delegate to existing infrastructure; don't reimplement it.
- **Ship behavior, not signatures.** Never commit a method that matches a
  Rails API surface but returns null/undefined or only mutates in-memory
  state when Rails hits the DB. A missing method is better than a misleading
  one. `api:compare` coverage is a side effect of correct implementation.
- **Use the package ecosystem like Rails does.** In `activerecord`, build
  queries with `@blazetrails/arel` (Table, SelectManager, Nodes, Attribute) —
  never raw SQL strings. Use `@blazetrails/activemodel` for
  validations/callbacks and `@blazetrails/activesupport` for inflection.

## Module mixins (Ruby `include` → TypeScript)

Rails uses `include`/`extend` to mix module methods into a class. TS has no
equivalent, so we use **`this`-typed functions assigned directly to the class**.

```ts
// attribute-methods.ts
export function aliasAttribute(this: AttributeMethodHost, newName: string, oldName: string): void {
  this._attributeAliases[newName] = oldName;
}

// model.ts
import { aliasAttribute } from "./attribute-methods.js";
export class Model {
  static aliasAttribute = aliasAttribute;
}
```

Why: code lives in the file that matches Rails' layout (so `api:compare`
finds it), no delegation wrappers, type-checked via the host interface,
and `this` resolves to the actual subclass at runtime.

For **instance methods mixed in bulk** (like Rails' `include QueryMethods`),
use `include()` / `Included<>` from `@blazetrails/activesupport`. See
`activesupport/src/include.ts` and `relation.ts` + `relation/query-methods.ts`.

When NOT to use this:

- Ruby lifecycle hooks (`extended`, `included`, `inherited`) — no TS
  equivalent. Don't stub them; add them to the skip list in
  `scripts/api-compare/compare.ts`.
- If the method needs Model-specific state beyond the host interface,
  keep it in `model.ts` directly.

## Rails-private helpers and `@internal` JSDoc

**Rails-private helpers must carry `@internal` JSDoc.** The website's
TypeDoc build runs with `excludeInternal: true`, and the
`blazetrails/rails-private-jsdoc` ESLint rule (autofixable via
`pnpm lint --fix`) enforces it. The rule consults
`eslint/rails-private-methods.json`, regenerated by `pnpm api:compare`.
Active across all Rails-mirroring packages (`arel`, `activesupport`,
`activemodel`, `activerecord`, `actionpack`, `actionview`).

## Measuring progress

Primary signals: `pnpm run api:compare` (use `--package <name>` for one
package) and `pnpm run test:compare`. "Misplaced" means tests exist but are in
the wrong file per Rails layout — they need to be moved, not rewritten.

The canonical manual-`declare` reference is
`packages/activerecord/dx-tests/declare-patterns.test-d.ts`; the zero-declare
virtualized reference is
`packages/activerecord/virtualized-dx-tests/virtualized-patterns.test-d.ts`.
Prefer the virtualized form for new model code (see README).
