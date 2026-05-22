# @blazetrails/rack — Road to 100%

Mirror of `rack/rack` v3.1.14 vendored at
`scripts/api-compare/.rails-source/rack/lib/rack/`.

Forward-only — completed slots live in git. Refresh counts:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
pnpm tsx scripts/api-compare/compare.ts --package rack --privates | tail -3
pnpm tsx scripts/api-compare/compare.ts --package rack --missing --incomplete
pnpm run test:compare 2>&1 | grep "^  rack  —"
```

Current (2026-05-22):

| Signal       | Status                                   |
| ------------ | ---------------------------------------- |
| api:compare  | **289/482 methods (60%)** — 38/46 files  |
| test:compare | **773/773 tests (100%)** — 40/40 files ✓ |
| inheritance  | 35/36 (97.2%)                            |

Baseline lifted by PR #2257 (extractor fix for `module_function` +
sclass `attr_accessor`), which removed 68 phantom misses from
`content_length.rb` and `content_type.rb` without any port work.

test:compare is name-match only (path + description), not behavior. The
773/773 means every Ruby test name has a TS slot — many of those slots
have stub-ish bodies or test simpler behavior than Rails because the
underlying API isn't ported yet. **As each api-compare slot below lands,
audit the matching test bodies and replace stub assertions with real
ones.** Treat test:compare 100% as "right shape, wrong depth."

---

## Cross-package leverage

Rack pieces that unblock work tracked in
[actionpack-100-percent.md](actionpack-100-percent.md):

| Rack gap                                  | Unblocks in actionpack                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `multipart/uploaded_file` (6 methods)     | `actiondispatch http/param_builder` UploadedFile adapter (~30 LOC).                     |
| `multipart/parser` + `multipart` (30)     | `actiondispatch http/param_builder` rack-multipart → AD multipart bridge.               |
| `request.parse_multipart` + friends       | Same.                                                                                   |
| `query_parser` (12)                       | AD param parsing tests (~57 missing test:compare cases under Request/Response cluster). |
| `mock_request` (1) / `mock_response` (3)  | AD `testing/integration.rb` tail (3 methods); IntegrationTest harness.                  |
| `utils` `escape`/`escapePath` (already ✓) | AD `routing/redirection.rackEscape` parity (TS-side only; ~30 LOC there).               |

**Out of scope for this gem** — Rack 3.x extracted these into separate
gems we do not vendor today:

- `Rack::Session::*` (now `rack-session` gem) — AD's
  `Session::Abstract::Persisted` blocker is not solved here.
- `Rack::Handler::*` server adapters — Node has its own HTTP layer.
- `Rack::Files` / `Rack::Static` are present but TS side targets serverless
  static asset pipelines; treat as low priority.

---

## Files at 100% (10)

`body_proxy`, `config`, `content_length`, `content_type`, `head`, `lint`,
`logger`, `mime`, `runtime`, `tempfile_reaper`. Leave alone.

## Files at 0% — full ports needed (8)

| File                         | Methods | Size estimate | Notes / blockers                                                                                                                                      |
| ---------------------------- | ------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/abstract/request.rb`   | 8       | ~60 LOC       | Wraps a `Rack::Request` with `authorization`/`credentials` accessors. Leaf.                                                                           |
| `auth/basic.rb`              | 3       | ~40 LOC       | Subclass of `Auth::AbstractHandler`. Depends on `auth/abstract/request`.                                                                              |
| `multipart/parser.rb`        | 25      | ~400 LOC      | **Largest single file**. State-machine parser. Split: state machine + handlers in PR-a (~250), buffering helpers + boundary detection in PR-b (~250). |
| `multipart/generator.rb`     | 6       | ~80 LOC       | Symmetrical to parser; for mock requests. Leaf.                                                                                                       |
| `multipart/uploaded_file.rb` | 6       | ~50 LOC       | Tempfile wrapper. **Direct AD blocker.** Leaf.                                                                                                        |
| `query_parser.rb`            | 12      | ~150 LOC      | Class extracted from `Utils` in Rack 3. Used by `Request`. Mostly mechanical port.                                                                    |
| `reloader.rb`                | 7       | ~80 LOC       | Mtime-based file reloader. Likely indefinite-defer for Node (no Ruby `$LOADED_FEATURES`). Document & exclude.                                         |
| `version.rb`                 | 1       | ~5 LOC        | Just `release` constant. Trivial.                                                                                                                     |

