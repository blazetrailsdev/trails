# System Testing — Playwright-backed Implementation Plan

## Goal

Implement the 56 missing `ActionDispatch::SystemTesting` methods using
**Playwright** as the Node-native substitute for Ruby's Capybara/Selenium
stack. Rails' system testing provides browser-driven integration tests;
trails' version should match the public API surface while leveraging
Playwright's superior auto-wait, multi-browser, and built-in assertion
capabilities.

Playwright is an optional peer dependency — system testing is opt-in, same
as Capybara in Rails.

## Rails → Playwright mapping

| Rails concept                                      | trails substitute                                           | Notes                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Capybara::DSL` (`visit`, `fill_in`, `click_on`)   | **Playwright** `page.goto()`, `page.fill()`, `page.click()` | Playwright is both the driver AND the DSL — no separate abstraction layer needed                 |
| `driven_by :selenium, using: :chrome`              | `drivenBy("playwright", { using: "chromium" })`             | Playwright bundles chromium, firefox, webkit; `using` maps to `playwright[browser].launch()`     |
| `Browser` class (Chrome/Firefox options, headless) | Playwright `LaunchOptions`                                  | `{ headless: true, args: [...] }` — simpler than Selenium's options objects                      |
| `Server` (Puma boot for Capybara)                  | App server boot on random port                              | `server.listen(0)` or framework's `listen()`; Playwright navigates to `http://127.0.0.1:${port}` |
| `ScreenshotHelper#take_screenshot`                 | `page.screenshot({ path })`                                 | Native Playwright. HTML dump via `page.content()` + `fs.writeFile`                               |
| `ScreenshotHelper#take_failed_screenshot`          | Vitest `afterEach` hook                                     | Check `test.result.state === 'fail'`, then `page.screenshot()`                                   |
| `SetupAndTeardown`                                 | Vitest `beforeAll`/`afterEach`                              | `beforeAll` → launch browser; `afterEach` → close context/page; `afterAll` → close browser       |
| `PageDumpHelper#save_and_open_page`                | `page.content()` + `fs.writeFile` + `open` CLI              | `child_process.exec('open path')` or just log the path; Launchy equivalent is optional           |
| `Capybara.app = Rack::Builder`                     | Pass the trails `Application` instance                      | Playwright connects to the running server; no Rack adapter layer needed                          |
| `Capybara.current_driver`                          | `SystemTestCase.driver`                                     | Tracks which Playwright browser type is active                                                   |
| `Capybara.reset_sessions!`                         | `context.close()` + fresh context                           | Playwright browser contexts are isolated; closing = full reset                                   |

## Architecture

Rails' system testing is a thin shim: `SystemTestCase` inherits
`ActiveSupport::TestCase`, includes `Capybara::DSL` and
`Capybara::Minitest::Assertions`, and adds lifecycle hooks for
screenshots and server boot.

trails' version is even thinner because Playwright collapses the
driver/DSL/assertion layers into one:

```
SystemTestCase (extends TestCase)
├── drivenBy() — static config (browser choice, headless, screen size)
├── servedBy() — static config (host, port)
├── Driver — wraps playwright.chromium/firefox/webkit.launch()
├── Server — boots the app on a random port
├── ScreenshotHelper — take_screenshot / take_failed_screenshot
└── SetupAndTeardown — beforeAll/afterEach lifecycle
```

**No `Browser` class.** Rails' `Browser` exists to translate between
Capybara's driver abstraction and Selenium's options objects. Playwright
has a single unified launch API across all browsers — the `Browser`
class collapses into `Driver`.

## File layout (6 files, matching Rails)

```
packages/actionpack/src/action-dispatch/
  system-test-case.ts           — SystemTestCase class + drivenBy/servedBy
  system-testing/
    driver.ts                   — Driver (wraps Playwright browser launch)
    server.ts                   — Server (boots app, manages port)
    test-helpers/
      screenshot-helper.ts      — takeScreenshot / takeFailedScreenshot
      setup-and-teardown.ts     — beforeAll/afterEach lifecycle mixin
packages/actionpack/src/action-dispatch/
  testing/test-helpers/
    page-dump-helper.ts         — saveAndOpenPage / savePage
```

## PR sequence

### PR 1 — shipped (#2428) — Driver + Server + SystemTestCase shell

### PR 2 — shipped (#2446) — ScreenshotHelper + SetupAndTeardown + PageDumpHelper

**Original PR 1 scope (reference):**

- `driver.ts`: `Driver` class wrapping Playwright browser launch.
  - Constructor: `(driverType, { using, screenSize, options })`.
    `driverType` is always `"playwright"` (Rails supports `:selenium`,
    `:cuprite`, `:rack_test`, `:playwright`; we support `"playwright"`
    only, with `"rack_test"` as a future no-browser option).
  - `use()`: calls `playwright[browser].launch(options)`, sets viewport.
  - `browser` property: the `BrowserType` instance.
  - `close()`: tears down the browser.
