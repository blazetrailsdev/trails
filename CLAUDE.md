# trails — Claude guide

See [README.md](README.md) for project overview, package list, design principles,
and the full `declare` / associations / enums / schema reference. This file
contains only guidance specific to how Claude should work in this repo.

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

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Do NOT add "Co-Authored-By" lines to commits or "Generated with Claude
  Code" lines to PR descriptions.
- Tests live next to source files as `*.test.ts`.
- Prefer small, focused modules.
- **PR size ceiling: 300 LOC** (additions + deletions, excluding lockfiles,
  snapshots, and generated parity fixtures). Check before opening with
  `git diff --shortstat origin/main...HEAD -- ':!**/pnpm-lock.yaml' ':!**/__snapshots__/**'`.
  Tests and fixtures count. The historical 20-method rule is a soft guide;
  300 LOC is the hard one — review-cycle data shows PRs ≥400 LOC need 4–6
  rounds minimum and ≥700 LOC need 13+. If a feature is larger, split via the
  `<base>` / `<base>b` / `<base>c` pattern before opening. Splitting
  heuristic, in order:
  (1) impl + smoke test in `<base>`, full Rails-mirrored tests in `<base>b`;
  (2) public surface first, privates follow; (3) one Rails source file per
  PR when multiple are touched; (4) happy path vs edges only as a last
  resort. The only exception is a single mechanical rename — note it in the
  PR body.
- Do NOT use subagents unless explicitly requested.
- Do use worktrees for any changes; leave the default worktree for the user.
- Open new PRs in **draft** status.
- After opening a PR, run the `/link` skill with the PR number so webhook
  notifications (Copilot reviews, CI failures) are delivered to this pane.
  Copilot auto-reviews every PR and push; reviews land at
  `~/.btwhooks/data/github/blazetrailsdev/trails/$PR` — no need to request.
- Do NOT add code comments that just describe what a line does. Only add
  comments for non-obvious context (hidden bug, broader invariant, etc.).
- Do NOT add empty stubs or placeholder interfaces. If a feature isn't
  implemented yet, don't create an empty file for it.
- **NEVER rename or reword test names.** Test names are how `test:compare`
  matches our tests to Rails tests. If a test fails or the behavior doesn't
  match the name, fix the implementation — not the name. Read the
  corresponding Rails test first.

## Measuring progress

Primary signal: `pnpm run api:compare` (use `--package <name>` for one
package). "Misplaced" means tests exist but are in the wrong file per Rails
layout — they need to be moved, not rewritten.

Secondary signal: `pnpm test:types` — Vitest typecheck suites in
`packages/*/dx-tests/` that pin the public type contract and encode DX gaps
as assertions. When a gap closes, the assertion flips. A dedicated
`DX Type Tests` CI job runs on every push, as does a
`Virtualized DX Type Tests` job covering
`packages/activerecord/virtualized-dx-tests/` (compiled by `trails-tsc`).

The canonical manual-`declare` reference is
`packages/activerecord/dx-tests/declare-patterns.test-d.ts`; the zero-declare
virtualized reference is
`packages/activerecord/virtualized-dx-tests/virtualized-patterns.test-d.ts`.
Prefer the virtualized form for new model code (see README).
