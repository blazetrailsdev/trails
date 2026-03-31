# WS1: Foundation + Docs Tutorial

## Dependencies

- Base: `main` branch
- Client-side only — Frontiers host backend only serves static `.sqlite` files (no dynamic API); tutorial app controllers/routes run entirely inside the in-browser runtime

## Approach

TDD throughout. Every PR starts with tests that define the contract. Tutorial content has automated replay tests that run in CI.

---

## Key Design Decisions

### Anchor-based diffs, not line numbers

See [Anchor-based diffs in the Frontiers README](./README.md#anchor-based-diffs-not-line-numbers) for the canonical explanation and `DiffHunk` interface definition.

### Generator output fixtures

Snapshot tests capture every generator command's output. Content authors write anchors against these. Generator changes break the snapshot first.

### Automated tutorial replay

Each tutorial has a replay test: boot `createRuntime()`, execute every action, assert every checkpoint. Runs in CI.

### Terminal is decoupled

Tutorials use `CliAction.svelte` (Run button → `runtime.exec()`). Terminal enhancement is a separate non-blocking PR.

---

## Parallelization

```
         PR 1 ──→ PR 3 ────────────┐
           (diff)  (UI)             │
                                    │
         PR 2 ──────────────────────┤
           (fixtures)               │
                                    ├──→ PR 7 ──→ PR 8 ──→ PR 10
         PR 4 ──────────────────────┤    (docs    (docs    (static
           (diagrams)               │     1–4)     5–8)     .sqlite)
                                    │
         PR 5a ──→ PR 5b            │
           (move)  (landing)        │
                 ──→ PR 5c          │
                   (create)         │
                 ──→ PR 5d ─────────┘
                   (tutorial step)

         PR 6 ──────────────────────┘
           (monaco)

         PR 9 (terminal) — anytime, non-blocking
         PR 11 (service worker) — anytime after PR 10
```

**Five independent tracks can start simultaneously:**

- **Track A:** PR 1 (diff engine) → PR 3 (UI components that import it)
- **Track B:** PR 2 (generator fixtures) — only needs existing `runtime.exec()`
- **Track C:** PR 4 (diagram renderer) — standalone
- **Track D:** PR 6 (Monaco highlights) — only touches `Monaco.svelte`
- **Track E:** PR 5a (move sandbox)

**After PR 5a, three pages can parallel:**

- PR 5b (landing page) — no runtime, just links and feature showcase
- PR 5c (create page) — loads .sqlite / runs generators, saves to ProjectStore
- PR 5d (tutorial step page) — the complex one, also needs PR 3 + PR 4

**All tracks merge for content:**

- PR 7 (docs 1–4) needs PR 1 + PR 2 + PR 3 + PR 5d
- PR 8 (docs 5–8) needs PR 7
- PR 10 (static .sqlite) needs PR 8

**Non-blocking:**

- PR 9 (terminal) can land anytime after PR 5a

---

## PR Sequence

### PR 1: Diff engine with anchor-based hunks

**Size:** ~3 files. Small.

**Write tests first:**

```
src/lib/frontiers/tutorials/
  diff-engine.test.ts
```

Tests define the contract:

- `applyDiff` with `operation: "create"` — writes new file to VFS
- `applyDiff` with `operation: "delete"` — removes file
- `applyDiff` with `operation: "modify"` and anchor hunks:
  - `position: "after"` — inserts lines after anchor
  - `position: "before"` — inserts lines before anchor
  - `position: "replace"` — replaces anchor line(s)
- Anchor not found → `{ success: false, error }`
- Multiple hunks in one diff
- `isDiffApplied` — detects when insert lines already present near anchor
- `isDiffApplied` on "create" — checks file exists with matching content
- `runCheck` for each CheckSpec: `table_exists`, `file_exists`, `file_contains`, `query_returns`, `route_responds`
- `runCheckpoint` — aggregates checks, returns `allPassed`
- `computeHighlightRanges` — returns line ranges for Monaco

**Then implement:**

```
src/lib/frontiers/tutorials/
  types.ts
  diff-engine.ts
```

Tests use real `SqlJsAdapter` + `VirtualFS` + `createRuntime()`. No mocks.

---

### PR 2: Generator output fixtures

**Size:** ~2 files. Small. **Parallel with PR 1.**

**Write tests first:**

```
src/lib/frontiers/tutorials/
  generator-fixtures.test.ts
```

Snapshots every generator command used in any tutorial:

- `new docs` → file paths + content
- `generate model User name:string email:string` → model + migration content
- `generate model Folder name:string user_id:integer parent_id:integer`
- `generate model Document title:string body:text user_id:integer folder_id:integer`
- All Music generators (Artist, Album, Track, Genre, join table migrations)
- All Finances generators (Account, Category, Transaction, Budget)

Each test boots a runtime, runs `exec()`, asserts:

- Expected files created (by path pattern, timestamps ignored)
- Content matches snapshot (structure exact, timestamps placeholder)

**Then implement:**

```
src/lib/frontiers/tutorials/
  generator-fixtures.ts   — Exported fixtures for content authors
```

---

### PR 3: Tutorial UI components

**Size:** 7 components + 3 test files. Medium. **Depends on PR 1.**

**Write tests first:**

```
src/lib/frontiers/components/tutorial/
  DiffViewer.test.ts
  CliAction.test.ts
  CheckpointPanel.test.ts
```

**Then implement:**

```
src/lib/frontiers/components/tutorial/
  StepContent.svelte      — Prose blocks, actions, checkpoint, feature tags
  ActionCard.svelte        — Dispatches to CliAction or DiffViewer
  CliAction.svelte         — Command + Run button + output
  DiffViewer.svelte        — Diff display with Apply button, anchor context,
                             filename click → onfileclick
  DiagramBlock.svelte      — Lazy Mermaid render
  CheckpointPanel.svelte   — Verify button, pass/fail per check
  StepNav.svelte           — Breadcrumb, dots, prev/next
```

DiffViewer reads the target file from VFS and shows 2 lines of context around the anchor, so users see WHERE the change goes.

---

### PR 4: Diagram renderer

**Size:** 2 files. Tiny. **Parallel with PR 1.**

**Write tests first:**

```
src/lib/frontiers/tutorials/
  diagram-renderer.test.ts
```

**Then implement:**

```
src/lib/frontiers/tutorials/
  diagram-renderer.ts
```

Lazy mermaid import, earth-tone theme variables, error handling.

---

### PR 5a: Move sandbox to /frontiers/project

**Size:** File moves + 1 new stub page. Small. **Parallel with PR 1.**

Move the existing `/frontiers` sandbox:

```
src/routes/frontiers/+page.svelte    → src/routes/frontiers/project/+page.svelte
src/routes/frontiers/+page.ts        → src/routes/frontiers/project/+page.ts
```

Replace `/frontiers/+page.svelte` with a temporary redirect to `/frontiers/project` so nothing breaks during development. The real landing page comes in PR 5b.

**Review criteria:**

- `/frontiers/project` loads the full sandbox IDE
- `/frontiers` redirects to `/frontiers/project` (temporary)
- No functional changes to the sandbox itself

---

### PR 5b: Frontiers landing page

**Size:** 1 page. Small. **Depends on PR 5a.**

**Write tests first:**

```
src/routes/frontiers/
  landing.test.ts         — /frontiers renders landing content
                            Renders 3 tutorial cards from registry
                            Renders "Create your own" CTA linking to /frontiers/new
                            Renders feature showcase sections
                            Lists user projects from ProjectStore (if any)
```

**Then implement:**

```
src/routes/frontiers/
  +page.svelte              ← /frontiers — Landing page:
                               Tutorial cards (Docs/Music/Finances) → /frontiers/learn/{slug}/1
                               "Create your own" CTA → /frontiers/new
                               Feature showcase (Terminal, Editor, Database, SQL, Preview)
                               User's projects from ProjectStore → /frontiers/project
```

Replaces the temporary redirect from PR 5a. No runtime loaded — this is a static-ish page
that reads ProjectStore for the project list.

**Review criteria:**

- Landing test passes
- Tutorial cards link to correct learn URLs
- Feature showcase describes each Frontiers tool
- Projects list loads from ProjectStore (empty state handled)
- Mobile-friendly: single-column stack below 768px, 44px minimum tap targets

---

### PR 5c: Create page (/frontiers/new)

**Size:** 1 page + route test. Small. **Depends on PR 5a.**
**Can parallel with PR 5b** (no shared files).

**Write tests first:**

```
src/routes/frontiers/new/
  new.test.ts             — /frontiers/new renders create form
                            Template picker shows options from templates.ts
                            Tutorial fork cards shown for completed tutorials
                            Creating a new app:
                              runs createRuntime() + exec("new {name}")
                              saves to ProjectStore
                              redirects to /frontiers/project
                            Forking a tutorial:
                              fetches static .sqlite from /tutorials/{slug}.sqlite
                              loads into runtime via loadDB()
                              saves to ProjectStore
                              redirects to /frontiers/project
```

**Then implement:**

```
src/routes/frontiers/new/
  +page.ts                  ← SSR disabled
  +page.svelte              ← /frontiers/new:
                               "New app" section:
                                 Name input
                                 Template picker (blank, blog, e-commerce, API from templates.ts)
                                 Create button → createRuntime() + exec("new {name}")
                               "From tutorial" section:
                                 Cards for Docs/Music/Finances
                                 Each loads static .sqlite from backend
                               On create → save to ProjectStore → redirect /frontiers/project
```

**Review criteria:**

- New test passes
- New app flow creates project and redirects
- Tutorial fork fetches .sqlite, loads it, saves to ProjectStore
- Template picker shows all templates from templates.ts
- Name validation (no empty, no duplicates)

---

### PR 5d: Tutorial step page and learn routes

**Size:** 4 route files + test. Medium. **Depends on PR 5a + PR 3 + PR 4.**

This is the most complex page — the two-column tutorial layout with pane visibility.

**Write tests first:**

```
src/routes/frontiers/learn/
  learn.test.ts           — /frontiers/learn renders 3 tutorial cards
                            /frontiers/learn/docs redirects to /frontiers/learn/docs/1
                            /frontiers/learn/docs/1 renders step content
                            /frontiers/learn/foo → error (invalid slug)
                            /frontiers/learn/docs/99 → error (out of range)
                            Step page loads runtime from ProjectStore (tutorial-{slug})
                            Step page creates fresh runtime if no project exists
                            Pane visibility matches step.panes array
                            Navigating between steps preserves runtime
```

**Then implement:**

```
src/routes/frontiers/learn/
  +page.ts                  ← SSR disabled
  +page.svelte              ← /frontiers/learn — Tutorial listing (3 cards)
  [tutorial]/
    +page.svelte            ← Redirect to step 1
    [step]/
      +page.ts              ← Validate slug against registry, step against stepCount
      +page.svelte           ← Tutorial step page:
                               Layout: left (StepContent, scrollable) + right (sandbox panes)
                               Pane visibility: only render panes in step.panes
                               Tab panel filtered to visible panes
                               Runtime lifecycle:
                                 Load tutorial-{slug} from ProjectStore, or createRuntime()
                                 Auto-save on changes (debounced)
                               Wiring:
                                 onfileclick → open in Monaco
                                 onchange → refresh file tree + database browser
                               Step data loaded via registry.loadSteps() (lazy import)
```

**Step page layout:**

```
+----------------------------------------------------------+
| StepNav: Learn / Docs / Step 3   ●●●○○○○○   [Prev][Next] |
+----------------------------+-----------------------------+
|                            | File Tree  | Monaco Editor  |
|  Tutorial Content          |            |                |
|  (scrollable left column)  +------------+                |
|                            | Tabs: (filtered by panes)   |
|  - Prose                   | Database | SQL | Results    |
|  - Diagrams                |                             |
|  - CLI actions (Run)       |                             |
|  - Diff viewers (Apply)    |                             |
|  - Checkpoint (Verify)     +-----------------------------+
|                            | CLI (TasksPanel)             |
+----------------------------+-----------------------------+
```

**Review criteria:**

- Learn tests pass
- Tutorial listing shows 3 cards
- Step page renders content and sandbox side by side
- Pane visibility changes between steps (e.g., step 1 has no Database tab, step 2 does)
- Runtime persists across step navigation (no re-init)
- Invalid slugs/steps handled gracefully
- Mobile-friendly: stacks vertically below 768px, sandbox panes as collapsible accordions, step nav sticky at bottom on mobile

---

### PR 6: Monaco highlight decorations

**Size:** 1 file change + test. Small. **Parallel with PR 1.**

**Write tests first:**

```
src/lib/frontiers/
  Monaco.test.ts
```

**Then implement:**

- Add `highlights` prop to `Monaco.svelte`
- Apply `IModelDeltaDecoration` with green/yellow gutter + background
- Clear on file change or highlights change
- Wire from DiffViewer click → highlights → editor scrolls

---

### PR 7: Docs tutorial content — steps 1–4

**Size:** 6 files (registry + index + 4 steps + replay test). Medium.
**Depends on:** PR 1, PR 2, PR 3, PR 5d.

**Write tests first:**

```
src/lib/frontiers/tutorials/docs/
  docs-replay.test.ts     — Boots createRuntime(), replays steps 1–4:
                            Step 1: exec("new docs"), assert checkpoint
                            Step 2: exec("generate model User ..."),
                                    exec("db:migrate"), assert checkpoint
                            Step 3: exec("generate model Folder ..."),
                                    exec("generate model Document ..."),
                                    exec("db:migrate"), assert checkpoint
                            Step 4: applyAllDiffs, assert checkpoint
                            Validates: rule of threes, panes arrays,
                            anchors resolve, diagrams parse
```

**Then implement:**

```
src/lib/frontiers/tutorials/
  registry.ts               — All 3 tutorials (Music/Finances stubs)
  docs/
    index.ts
    steps/step-01.ts        — "Welcome to Frontiers"
    steps/step-02.ts        — "Your First Model"
    steps/step-03.ts        — "Documents and Folders"
    steps/step-04.ts        — "Relationships"
```

---

### PR 8: Docs tutorial content — steps 5–8

**Size:** 4 step files + extend replay test. Medium. **Depends on PR 7.**

**Write tests first — extend replay:**

```
docs-replay.test.ts       — Steps 5–8:
                            Seed SQL valid, query SQL returns rows,
                            controllers execute, routes respond 200,
                            all checkpoints pass
```

**Then implement:**

```
steps/step-05.ts            — "Seeding Data"
steps/step-06.ts            — "Querying Your Data"
steps/step-07.ts            — "Building an API"
steps/step-08.ts            — "Putting It All Together"
```

---

### PR 9: Terminal enhancement (non-blocking)

**Size:** 2 files + test. Medium. **Can land anytime after PR 5a.**

Research Ghostty WASM → if unavailable, use xterm.js.

**Write tests first:**

```
src/lib/frontiers/components/
  Terminal.test.ts
```

**Then implement:**

```
src/lib/frontiers/components/
  Terminal.svelte
src/lib/frontiers/
  trail-cli.ts              — Add ANSI color codes (backwards-compatible)
```

---

### PR 10: Static tutorial snapshots

**Size:** Build script + 1 static file (docs.sqlite). Small. **Depends on PR 8.**

**Write tests first:**

```
src/lib/frontiers/tutorials/
  snapshot-builder.test.ts  — Runs full docs replay, exports DB,
                              reimports into fresh runtime,
                              asserts all final-state checks pass
```

**Then implement:**

```
scripts/
  build-tutorial-snapshots.ts — Runs replay for each tutorial,
                                 exports runtime.exportDB() to packages/website/static/tutorials/{slug}.sqlite
packages/website/static/tutorials/
  docs.sqlite                 — Pre-built completed Docs tutorial
```

The `/frontiers/new` page fetches these via `fetch("/tutorials/docs.sqlite")`, loads into a fresh runtime via `runtime.loadDB()`, saves to ProjectStore.

---

### PR 11: Service worker for offline support

**Size:** 1 file + test. Small. **Depends on PR 10** (needs static assets to be finalized).

The app already runs entirely client-side — this PR caches the assets so it works without a network connection after first visit.

**Write tests first:**

```
src/
  service-worker.test.ts    — SW registers on page load
                              Static assets cached on install (app shell, WASM, Monaco, Mermaid, fonts)
                              Cached pages served when offline
                              Tutorial .sqlite snapshots cached on first fetch
                              Cache invalidated when tutorialVersion changes
                              Stale app shell triggers background update + "Refresh for updates" banner
```

**Then implement:**

```
src/
  service-worker.ts         — SvelteKit service worker using $service-worker module
```

Caching strategy:

| Asset                         | Strategy               | Notes                                         |
| ----------------------------- | ---------------------- | --------------------------------------------- |
| App shell (HTML/JS/CSS)       | Stale-while-revalidate | Background update, notify user on new version |
| sql.js WASM binary            | Cache-first            | Versioned filename, ~1MB                      |
| Monaco workers + languages    | Cache-first            | Versioned, ~2-3MB                             |
| Mermaid                       | Cache-first            | Lazy loaded, ~500KB                           |
| Fonts (JetBrains Mono, Inter) | Cache-first, immutable | ~200KB                                        |
| Tutorial `.sqlite` snapshots  | Cache-first            | Refetch when `tutorialVersion` changes        |

On version mismatch (new deploy), show a non-blocking banner: "A new version is available. Refresh to update." Don't force-reload — the user may be mid-tutorial.

**Review criteria:**

- Service worker test passes
- First visit caches all required assets
- Second visit with network disabled loads the full tutorial flow
- New deploy triggers background update + user notification
- Tutorial `.sqlite` cache respects version changes

---

## Test Summary

| PR  | Tests                        | Parallel?                      |
| --- | ---------------------------- | ------------------------------ |
| 1   | `diff-engine.test.ts`        | Start immediately              |
| 2   | `generator-fixtures.test.ts` | Start immediately              |
| 4   | `diagram-renderer.test.ts`   | Start immediately              |
| 6   | `Monaco.test.ts`             | Start immediately              |
| 5a  | (manual verification)        | Start immediately              |
| 3   | Component `.test.ts` files   | After PR 1                     |
| 5b  | `landing.test.ts`            | After PR 5a                    |
| 5c  | `new.test.ts`                | After PR 5a (parallel with 5b) |
| 5d  | `learn.test.ts`              | After PR 5a + PR 3 + PR 4      |
| 7   | `docs-replay.test.ts` (1–4)  | After PR 1+2+3+5d              |
| 8   | `docs-replay.test.ts` (5–8)  | After PR 7                     |
| 9   | `Terminal.test.ts`           | Anytime after PR 5a            |
| 10  | `snapshot-builder.test.ts`   | After PR 8                     |
| 11  | `service-worker.test.ts`     | After PR 10                    |

**5 PRs can start day one in parallel: PR 1, PR 2, PR 4, PR 5a, PR 6.**
**After PR 5a: PRs 5b, 5c, 5d can parallel (5d waits on PR 3 + PR 4 too).**
