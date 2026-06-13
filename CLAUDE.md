# trails — Claude guide

The rules and conventions for working in this repo. For the Rails-port
methodology — working principles, the `@internal` JSDoc convention, and how to
measure progress — see [CONTRIBUTING.md](CONTRIBUTING.md). For project overview,
package list, and the `declare` / associations / enums / schema reference, see
[README.md](README.md).

## Working in this repo

- Do use worktrees for any changes; leave the default worktree for the user.
  Always use `scripts/start-worktree.sh` to start a worktree.
- Do NOT use subagents unless explicitly requested.
- **AR work tracking lives in the `tasks` repo, not in docs.** Pick work via
  `pnpm tasks` (`ready` / `next-bundle` / `claim`) — never by hand-editing an
  `activerecord` plan doc. `docs/activerecord/` is frozen (RFC 0011 Phase 4);
  CI's `Docs ActiveRecord Freeze` job fails any PR that adds or modifies a
  file there (allowlist: `docs/activerecord/parity-verification.md`). Other
  `docs/` trees are not policed and stay live until their own cutover.
- Do NOT add "Co-Authored-By" lines to commits or "Generated with Claude
  Code" lines to PR descriptions.
- After opening a PR, run the `/link` skill with the PR number so webhook
  notifications (Copilot reviews, CI failures) are delivered to this pane.
  Copilot auto-reviews every PR and push; reviews land at
  `~/.btwhooks/data/github/blazetrailsdev/trails/$PR` — no need to request.
- **Do NOT run the whole test suite locally** (`pnpm test`, `pnpm -r test`,
  `pnpm --filter activerecord test`, etc.). CI runs the full suite on every
  push. Locally, run only the individual test files or small groups you
  touched: `pnpm vitest run path/to/file.test.ts` or
  `pnpm vitest run -t "specific test name"`. The full AR suite forks 6
  workers per invocation; multiple parallel agents running it concurrently
  saturate the host (load avg 100+).

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Tests live next to source files as `*.test.ts`.
- Prefer small, focused modules.
- **PR size ceiling: 500 LOC** (additions + deletions, excluding lockfiles,
  snapshots, and generated parity fixtures; docs-only changes — `.md` files,
  READMEs, RFC/story prose — are exempt). Check before opening with
  `git diff --shortstat origin/main...HEAD -- ':!**/pnpm-lock.yaml' ':!**/__snapshots__/**' ':!**/*.md'`
  (`.md` files are excluded because docs-only changes are exempt; subtract them
  manually if your PR mixes code and docs).
  Tests and fixtures count. The historical 20-method rule is a soft guide;
  500 LOC is the hard one — review-cycle data shows PRs ≥400 LOC need 4–6
  rounds minimum and ≥700 LOC need 13+, so 500 sits just above the 400-LOC
  inflection and well below the 700-LOC danger zone. **Do NOT fan out into
  sibling PRs yourself.** Keep each PR scoped to the single story you claimed;
  ship the portion that fits and register the rest as new stories. If the work
  is larger than one PR, or you discover additional work that belongs in a
  separate PR, do NOT open it yourself — add a new story to the epic with
  `pnpm tasks new <rfc-slug> <story-slug>` so it gets scheduled and owned
  separately. This keeps the one-agent-per-PR ownership model intact (a single
  agent fanning out N PRs and then dying orphans all of them — this happened).
  The only exception is a single mechanical rename — note it in the PR body.
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
  equivalent. Don't stub them; add them to a `SKIP_GROUPS` entry (with a
  reason) in `scripts/api-compare/conventions.ts`.
- If the method needs Model-specific state beyond the host interface,
  keep it in `model.ts` directly.