## Partial files (≥1 miss, sorted by miss count)

| File                                                                                                                                                                                                    | %      | Miss   | Notes / slot                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request.rb`                                                                                                                                                                                            | 61%    | 34     | Biggest behavioral gap. Split into 3: **forwarded-headers** (forwardedFor/Port/Authority/Scheme + priorities, ~120), **predicates+accessors** (isLink/Trace/Unlink, referer, logger, contentCharset, hostname, serverName, ~80), **internals** (parseHttpAcceptHeader, parseQuery, parseMultipart, splitHeader/Authority, expandParamPairs, wrapIpv6, rejectTrustedIpAddresses, defaultSession, ~150). |
| `null_logger.rb`                                                                                                                                                                                        | 44%    | 18     | Logger interface stubs (`debugBang`, `errorBang`, level/progname/formatter accessors, `add`, `log`, `reopen`). ~80 LOC, one PR.                                                                                                                                                                                                                                                                        |
| `utils.rb`                                                                                                                                                                                              | 81%    | 8      | All module-level config attrs (`defaultQueryParser=`, `multipartTotalPartLimit=`, `multipartFileLimit=`, `paramDepthLimit=`). ~60 LOC. Bundle with `query_parser` port.                                                                                                                                                                                                                                |
| `directory.rb`                                                                                                                                                                                          | 27%    | 8      | Directory listing middleware. Likely defer — we don't ship this for serverless deploys. Document.                                                                                                                                                                                                                                                                                                      |
| `response.rb`                                                                                                                                                                                           | 87%    | 8      | `isForbidden`, `isInclude`, `setCookieHeader=`, `doNotCacheBang`, `cacheBang`, `bufferedBodyBang`, `append`. ~80 LOC. Leaf.                                                                                                                                                                                                                                                                            |
| `multipart.rb`                                                                                                                                                                                          | 29%    | 5      | `toParamsHash`, `makeParams`, `normalizeParams`, `extractMultipart`, `buildMultipart`. Bundle with parser/generator PR.                                                                                                                                                                                                                                                                                |
| `show_exceptions.rb`                                                                                                                                                                                    | 50%    | 4      | `isAcceptsHtml`, `dumpException`, `pretty`, `h`. ~60 LOC.                                                                                                                                                                                                                                                                                                                                              |
| `files.rb`                                                                                                                                                                                              | 50%    | 4      | `get`, `fail`, `mimeType`, `filesize`. Defer alongside directory.rb if we don't ship static file middleware.                                                                                                                                                                                                                                                                                           |
| `static.rb`                                                                                                                                                                                             | 43%    | 4      | `isAddIndexRoot`, `overwriteFilePath`, `routeFile`, `applicableRules`. Same defer call.                                                                                                                                                                                                                                                                                                                |
| `builder.rb`                                                                                                                                                                                            | 69%    | 4      | `call`, `generateMap`, `loadFile`, `app`. ~50 LOC. Leaf.                                                                                                                                                                                                                                                                                                                                               |
| `mock_response.rb`                                                                                                                                                                                      | 73%    | 3      | `match`, `parseCookiesFromHeader`, `identifyCookieAttributes`. ~50 LOC.                                                                                                                                                                                                                                                                                                                                |
| `etag.rb`                                                                                                                                                                                               | 40%    | 3      | `isEtagStatus`, `isSkipCaching`, `digestBody`. ~40 LOC.                                                                                                                                                                                                                                                                                                                                                |
| `headers.rb`                                                                                                                                                                                            | 86%    | 3      | `hasKey`, `transformKeysBang`, `downcaseKey`. Tiny; bundle with another small PR.                                                                                                                                                                                                                                                                                                                      |
| `events.rb`, `urlmap.rb`, `recursive.rb`, `rewindable_input.rb`                                                                                                                                         | 50–78% | 2 each | Tiny leaves; bundle into one "small leftovers" PR.                                                                                                                                                                                                                                                                                                                                                     |
| `cascade.rb`, `common_logger.rb`, `conditional_get.rb`, `deflater.rb`, `lock.rb`, `media_type.rb`, `method_override.rb`, `sendfile.rb`, `show_status.rb`, `mock_request.rb`, `auth/abstract/handler.rb` | 67–91% | 1 each | One-method leaves. Bundle into one or two "tail" PRs.                                                                                                                                                                                                                                                                                                                                                  |

## Extractor artifacts — resolved by PR #2257

PR #2257 fixed two `extract-ruby-api.rb` bugs that affected this gem:
`module_function` methods were emitted as instance methods of every
class that `include`d the module (so `Rack::Utils`'s 34 module methods
were credited as phantom misses on ContentLength/ContentType/Request),
and singleton-class `attr_accessor` declarations weren't tracked at all.
Outcome: baseline rose 52.5% → 60% with no port work; both files at 100%.

<details><summary>Historical record of the artifact (pre-#2257)</summary>

| File                | %   | Miss | Theory                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content_length.rb` | 6%  | 34   | All 34 misses are `Rack::Utils.*` module methods (escape, parseQuery, parseCookiesHeader, …). `Rack::Utils` is mixed into `ContentLength` via Ruby `include`; if our TS side doesn't include Utils, api-compare's inheritance-expansion flags them. **Action:** confirm with `Rack::Utils` Ruby source; either include in TS or filter in extractor. |
| `content_type.rb`   | 6%  | 34   | Same as content_length — identical 34-method list. Same fix.                                                                                                                                                                                                                                                                                         |

