# @blazetrails/rack — Road to 100%

Mirror of `rack/rack` v3.1.14 vendored at
`vendor/rack/lib/rack/`.

Forward-only — completed slots live in git. Refresh counts:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
pnpm tsx scripts/api-compare/compare.ts --package rack --privates | tail -3
pnpm tsx scripts/api-compare/compare.ts --package rack --missing --incomplete
pnpm run test:compare 2>&1 | grep "^  rack  —"
```

Current (2026-05-23):

| Signal       | Status                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| api:compare  | **459/482 methods (95.2%)** — 42/46 files at 100%, 4 partial (3 in scope for slots 13–14, 1 deferred) |
| test:compare | **773/773 tests (100%)** — 40/40 files ✓                                                              |
| inheritance  | 41/43 (95.3%)                                                                                         |

**16 of the remaining 23 api:compare misses are in `directory.rb` (8),
`files.rb` (4), and `static.rb` (4)** — back in scope via slots 13–14 below.
The other 7 are in `reloader.rb` (indefinitely deferred).

---

## Cross-cutting priority — JS `Date` → `Temporal`

Touch opportunistically when working in `request.rb` cookie/forwarded-time,
`mock_response` cookie attribute parsing, `etag`/`conditional_get` HTTP-date
helpers, and `multipart` tempfile timestamps. Import `Temporal` from the
polyfill re-export (`import { Temporal } from "@blazetrails/activesupport/temporal"`)
— not the global — and prefer `Temporal.Instant` / `Temporal.ZonedDateTime`
over `new Date(...)` in new code.

---

## Cross-package leverage

Rack pieces that unblock work tracked in
[actionpack-100-percent.md](actionpack-100-percent.md):

| Rack gap                                                        | Unblocks in actionpack                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `multipart/uploaded_file` + `multipart/parser` + `multipart.rb` | `actiondispatch http/param_builder` UploadedFile adapter + rack-multipart bridge. ✓ |
| `request.parseMultipart` + `request.parseQuery`                 | Same multipart chain; query parsing unblocks AD Request param tests. ✓              |
| `query_parser`                                                  | AD param parsing tests. ✓                                                           |
| `mock_request` / `mock_response`                                | AD `testing/integration.rb` tail; IntegrationTest harness. ✓                        |
| `utils` `escape`/`escapePath`                                   | AD `routing/redirection.rackEscape` parity (TS-side only; ~30 LOC there).           |

**Out of scope for this gem:**

- `Rack::Session::*` (now `rack-session` gem in Rack 3) — needs a separate
  `@blazetrails/rack-session` package.
- `Rack::Handler::*` server adapters — Node has its own HTTP layer.
- `Rack::Reloader` — Ruby `$LOADED_FEATURES` semantics; no Node analog (see
  [Indefinite defers](#indefinite-defers)).

---

## Follow-ups from merged slots

Sized leftovers worth bundling into a fidelity sweep PR (~80–150 LOC total):

- **`rubyClassName()` helper** (~10 LOC, from #2264) — normalize
  `ParameterTypeError` messages so `Nil`/`String`/`Array` render as
  Ruby-style `NilClass` / `String` / `Array`.
- **Wire `getMultipartFileLimit` / `getMultipartTotalPartLimit`** (~30 LOC,
  from #2264) — into `multipart.ts` env construction so the Utils accessors
  actually affect parsing.
- **Wire `makeRequest` / `makeResponse` into `Events.call()`** (~10 LOC,
  from #2270) — replace inline `new Request(env)` / `EventResponse` construction.
- **Wire `h` into `ShowStatus.call()`** (~2 LOC, from #2270) — replace
  `escapeHtml(...)` with `this.h(...)`.
- **Wire `isCasecmp` into `URLMap.call()`** (~5 LOC, from #2270) — replace
  inline `.toLowerCase()` comparisons.
- **Remove `includeApp` alias / rename to `isInclude`** (from #2270) for
  Rails name parity on `Cascade`.
- **`host` getter IPv6 handling** (~10–15 LOC, from #2282) — rewrite to use
  `splitAuthority(this.env[HTTP_HOST])`; current naive `:` split breaks for
  `[::1]:8080`, which also corrupts `hostname`.
- **Align `multipart.ts` limit semantics** (from #2289) — `parser.ts` uses
  `>=` (Rails); `multipart.ts` still uses `>`. Same configured limit N
  produces different counts.
- **Align `multipart.ts` empty-filename behavior** (from #2289) —
  `parser.ts` creates a tempfile for `filename=""` (Rails-faithful);
  `multipart.ts` skips it. Pick one and document.

Stubs left intentionally unwired (no behavior change wanted right now,
documented for completeness):

- `makeRewindable` / `isFilesystemHasPosixSemantics` in `rewindable-input.ts`
  — JS uses in-memory Buffer; no-op stub.

---

## Remaining partial files

| File           | %   | Miss | Notes / slot                                                                                                                                                           |
| -------------- | --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directory.rb` | 27% | 8    | `get`, `checkBadRequest`, `checkForbidden`, `listDirectory`, `stat`, `listPath`, `entityNotFound`, `filesizeFormat`. fs via `@blazetrails/activesupport`. See slot 13. |
| `files.rb`     | 50% | 4    | `get`, `fail`, `mimeType`, `filesize`. Range-serving (BaseIterator/Iterator) via `@blazetrails/activesupport` fs. See slot 13.                                         |
| `static.rb`    | 43% | 4    | `isAddIndexRoot`, `overwriteFilePath`, `routeFile`, `applicableRules`. Pure routing + header-rule logic; delegates to `Files`. See slot 14.                            |

