# ActionController `--privates` — remaining backlog

> **Status (2026-05-01):** 252/581 methods (43.4%); files 43/43; inheritance
> 10/16. No PRs from this plan have shipped yet. Counts below verified
> against `pnpm tsx scripts/api-compare/compare.ts --package
actioncontroller --privates`. Rows where the planned "Missing" count
> drifted from current api:compare are flagged **(re-audit)** — expand
> the row before opening a PR.

Each row is one PR. Pick a row, follow the steps below verbatim, open a draft PR.

## How to ship one PR

```bash
# 1. Branch from latest origin/main in a fresh worktree
git fetch origin main
git worktree add .claude/worktrees/<slug> -b <branch> origin/main
cd .claude/worktrees/<slug>
pnpm install
pnpm vendor:fetch --source rails   # populate vendor/rails (or use scripts/start-worktree.sh which symlinks from main)

# 2. Read Rails source first (the entire file, not just the missing methods)
less vendor/rails/actionpack/lib/<rails-file>.rb

# 3. Implement in the TS file the api:compare row points to.
#    Do NOT relocate methods to a helper file or the row stops counting.
#    Use cwd-relative paths (`packages/...`), never absolute paths into the user's repo.
$EDITOR packages/actionpack/src/actioncontroller/<ts-file>.ts

# 4. Add tests next to the source as <ts-file>.test.ts
$EDITOR packages/actionpack/src/actioncontroller/<ts-file>.test.ts
pnpm test packages/actionpack/src/actioncontroller/<ts-file>.test.ts

# 5. Refresh and confirm api:compare row hits 100%
pnpm api:compare --package actioncontroller --privates | grep <rails-file>

# 6. Build clean, prettier clean
pnpm build
pnpm exec prettier --write packages/actionpack/src/actioncontroller/<ts-file>.ts \
                            packages/actionpack/src/actioncontroller/<ts-file>.test.ts

# 7. Commit (NO --no-verify, NO Co-Authored-By trailer) + push
git add -A
git commit -m "feat(actioncontroller): <commit subject>"
git push -u origin <branch>

# 8. Open as draft. PR body MUST quote the Rails source line(s) being mirrored
#    and reference the plan slot (e.g. "Implements P3").
gh pr create --draft --title "feat(actioncontroller): <title>" --body "$(cat <<EOF
...
EOF
)"
```

Constraints (CLAUDE.md):

- camelCase only — no snake_case identifiers, even mirroring Rails payload keys.
- PR ≤ 300 LOC additions+deletions (excl. lockfiles, snapshots).
- For methods that mix in to controllers, use the `this`-typed function pattern
  documented in CLAUDE.md (`export function foo(this: HostInterface, ...)` then
  `static foo = foo` in `base.ts`). Do NOT inline the body in `base.ts`.
- For Rails behaviors that can't be mirrored exactly (missing infra, etc.),
  add a "Known divergences" entry in `docs/actioncontroller-100-percent.md`
  describing what Rails does, what we do, and why.
- `instance_exec(opts, &block)` → `block.call(this, opts)` with `this: unknown`
  threaded through the function signature.
- Ruby `compact` → `.filter((e) => e !== null && e !== undefined)`, NOT
  `.filter(Boolean)` (which also drops `0`, `""`, `false`).
- Ruby `Hash#key?` → `Object.hasOwn(obj, "K")`, NOT `obj["K"] != null`
  (Ruby returns true for nil values; `"K" in obj` walks the prototype
  chain). Matches `docs/actioncontroller-100-percent.md:175-176`.

Sequencing rules:

- One agent per source file at a time; methods in the same file collide.
- Wave 4 (core) is **serial** — each PR depends on the prior one shipping.

---

## Wave 0 — single-file peripherals (remaining)

| PR  | Rails file                                           | Missing | TS file (api:compare row) | Methods                                                                                                                                                                              |
| --- | ---------------------------------------------------- | ------: | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2  | `metal/rate_limiting.rb`                             |       2 | `metal/rate-limiting.ts`  | `rateLimit` (class DSL), `rateLimiting` (private instance). Mirror Rails options `to:`, `within:`, `by:`, `with:`, `store:`, `name:`, `only:`/`except:`. Cache backend is divergent. |
| P3  | `form_builder.rb`                                    |       1 | `form-builder.ts`         | `defaultFormBuilder` — class DSL accepting builder class or string name (resolve via existing `@blazetrails/activesupport` constant resolver).                                       |
| P4  | `metal/data_streaming.rb` **(re-audit, 10 missing)** |      10 | `metal/data-streaming.ts` | Originally scoped as `sendFileHeadersBang` only; api:compare now reports 10 missing. Re-list before opening PR.                                                                      |
| P5  | `caching.rb`                                         |       2 | `caching.ts`              | `instrumentPayload(key)` → `{ controller, action, key }`; `instrumentName()` → `"action_controller"`. Both private.                                                                  |
| P7  | `metal/renderers.rb`                                 |       2 | `metal/renderers.ts`      | `_renderToBodyWithRenderer`, `_renderWithRendererMethodName`. Refactor existing inline dispatch logic into named methods; `Renderers.add` registration must still resolve.           |
| P9  | `deprecator.rb`                                      |       3 | `deprecator.ts`           | `deprecator` (Deprecation instance), `addRenderer`, `removeRenderer` (deprecation shims delegating to Renderers registry).                                                           |