- `server.ts`: `Server` class.
  - `run(app)`: starts the trails app on a random port (`server.listen(0)`).
  - `host` / `port` properties.
  - `stop()`: closes the server.
- `system-test-case.ts`: `SystemTestCase` class.
  - `static drivenBy(driver, { using, screenSize, options })` — mirrors
    Rails' class-level configuration.
  - `static servedBy({ host, port })` — override host/port.
  - Constructor: boots driver if not yet booted.
  - `page` getter: returns the Playwright `Page` for the current test.
  - `context` getter: returns the Playwright `BrowserContext`.
  - URL helper delegation via `methodMissing` pattern (Proxy or explicit
    delegation — TBD based on trails' URL helper shape).

**Test:** Unit test for Driver launch/close lifecycle using a minimal
HTTP server. Verify `page.goto()` works against it.

**Original PR 2 scope (reference):**

- `screenshot-helper.ts`:
  - `takeScreenshot({ html, screenshot })`: saves PNG via
    `page.screenshot()`, optionally saves HTML via `page.content()`.
    Output modes: `"simple"` (path only), `"inline"` (iTerm protocol),
    `"artifact"` (Buildkite protocol) — matching Rails exactly.
  - `takeFailedScreenshot()`: checks test failure state, calls
    `takeScreenshot()`. Attaches path to test metadata.
  - Private helpers: `imageName()`, `imagePath()`, `htmlPath()`,
    `screenshotsDir()`, `displayImage()`, `inlineBase64()`.
- `setup-and-teardown.ts`:
  - `beforeTeardown()`: calls `takeFailedScreenshot()`.
  - `afterTeardown()`: closes the Playwright browser context (= Capybara
    `reset_sessions!`).
- `page-dump-helper.ts`:
  - `saveAndOpenPage(path?)`: saves response body to file, opens with
    system default viewer (via `child_process.exec`). Rails uses Launchy;
    we use `open` (macOS) / `xdg-open` (Linux) / `start` (Windows).
  - `savePage(path?)`: writes `response.body` to path.
  - `htmlDumpDefaultPath()`: generates path under `tmp/html_dump/`.

**Test:** Screenshot helper unit test: boot a minimal page, take
screenshot, verify PNG file exists. SetupAndTeardown lifecycle test.

## Mapping to Rails api:compare methods (56 total)

| File                                                | Methods | Key methods                                                                                                      |
| --------------------------------------------------- | ------: | ---------------------------------------------------------------------------------------------------------------- |
| `system_test_case.rb`                               |       5 | `driven_by`, `served_by`, `start_application`, `initialize`, `url_helpers`                                       |
| `system_testing/driver.rb`                          |      11 | `initialize`, `use`, `register`, `register_selenium/cuprite/rack_test/playwright`, `setup`, `browser_options`    |
| `system_testing/browser.rb`                         |       9 | `initialize`, `type`, `options`, `configure`, `preload`, `default_chrome/firefox_options`, `resolve_driver_path` |
| `system_testing/server.rb`                          |       6 | `run`, `setup`, `set_server`, `set_port`, `silence_puma`/`silence_puma=`                                         |
| `system_testing/test_helpers/screenshot_helper.rb`  |      23 | `take_screenshot`, `take_failed_screenshot`, `save_html`, `save_image`, `display_image`, `image_name/path`, etc. |
| `system_testing/test_helpers/setup_and_teardown.rb` |       2 | `before_teardown`, `after_teardown`                                                                              |

**Plus from `testing/`:**

| File                                       | Methods | Key methods                                                              |
| ------------------------------------------ | ------: | ------------------------------------------------------------------------ |
| `testing/test_helpers/page_dump_helper.rb` |       4 | `save_and_open_page`, `save_page`, `open_file`, `html_dump_default_path` |

**Total: 60 methods (56 system_testing + 4 page_dump_helper).**

## Design decisions

### 1. Playwright-only driver (no Selenium/Cuprite)

Rails supports 4 driver types because Capybara is driver-agnostic.
Playwright IS the driver — supporting Selenium alongside it would mean
maintaining two completely different browser automation stacks with no
shared code.

Playwright covers all three browser engines (Chromium, Firefox, WebKit)
natively. The `driven_by` API accepts the same shape but `driverType` is
always `"playwright"`.

Future: `"rack_test"` equivalent (no-browser, HTTP-only) could use
`node:http` or the integration test infrastructure directly. Out of scope
for this plan.

### 2. No `Browser` class

Rails' `Browser` translates Capybara's driver abstraction into
Selenium-specific option objects (Chrome::Options, Firefox::Options,
headless flags, driver path resolution). Playwright has none of this
complexity — `playwright.chromium.launch({ headless: true })` is the
entire API.

The `Browser` class methods fold into `Driver`. For api:compare, we
either mark the 9 Browser methods as `@internal` (they're already
`# :nodoc:` in Rails) or implement thin delegation stubs in a `Browser`
class if api:compare requires them.

### 3. Screenshot output modes match Rails exactly

The three output modes (`simple`, `inline`, `artifact`) use the same
escape sequences as Rails. The `RAILS_SYSTEM_TESTING_SCREENSHOT` and
`RAILS_SYSTEM_TESTING_SCREENSHOT_HTML` env vars are honored (aliased to
`TRAILS_SYSTEM_TESTING_SCREENSHOT*` with Rails names as fallback).

### 4. Server boot strategy

Rails uses `Capybara.server = :puma`. We boot the trails app's HTTP
server directly:

```ts
const server = app.listen(0); // random port
const port = (server.address() as AddressInfo).port;
```

Playwright navigates to `http://127.0.0.1:${port}`. No Puma, no Rack
builder — the app IS the server.

### 5. Optional peer dependency

`playwright` is an optional peer dep of `@blazetrails/actionpack`, same
as `capybara` is for Rails. Import is dynamic (`await import("playwright")`)
so the package loads fine without Playwright installed. A clear error
message surfaces if `drivenBy` is called without Playwright available.

## Also in scope: testing/integration.rb (3 missing methods)

The 3 missing methods in `testing/integration.ts` should be identified
and shipped as a small bundled item alongside PR 1 or PR 2 if they're
≤30 LOC. Otherwise, separate PR.

## Ordering

```
PR 1 (Driver + Server + SystemTestCase) — standalone
PR 2 (ScreenshotHelper + SetupAndTeardown + PageDumpHelper) — after PR 1
```

Both branch from `main` independently if non-overlapping files. PR 2
imports from PR 1's types but doesn't modify the same files.

## Risks / blockers

1. **App server shape.** `server.ts` assumes the trails app exposes a
   `listen()` method. If the app shape differs (e.g., requires a
   framework-specific boot sequence), `Server` needs an adapter.
   Investigate before PR 1.

2. **Playwright install size.** Playwright downloads browser binaries
   (~400 MB). This is fine for development but heavy for CI. Mitigation:
   `PLAYWRIGHT_BROWSERS_PATH` for shared cache; document in contributor
   setup guide.

3. **Vitest integration.** Playwright's own `@playwright/test` runner
   has lifecycle hooks. We need to verify that Playwright's `Page` /
   `BrowserContext` work correctly when managed by Vitest's test runner
   rather than Playwright's. Known to work (Playwright explicitly
   supports library mode via `playwright` package, not `@playwright/test`).

