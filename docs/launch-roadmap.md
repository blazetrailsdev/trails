# Launch Roadmap

The goal: announce BlazeTrails publicly with a compelling story — "Rails,
rewritten in TypeScript" — backed by a working demo and rock-solid core packages.

## Current State (2026-03-30)

| Package          | Tests             | Coverage | Status                     |
| ---------------- | ----------------- | -------- | -------------------------- |
| activerecord     | 5,187/8,385       | 61.9%    | In progress                |
| activesupport    | 2,164/2,862       | 75.6%    | In progress                |
| actiondispatch   | 406/1,432         | 28.4%    | In progress (27 misplaced) |
| actioncontroller | 7/1,860           | 0.4%     | Early (229 misplaced)      |
| actionview       | 0/2,497           | 0%       | Not started                |
| trailties        | 93/2,411          | 3.9%     | Early                      |
| **Overall**      | **10,296/21,890** | **47%**  |                            |

Overall includes completed packages (arel 100%, activemodel 100%, rack 100%).

**Frontiers** (PR #281, draft): Interactive browser sandbox with WASM SQLite,
Monaco editor, CLI, sample databases, project management, and auth. 246 tests
across 15 files. Being split into mergeable chunks (see below).

## Announcement Bar

Before we announce, these must be true:

### Must be at 100%

These packages are the core story. They need to be fully passing so we can say
"we actually implemented this" without caveats.

- [ ] **activerecord** — 61.9%, biggest lift. ~3,200 tests to go (plus 2,960 skipped to unskip)
- [ ] **activesupport** — 75.6%, ~700 tests to go (plus 626 skipped to unskip)
- [ ] **Frontiers** — split from PR #281 and deployed (see Frontiers Split Plan below)

### Must work enough for demos

These don't need 100%, but they need to support the Frontiers demo flow: scaffold
a model, run migrations, start a server, hit JSON and HTML endpoints.

- [ ] **actioncontroller** — needs basic `render json:`, `render` (EJS templates),
      `before_action`, params, and standard CRUD actions. Currently at 0.4% — most
      tests are misplaced (229), not missing. Fix the misplacement first, then
      implement the basics.
- [ ] **actiondispatch** — routing, request/response, session basics. At 28.4%
      with 27 misplaced. Already has a foundation — needs the routes that scaffold
      generates (`resources`) to actually dispatch to controllers.
- [ ] **CLI** (`packages/cli`) — `trails new`, `trails generate`, `trails server`,
      `trails db:migrate`. The Frontiers sandbox already implements these commands
      in-browser; the real CLI needs to match.

### Nice to have

- [ ] **trailties** — application bootstrap, configuration. Would be great for
      `trails new` to produce a real runnable app, but not blocking.
- [ ] Marketing site polish (part of Frontiers split PR 1)
- [ ] README overhaul with code examples and badges
- [ ] npm publish of all packages

## Suggested Order of Attack

1. **ActiveSupport to 100%** — 626 skipped tests to unskip, ~700 remaining.
   Many are utility functions that can be knocked out methodically.
2. **ActiveRecord to 100%** — the big one. Work through the 100% plan in
   `docs/activerecord-100-percent.md`. Associations, migrations, validations,
   query interface are the priority areas.
3. **ActionController basics** — fix the 229 misplaced tests, then implement
   the rendering pipeline (JSON + EJS), params, filters, and CRUD.
4. **ActionDispatch routing** — `resources`, `root`, `get`/`post`/etc, and
   route-to-controller dispatch.
5. **CLI** — wire up the real CLI commands to match what Frontiers does in the
   browser.
6. **Merge Frontiers** — land the 3 split PRs (see below). Can start
   merging PR 1 and 2 immediately, PR 3 once core is solid.

## Frontiers Split Plan

PR #281 is 299 files and 25 commits behind main. Split into 3 PRs by
rebasing onto main and cherry-picking only the website files (the 212
non-website diffs are stale — main has moved ahead).

### PR 1: Marketing site + lint/CI (~35 files, merge immediately)

- `packages/website/` scaffolding: package.json, svelte.config.js,
  vite.config.ts, vitest.config.ts, tsconfig.json, app.html, app.css
- Marketing page: `routes/+page.svelte`, `routes/+layout.svelte`,
  wilderness hero SVG
- Lint/config: eslint.config.mjs, .prettierignore, root tsconfig,
  vitest.config.ts changes
- CI: `.github/workflows/ci.yml` website job
- Root: .gitignore, package.json, pnpm-lock.yaml updates

### PR 2: Automated docs site (~5 files, merge immediately)

Depends on PR 1.

- `routes/docs/+page.svelte`
- `typedoc.json`
- `scripts/generate-dts.js`
- Docs generation CI step

### PR 3: Frontiers sandbox (~60 files, merge when demo-ready)

Depends on PR 2. Potentially split further if needed.

- `src/lib/frontiers/` — 50 files: runtime, CLI, WASM SQLite adapter,
  virtual filesystem, transpiler, app server, sample databases,
  16 Svelte components, share/export, version history
- `routes/frontiers/+page.svelte` + `+page.ts`
- `server/` — API endpoints, auth (magic link), handler
- `Dockerfile.frontiers` for deployment
- `scripts/build-sw-sqljs.js`, node stubs
- 246 tests across 15 test files

## The Launch Post

Working title: **"BlazeTrails: Rails, rewritten in TypeScript"**

Key points to hit:

- Full Rails API fidelity — not inspired by, actually mirroring the API
- 19,000+ tests derived from the Rails test suite
- Arel query builder, ActiveRecord ORM, ActiveModel validations — all of it
- Try it in your browser (Frontiers link)
- MIT licensed, npm installable

The demo is what sells it. Someone should be able to go to Frontiers, run
`scaffold Post title:string body:text`, `db:migrate`, `server`, and see it work.