`reloader.rb` (7 misses, 0%) is intentionally unported — see [Indefinite defers](#indefinite-defers).

---

## PR slots

Slots 0–12 are shipped. Two remain.

- Slot 0 — extractor fix (#2257, 2026-05-22) — lifted baseline 52.5% → 60% ✓
- Slot 1 — `multipart/uploaded_file` + `multipart/generator` (#2260) ✓
- Slot 2 — `multipart/parser` part A (#2281) ✓
- Slot 3 — `multipart/parser` part B (#2289) + closeout (#2295, #2302) ✓
- Slot 4 — `multipart.rb` facade (#2290) ✓
- Slot 5 — `query_parser` + `utils.rb` config attrs (#2264, #2295) ✓
- Slot 6 — `request.rb` forwarded headers (#2280) ✓
- Slot 7 — `request.rb` predicates + accessors (#2282) ✓
- Slot 8 — `request.rb` parse internals + multipart bridge (#2288) ✓
- Slot 9 — `null_logger` 100% + `auth/abstract/request` + `auth/basic` (#2266) ✓
- Slot 10 — `response.rb` 100% (#2287) ✓
- Slot 11 — 3-miss leaves bundle (#2267) ✓
- Slot 12 — 2-miss + 1-miss leaves + version cleanup (#2270) ✓

13. **`files.rb` 100% + `directory.rb` 100%** (~250 LOC). `Files` serves
    static files with range support (BaseIterator/Iterator); `Directory`
    renders an HTML index for directory entries. Both use the
    `@blazetrails/activesupport` fs abstraction (`getFs()`). `Directory`
    depends on `Files`.
14. **`static.rb` 100%** (~80 LOC). Middleware wrapper around `Files`;
    pure URL-prefix routing + per-rule HTTP header injection. Any fs
    access goes through `getFs()` — depends on slot 13 landing first.

After slots 13–14 land, only `reloader.rb` (indefinitely deferred) remains.

**Cross-package follow-up** (not a rack slot): audit
activesupport/activemodel/actionpack api-compare diffs after #2257 for
similar `module_function` and sclass `attr_accessor` shifts; tracked in
the relevant package plan docs as they surface.

---

## Indefinite defers

The `unported-files.ts` exclusion entry for `reloader.rb` will be added in
slot 13 (the next implementation PR).

- `reloader.rb` (7 misses) — Ruby `$LOADED_FEATURES` semantics; Node has
  no analog. **Decision: defer indefinitely.**

`directory.rb`, `files.rb`, and `static.rb` were previously deferred but
are now back in scope — see slots 13–14 above.

---

## How to ship one PR

```bash
git fetch origin main
scripts/start-worktree.sh rack-<slot>
cd ~/github/blazetrailsdev/worktrees/rack-<slot>
less vendor/rack/lib/rack/<file>.rb
$EDITOR packages/rack/src/<file>.ts
$EDITOR packages/rack/src/<file>.test.ts
pnpm vitest run packages/rack/src/<file>.test.ts
pnpm tsx scripts/api-compare/compare.ts --package rack --privates | grep <file>
pnpm build && pnpm exec prettier --write packages/rack/src/<file>.{ts,test.ts}
git add -A && git commit -m "feat(rack): <subject>" && git push -u origin <branch>
gh pr create --draft --title "..." --body "..."
```

CLAUDE.md constraints apply (camelCase only; PR ≤ 300 LOC; mirror Rack
source first; this-typed mixin pattern; open PRs as draft; `/link` after).