4. **URL helper delegation.** Rails uses `method_missing` to delegate
   `_path` / `_url` helpers. TypeScript has no `method_missing`. Options:
   (a) Proxy-based delegation, (b) explicit `urlHelpers` object the test
   destructures, (c) mixin that copies helpers onto the test class.
   Decision deferred to PR 1 implementation.

## Post-merge follow-ups

**From #2428 (PR 1 — Driver + Server + SystemTestCase)**

- [ ] ~30 LOC: Browser api:compare stubs (9 methods, 0%). No real Browser abstraction (see "No `Browser` class" above) — thin `@internal` delegation to `Driver`, or mark all 9 as `@internal` skip in api:compare.
- [ ] `servedBy()` stores `_serverHost`/`_serverPort` but `startApplication()` doesn't consume them. Wire when needed.
- [ ] `urlHelpers()` returns undefined — needs routing infrastructure wired.
- [ ] `Driver.use()` is async (Rails is sync via Capybara lazy registration). Idempotency guard added.

**From #2446 (PR 2 — ScreenshotHelper + SetupAndTeardown + PageDumpHelper)**

- `displayImage` encodes buffer directly as base64 (Rails re-reads from disk). Functionally equivalent.
- `htmlDumpDefaultPath` uses `Date.now()` (ms) vs Rails' `DateTime.current.to_i` (seconds). Cosmetic.
- `openFile` dispatches on `process.platform` — Rails uses Launchy gem. Works but adds platform branch.
- `takeFailedScreenshot` guard checks `failed? && supportsScreenshot()` (no session-created check like Rails). Structurally equivalent.

**From #2451 (actionpack: \_mockSession, htmlDocument, documentRootElement)**

- [ ] HTML parsing in `htmlDocument` not yet implemented — throws for `text/html`. Blocked on rails-dom-testing port.

## Relationship to actionpack-100-percent.md

This plan covers the 56 system_testing methods + 4 page_dump_helper
methods listed as 0% in `actionpack-100-percent.md`. Landing both PRs
would move actiondispatch from **1278/1350 (94.7%) → 1338/1350 (99.1%)**.

The remaining 12 methods after this plan would be the 3 in
`testing/integration.rb` + 8 inheritance gaps + 1 rounding.