## Wave 1 — small bundle peripherals

Ship after Wave 0 lands. One PR per row.

| PR    | Rails file                                                     | Missing | Notes                                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P10   | `metal/content_security_policy.rb`                             |       4 | `isContentSecurityPolicy?`, `currentContentSecurityPolicy`, `contentSecurityPolicy`, `contentSecurityPolicyReportOnly` — class DSL.                                                                                                                       |
| P11   | `metal/etag_with_template_digest.rb` **(re-audit, 7 missing)** |       7 | Originally 3 methods scoped; api:compare now reports 7 missing. Re-list before opening PR.                                                                                                                                                                |
| P11.5 | `metal/etag_with_flash.rb` **(new)**                           |       4 | Not in original plan; api:compare reports 4 missing. Scope before opening PR.                                                                                                                                                                             |
| P12   | `metal/helpers.rb` **(re-audit, 6 missing)**                   |       6 | Originally 5 methods scoped; api:compare reports 6. Re-list before opening PR.                                                                                                                                                                            |
| P13   | `metal/allow_browser.rb` (privates)                            |       9 | `parsedUserAgent`, `isUserAgentVersionReported`, `isUnsupportedBrowser`, `isVersionGuardedBrowser`, `isBot`, `isVersionBelowMinimumRequired`, `minimumBrowserVersionForBrowser`, `expandedVersions`, `normalizedBrowserName` — pure user-agent functions. |

## Wave 2 — medium peripherals

| PR  | Rails file                                                  | Missing | Notes                                                                                                                                                                   |
| --- | ----------------------------------------------------------- | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P14 | `metal/redirecting.rb` (privates) **(re-audit, 7 missing)** |       7 | Originally 6 methods scoped; api:compare reports 7. Re-list before opening PR.                                                                                          |
| P15 | `metal/params_wrapper.rb` (privates)                        |       8 | `_defaultWrapModel`, `_wrapperKey`, `_wrapperFormats`, `_wrapParameters`, `_extractParameters`, `_isWrapperEnabled`, `_performParameterWrapping`, `_setWrapperOptions`. |
| P16 | `metal/rendering.rb` (privates)                             |       8 | `_processVariant`, `_renderInPriorities`, `_setHtmlContentType`, `_setRenderedContentType`, `_setVaryHeader`, `_normalizeOptions`, `_normalizeText`, `_processOptions`. |

## Wave 3 — split-file PRs

Each Rails file below is too large for one ≤300-LOC PR. Sub-PRs serialize on
the same TS file, so ship them in alphabetical order (a → b → c).

### `metal/http_authentication.rb` (33 missing) — `metal/http-authentication.ts`

| PR   | Module   | Missing | Methods                                                                                                                                                                                                                 |
| ---- | -------- | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P17a | `Basic`  |      13 | `authenticate`, `hasBasicCredentials`, `userNameAndPassword`, `decodeCredentials`, `authScheme`, `authParam`, `encodeCredentials`, `authenticationRequest` + 5 controller-side helpers (`httpBasicAuthenticate*` etc.). |
| P17b | `Digest` |      12 | `validateDigestResponse`, `expectedResponse`, `ha1`, `decodeCredentialsHeader`, `authenticationHeader`, `secretToken`, `nonce`, `validateNonce`, `opaque` + 3 controller-side helpers.                                  |
| P17c | `Token`  |       8 | `tokenAndOptions`, `tokenParamsFrom`, `paramsArrayFrom`, `rewriteParamValues`, `rawParams` + 3 controller-side helpers.                                                                                                 |

### `metal/live.rb` (24 missing — re-audit; was 22) — `metal/live.ts`

| PR   | Subject              | Missing | Methods                                                                                                                                                                                                         |
| ---- | -------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P18a | `Live::Buffer` class |      12 | `performWrite`, `queueSize`, `ignoreDisconnect`, `writeln`, `abort`, `isConnected`, `onError`, `callOnError`, `eachChunk`, `buildQueue`, `beforeCommitted`, `buildBuffer`.                                      |
| P18b | `Live` mixin         |      10 | `process`, `responseBody=`, `sendStream`, `newControllerThread`, `cleanUpThreadLocals`, `logError`, `originalNewControllerThread`, `originalCleanUpThreadLocals`, `liveThreadPoolExecutor`, `makeResponseBang`. |

### `metal/strong_parameters.rb` (24 missing) — `metal/strong-parameters.ts`