</details>

---

## Suggested PR slots (sized to ~250 LOC, ≤300 LOC ceiling)

Order roughly by leverage and unblocking:

1. ~~**Extractor fix — `module_function` propagation**~~ — **shipped in #2257**
   (54 LOC). Closed content_length/content_type at 100% and lifted baseline
   to 60%.
2. **`multipart/uploaded_file` + `multipart/generator`** (~200 LOC). Directly
   unblocks `actiondispatch http/param_builder` UploadedFile adapter.
3. **`multipart/parser` part A — state machine + parse/result/dequote**
   (~250 LOC).
4. **`multipart/parser` part B — boundary, encoding, mime handlers, limits**
   (~250 LOC).
5. **`multipart.rb` + tail integration** (~150 LOC). Glues parser/generator
   into `Rack::Multipart` facade. Closes AD param_builder dependency.
6. **`query_parser` + `utils` config attrs** (~250 LOC). Class extraction
   that `Request` depends on.
7. **`request.rb` part A — forwarded headers + priorities** (~150 LOC).
8. **`request.rb` part B — predicates and accessors** (~120 LOC).
9. **`request.rb` part C — parse internals + multipart bridge** (~200 LOC).
   Depends on slots 3–6.
10. **`null_logger` 100% + small auth pair** (`auth/abstract/request` +
    `auth/basic`, ~200 LOC).
11. **`response.rb` 100% + `mock_response` + small leaves bundle**
    (response 80 + mock_response 50 + builder 50 + tail leaves ~80 ≈ 260
    LOC).
12. **Tail leaves cleanup** — etag, show_exceptions, headers,
    method_override, deflater, etc., bundled to ~250 LOC.
13. **`version.release` + decide-and-document static/files/directory/reloader
    deferrals** (~50 LOC + plan-doc updates).

After slots 1–12 land, we should be at or very close to 100% with only
documented deferrals remaining.

---

## Indefinite defers (do not port)

Pending confirmation, candidates:

- `reloader.rb` — Ruby `$LOADED_FEATURES` semantics; Node has no analog.
- `directory.rb`, `files.rb`, `static.rb` — directory/static file
  middleware; serverless deploys handle this at the platform layer.
  **Decision needed** — flag and either port or formally exclude in
  `scripts/api-compare/unported-files.ts`.

---

## How to ship one PR

```bash
git fetch origin main
scripts/start-worktree.sh rack-<slot>
cd ~/github/blazetrailsdev/worktrees/rack-<slot>
less scripts/api-compare/.rails-source/rack/lib/rack/<file>.rb
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
