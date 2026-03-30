# Getting to Hacker News

The goal: announce BlazeTrails on Hacker News with a compelling story — "Rails,
rewritten in TypeScript" — backed by a working demo and rock-solid core packages.

## Current State (2026-03-30)

| Package | Tests | Coverage | Status |
|---|---|---|---|
| arel | 703/707 | 99.4% | Near-complete |
| activemodel | 958/963 | 99.5% | Near-complete |
| activerecord | 5,187/8,385 | 61.9% | In progress |
| activesupport | 2,160/2,862 | 75.5% | In progress |
| rack | 764/773 | 98.8% | Near-complete |
| actiondispatch | 406/1,432 | 28.4% | In progress (27 misplaced) |
| actioncontroller | 7/1,860 | 0.4% | Early (229 misplaced) |
| railties | 39/2,411 | 1.6% | Early |
| **Overall** | **10,224/19,393** | **52.7%** | |

**Frontiers** (PR #281, draft): Interactive browser sandbox with WASM SQLite,
Monaco editor, CLI, sample databases, project management, and auth. 246 tests
across 15 files. Ready to merge once core packages are in shape.

## Announcement Bar

Before we announce, these must be true:

### Must be at 100%

These packages are the core story. They need to be fully passing so we can say
"we actually implemented this" without caveats.

- [ ] **arel** — 99.4%, just 4 tests away
- [ ] **activemodel** — 99.5%, just 5 tests away
- [ ] **activerecord** — 61.9%, biggest lift. ~3,200 tests to go (plus 2,960 skipped to unskip)
- [ ] **activesupport** — 75.5%, ~700 tests to go (plus 630 skipped to unskip)
- [ ] **rack** — 98.8%, 9 tests away
- [ ] **Frontiers** (PR #281) — merge and deploy

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

- [ ] **railties** — application bootstrap, configuration. Would be great for
  `trails new` to produce a real runnable app, but not blocking.
- [ ] Marketing site polish (landing page is in the Frontiers PR)
- [ ] README overhaul with code examples and badges
- [ ] npm publish of all packages

## Suggested Order of Attack

1. **Close out arel, activemodel, rack** — these are each <10 tests from 100%.
   Quick wins that move the overall number and let us check boxes.
2. **ActiveSupport to 100%** — 630 skipped tests to unskip, ~700 remaining.
   Many are utility functions that can be knocked out methodically.
3. **ActiveRecord to 100%** — the big one. Work through the 100% plan in
   `docs/activerecord-100-percent.md`. Associations, migrations, validations,
   query interface are the priority areas.
4. **ActionController basics** — fix the 229 misplaced tests, then implement
   the rendering pipeline (JSON + EJS), params, filters, and CRUD.
5. **ActionDispatch routing** — `resources`, `root`, `get`/`post`/etc, and
   route-to-controller dispatch.
6. **CLI** — wire up the real CLI commands to match what Frontiers does in the
   browser.
7. **Merge Frontiers** — once the core is solid, merge #281 and deploy.

## The HN Post

Working title: **"BlazeTrails: Rails, rewritten in TypeScript"**

Key points to hit:
- Full Rails API fidelity — not inspired by, actually mirroring the API
- 19,000+ tests derived from the Rails test suite
- Arel query builder, ActiveRecord ORM, ActiveModel validations — all of it
- Try it in your browser (Frontiers link)
- MIT licensed, npm installable

The demo is what sells it. Someone should be able to go to Frontiers, run
`scaffold Post title:string body:text`, `db:migrate`, `server`, and see it work.
