# trails — Claude guide

Rules specific to the Claude agent harness in this repo. For contributor
conventions (commit format, PR sizing, test layout) and Rails-port domain
knowledge (working principles, module mixins, measuring progress), see
[CONTRIBUTING.md](CONTRIBUTING.md). For project overview, package list, and the
`declare` / associations / enums / schema reference, see [README.md](README.md).

## Working in this repo

- Do use worktrees for any changes; leave the default worktree for the user.
  Always use `scripts/start-worktree.sh` to start a worktree.
- Do NOT use subagents unless explicitly requested.
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