| PR   | Subject              | Missing | Methods                                                                                                                                                                                                                                          |
| ---- | -------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P19a | Permit pipeline      |      10 | `permitFilters`, `permitValue`, `permitArrayOfScalars`, `permitArrayOfHashes`, `permitHash`, `permitHashOrArray`, `permitAnyInParameters`, `permitAnyInArray`, `permittedScalarFilter`, `hashFilter`.                                            |
| P19b | Conversion + nesting |      10 | `convertParametersToHashes`, `convertHashesToParameters`, `convertValueToParameters`, `_deepTransformKeysInObjectBang`, `isNestedAttributes`, `eachNestedAttribute`, `eachArrayElement`, `isArrayFilter`, `isNonScalar`, `isSpecifyNumericKeys`. |
| P19c | Misc + diagnostics   |       4 | `parameters` (private accessor), `newInstanceWithInheritedPermittedStatus`, `unpermittedParametersBang`, `unpermittedKeys`.                                                                                                                      |

### `metal/request_forgery_protection.rb` (31 missing) — `metal/request-forgery-protection.ts`

| PR   | Subject                              | Missing | Methods                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------ | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P20a | Verification predicates              |      10 | `isVerifiedRequest`, `verifySameOriginRequest`, `markForSameOriginVerificationBang`, `isMarkedForSameOriginVerification`, `isNonXhrJavascriptResponse`, `isValidRequestOrigin`, `isProtectAgainstForgery`, `unverifiedRequestWarningMessage`, `normalizeActionPath`, `normalizeRelativeActionPath`. |
| P20b | Token generation/encoding            |      11 | `generateCsrfToken`, `encodeCsrfToken`, `decodeCsrfToken`, `maskToken`, `unmaskToken`, `maskedAuthenticityToken`, `realCsrfToken`, `perFormCsrfToken`, `globalCsrfToken`, `csrfTokenHmac`, `xorByteStrings`.                                                                                        |
| P20c | Token validation + strategy plumbing |      10 | `isAnyAuthenticityTokenValid`, `requestAuthenticityTokens`, `isValidAuthenticityToken`, `isValidPerFormCsrfToken`, `compareWithRealToken`, `compareWithGlobalToken`, `formAuthenticityParam`, `protectionMethodClass`, `storageStrategy`, `isIsStorageStrategy`.                                    |

### `test_case.rb` (40 missing — re-audit; was 36) — `test-case.ts`

| PR   | Collaborator         | Missing | Methods                                                                                                                                                                                                                                                        |
| ---- | -------------------- | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P21a | `TestSession`        |      12 | `isEnabled`, `idWas`, `loadBang`, `keys`, `values`, `destroy`, `dig`, `fetch`, `isExists`, `isSuccess`, `isMissing`, `isError`.                                                                                                                                |
| P21b | `TestRequest`/params |      12 | `assignParameters`, `queryString=`, `contentType=`, `shouldMultipart`, `paramsParsers`, `queryParameterNames`, `defaultEnv`, `newSession`, `create`, `controllerClass`, `generatedPath`, `executorAroundEachRequest`.                                          |
| P21c | Behavior mixin       |      12 | `process`, `controllerClassName`, `setupControllerRequestAndResponse`, `buildResponse`, `setupRequest`, `wrapExecution`, `processControllerResponse`, `scrubEnvBang`, `documentRootElement`, `checkRequiredIvars`, `tests`, `determineDefaultControllerClass`. |

## Wave 4 — core (strict serial order: P22 → P23 → P24 → P25 → P26)

These touch the controller backbone and depend on prior peripherals. Do not
fan out.

| PR  | Rails file                                           | Missing | Methods                                                                                                                                                          |
| --- | ---------------------------------------------------- | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P22 | `metal/instrumentation.rb`                           |       3 | `haltedCallbackHook`, `cleanupViewRuntime`, `appendInfoToPayload`. Hooks render + callback chain.                                                                |
| P23 | `api/api_rendering.rb` **(re-audit, 12 missing)**    |      12 | Originally scoped as `renderToBody` only; api:compare reports 12. Re-list before opening PR.                                                                     |
| P24 | `metal/implicit_render.rb` **(re-audit, 4 missing)** |       4 | Originally 3 methods scoped; api:compare reports 4. Re-list before opening PR.                                                                                   |
| P25 | `metal.rb` (privates)                                |       1 | `buildMiddleware`. Ties to `actiondispatch` middleware stack.                                                                                                    |
| P26 | `base.rb` (privates) **(re-audit, 83 missing)**      |      83 | Originally 2 methods scoped; api:compare reports 83 missing. This is no longer one PR — must be split into a sub-plan (likely 4–6 PRs by topic) before any work. |

---

## Tracking

When a PR merges: strike through the row and append `#NNNN ✅`. Update the
remaining count by re-running:

```bash
pnpm tsx scripts/api-compare/extract-ts-api.ts
pnpm tsx scripts/api-compare/compare.ts --package actioncontroller --privates | tail -1
```
