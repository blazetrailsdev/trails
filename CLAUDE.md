# trails — Claude guide

See [README.md](README.md) for the project overview, package list, design
principles, zero-declare `trails-tsc` workflow, and the Rails-to-TypeScript
idiom table.

## Working principles

- **Implementation-first.** The goal is to implement Rails features, not to
  flip skipped tests. Build the feature, then unskip the tests that prove it.
  Read the Rails source first to understand the expected behavior. A pinned
  sparse checkout lives at `scripts/api-compare/.rails-source/` in the main
  repo — no need to clone or go hunting. Populate it with
  `bash scripts/api-compare/fetch-rails.sh` if missing.
  **Before accepting any Copilot review suggestion on a Rails-port PR**, verify
  it against the Rails source — Copilot frequently suggests "safer" behavior
  that silently deviates from Rails semantics (e.g. adding fallbacks Rails
  doesn't have, using equality that differs from Rails' `Object#==` identity,
  extra index-keyed lookups Rails doesn't do). Reject suggestions that diverge;
  only accept perf improvements with no semantic change or genuine bugs.
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
  `pnpm run lint:deps` scores cross-package usage against Rails (e.g.
  ActiveRecord methods that should delegate to Arel) and flags gaps.

## Module mixins (Ruby `include` → TypeScript)

Rails uses `include`/`extend` to mix module methods into a class. We
reimplement both in `@blazetrails/activesupport`:

- `include()` / `Included<>` — bulk-mix instance methods, Rails-style. Mirrors
  Ruby's `include Mod`. See `packages/activesupport/src/include.ts`, and
  `packages/activerecord/src/relation.ts` +
  `packages/activerecord/src/relation/query-methods.ts` for real usage.
- `extend()` / `Extended<>` — same, but onto the class (static side).
- `concern()` / `includeConcern()` — our port of `ActiveSupport::Concern`
  (with `included`/`prepended` blocks and dependency resolution, matching
  `activesupport/lib/active_support/concern.rb` in the Rails source). See
  `packages/activesupport/src/concern.ts`.

For **one-off static methods** where a full Concern is overkill, prefer
**`this`-typed functions assigned directly to the class**:

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
- **PRs: max 20 methods each** unless they are very simple one-liners/getters,
  which can be grouped more liberally.
- **camelCase everywhere** — no snake_case identifiers, property names, or
  payload keys, even when the Rails equivalent uses snake_case. Never add
  `payload.lock_wait ?? payload.lockWait`-style fallbacks.
- **Never pipe long test runs to grep.** The full AR test suite takes ~8
  minutes. Redirect to a temp file (`>/tmp/x.log 2>&1`), then grep the file
  as many times as needed without re-running.
- Do NOT use subagents unless explicitly requested.
- Do use worktrees for any changes; leave the default worktree for the user.
  Always create them with the `EnterWorktree` skill so they land under
  `.claude/worktrees/` (gitignored) instead of scattered under `/tmp` or
  beside the repo. Do NOT run `git worktree add` directly — the
  `WorktreeCreate` hook in `.claude/settings.json` handles worktree creation,
  runs `pnpm install`, and symlinks vendored Rails/Rack sources automatically.
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

Two complementary scripts (both run in CI on every push; both take
`--package <name>`):

- `pnpm run api:compare` — matches our public methods against the Rails
  source, method by method. This is the coverage number that drives
  "implementation-first" — an unimplemented method shows up here.
- `pnpm run test:compare` — matches our test file names and `it()` /
  `it.skip()` descriptions against the Rails test suite. "Misplaced" means
  a test exists but is in the wrong file per Rails layout — move it, don't
  rewrite it. `pnpm run test:stubs` generates stub tests for unmatched
  Rails tests.
- `pnpm run lint:deps` — already mentioned above; scores cross-package
  delegation (e.g. ActiveRecord → Arel) against Rails.

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
