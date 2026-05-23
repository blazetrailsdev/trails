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

| Signal       | Status                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------ |
| api:compare  | **459/482 methods (95.2%)** — 42/46 files at 100%, 4 partial (all in deferred files below) |
| test:compare | **773/773 tests (100%)** — 40/40 files ✓                                                   |
| inheritance  | 41/43 (95.3%)                                                                              |

**All remaining 23 api:compare misses live in indefinitely-deferred files**
(`reloader.rb` 0/7, `directory.rb` 3/11, `files.rb` 4/8, `static.rb` 3/7).
Modulo those defers, rack is effectively at 100%. The only remaining
mechanical step is adding the four files to
`scripts/api-compare/unported-files.ts` so the headline number reads 100%.

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
- `Rack::Files` / `Rack::Static` / `Rack::Directory` / `Rack::Reloader` —
  static file middleware and Ruby-specific reloader; deferred (see
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

## Indefinite defers (do not port)

Add to `scripts/api-compare/unported-files.ts` to bring the headline
number to 100%:

- `reloader.rb` (7 misses) — Ruby `$LOADED_FEATURES` semantics; Node has
  no analog.
- `directory.rb` (8 misses) — directory listing middleware.
- `files.rb` (4 misses) — file serving middleware.
- `static.rb` (4 misses) — static file middleware.

Serverless deploys handle directory/static at the platform layer. If any
of these come back into scope, drop the exclusion and port.

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
