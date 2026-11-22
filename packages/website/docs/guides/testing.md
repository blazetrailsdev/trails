---
title: Testing Trails Applications
description: How a trails application's tests are laid out, run on Vitest, load fixtures, and test models, controllers, integration flows, system flows, views, mailers, jobs and channels.
---

# Testing Trails Applications

> **See also:** [Guides index](./index.md) ·
> [Trails Routing from the Outside In](./routing.md) ·
> [trailties package](/packages/trailties) ·
> [actionpack package](/packages/actionpack) ·
> [activesupport package](/packages/activesupport) ·
> [vitest-matchers package](/packages/vitest-matchers)

A new trails application comes with a test directory, a test database and
generators that write a test beside every model, controller and mailer they
create. This guide covers:

- Where tests live and how `trails test` runs them.
- Assertions, fixtures and test transactions.
- Model, functional, integration and system tests.
- Testing views, mailers, jobs and Action Cable.
- Parallel testing and time-dependent code.

## Introduction

Tests run on [Vitest](https://vitest.dev). A test file is an ordinary Vitest
module: `describe` and `it` come from `vitest`, and a trails test case class
(`ActiveSupport.TestCase`, `IntegrationTest`, `SystemTestCase` …) supplies
the Rails setup and assertions to each test.

## Test Setup

### Test Directories

`trails new` writes a `test/` directory laid out as Rails' is:

<!-- typecheck:skip -->

```sh
test/
  application-system-test-case.ts
  channels/
  controllers/
  fixtures/
  helpers/
  integration/
  jobs/
  mailers/
  models/
  system/
  test-helper.ts
```

File names are kebab-case, as ruled in
[`CLAUDE.md` § "Fidelity is the job"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#fidelity-is-the-job).
`test-helper.ts` is imported by every test and is where shared setup belongs.

### The Test Environment

Tests run with `TRAILS_ENV=test`, configured by `config/environments/test.ts`,
against the database named under `test` in `config/database.yml`. That
database is rebuilt from the schema and emptied between runs, so never point
it at data you need.

### Writing Your First Test

`trails generate model Article title:string` writes
`test/models/article.test.ts`. A test is an `it` block; a test case class gives
it the Rails assertions:

<!-- typecheck:skip -->

```ts
import { describe, it } from "vitest";
import { ActiveSupport } from "@blazetrails/activesupport";
import { Article } from "../../app/models/article.js";
import "../test-helper.js";

describe("ArticleTest", () => {
  it("should not save article without title", async () => {
    const article = new Article();
    expect(await article.save()).toBe(false);
  });
});
```

Saving and validating are async, so the test is too.

#### Your First Failing Test and Reporting Errors

Run it before the validation exists and Vitest reports the failing
expectation with its file and line. An error raised inside the test is
reported with its stack, and the test counts as failed.

### Assertions

Minitest's built-in assertions port to Vitest's `expect`, as the table in
[CONTRIBUTING.md § "Porting a Minitest assertion"](https://github.com/blazetrailsdev/trails/blob/main/CONTRIBUTING.md#porting-a-minitest-assertion)
lists: `assert_equal` is `toEqual`, `assert_nil` is `toBeNull`, and so on.
Where Vitest's matcher gives the wrong answer for a Ruby value — `toBeTruthy`
on `0` or `""` — [vitest-matchers](/packages/vitest-matchers) supplies one
that follows Ruby truthiness.

### Trails-Specific Assertions

The Rails assertions keep their names, camelCased, on the test case:
`assertDifference` and `assertNoDifference` measure an expression around a
block, `assertChanges` checks a value moves, and `assertResponse`,
`assertRedirectedTo` and the routing assertions check a controller's answer.
Each is async when its block is.

### The Trails Test Runner

`trails test` runs the suite, or the files and line numbers it is given:

<!-- typecheck:skip -->

```sh
pnpm trails test
pnpm trails test test/models/article.test.ts
pnpm trails test test/models/article.test.ts:6
pnpm trails test:system
```

`trails test` skips system tests; `test:system` runs them.

## The Test Database

### Maintaining the Test Database Schema

Before the run, `trails test` loads `db/schema.ts` into the test database if
migrations are pending, so a test sees the same tables development does.

### Fixtures

Fixtures are sample rows, one YAML file per table under `test/fixtures/`,
loaded before each test:

<!-- typecheck:skip -->

```yaml
# test/fixtures/articles.yml
welcome:
  title: Welcome to trails
  body: Hello world
```

A fixture file may also be a `.ts` module, as ruled in
[packages/activerecord/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/activerecord/CLAUDE.md#fixtures-load-from-ts-modules-as-well-as-yaml-fixturesetfile).
ERB in a fixture is TSE in trails. A fixture refers to another by its label
(`author: david`), and the label is hashed into a stable id.

#### Fixtures Are Active Record Objects

The test case reads a fixture back as a record by its table and label, so
`articles("welcome")` is a loaded `Article`.

### Transactions

Each test runs inside a transaction that is rolled back when it finishes, so
one test's writes never reach the next. A test that needs real commits —
for code that runs after commit, or across connections — opts out with
`useTransactionalTests = false` on its test case class.

## Model Tests

A model test extends `ActiveSupport.TestCase` (or the app's
`ActiveRecord`-aware subclass in `test-helper.ts`) and exercises
validations, scopes and methods directly.

## Functional Tests for Controllers

A controller test drives the controller through the full stack. Generated
ones extend `IntegrationTest`, and reach the test case through Vitest's test
context:

```ts
import { describe, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";

class ArticlesControllerTest extends IntegrationTest {}

describe("ArticlesControllerTest", () => {
  it<{ testCase: ArticlesControllerTest }>("should get index", async ({ testCase: t }) => {
    await t.get("/articles");
    t.assertResponse(":success");
  });
});
```

### HTTP Request Types

`get`, `post`, `patch`, `put`, `delete` and `head` each take a path and an
options object with `params`, `headers`, `env` and `xhr`. `xhr: true` sends
the request as a `fetch` from the page would.

### Testing Other Request Objects

After a request, `t.request`, `t.response`, `t.session`, `t.cookies` and
`t.flash` hold its state, so a test checks a flash notice with
`expect(t.flash.get("notice")).toBe("Article created")`.

### Setting Headers

`headers` in the request options sets HTTP headers, and `env` sets Rack
environment keys directly.

## Integration Testing

An integration test follows a flow across controllers: sign in, create an
article, follow the redirect. `followRedirectBang()` (Rails' `follow_redirect!`) follows the last response's
redirect, and `IntegrationTest` keeps the session between requests in one
test. Generate one with `trails generate integration_test user_flows`.

## System Testing

A system test drives a real browser. trails runs it on Vitest and Playwright
rather than Capybara and Selenium, as ruled in
[packages/actionpack/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/actionpack/CLAUDE.md#system-testing-runs-on-vitest-systemtestcase-systemtesting).
The generated base class picks the browser and screen size:

```ts
import { SystemTestCase } from "@blazetrails/actionpack/system-testing";

export class ApplicationSystemTestCase extends SystemTestCase {
  static {
    this.drivenBy("playwright", { screenSize: [1400, 1400] });
  }
}
```

A test drives the browser through the Playwright `Page` that `await
t.page()` answers; trails does not port Capybara's DSL. A failing system test saves a screenshot under
`tmp/screenshots/`, and `takeScreenshot()` saves one on demand. A test for
a mobile layout passes a smaller `screenSize` in its own subclass.

## Test Helpers

Helpers shared across tests go in `test/test-helper.ts`, or in modules under
`test/test-helpers/` that it imports. Import them eagerly there so every
test case class sees them.

## Testing Views

`ActionView.TestCase` renders a template or partial without a request, and
`assertSelect` / `assertDomEqual` check the HTML it produced. DOM assertions
parse HTML5 only, as ruled in
[packages/actionpack/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/actionpack/CLAUDE.md#dom-testing-is-html5-only-railsdomtestingdefault_html_version).
A helper test calls the helper directly on the test case.

## Testing Mailers

`ActionMailer.TestCase` builds a message from a mailer action and asserts on
its headers and body. In the test environment the delivery method is `test`,
which collects sent mail in `ActionMailer.Base.deliveries`.
`assertEmails`, `assertEnqueuedEmails` and `assertEnqueuedEmailWith` check
that code under test sent mail. See
[Action Mailer Basics](./action-mailer-basics.md).

## Testing Jobs

`ActiveJob.TestHelper` provides `assertEnqueuedJobs`, `assertEnqueuedWith`,
`assertPerformedJobs` and `performEnqueuedJobs`. A job's `perform` is
async, as ruled in
[packages/activejob/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/activejob/CLAUDE.md#a-jobs-perform-and-enqueue-are-async-perform_now--perform_later),
so these assertions await their block. `assertRaises` checks that a job
raises.

## Testing Action Cable

`ActionCable.Connection.TestCase` exercises a connection's `connect` with
cookies and headers. `ActionCable.Channel.TestCase` subscribes to a channel
and checks `transmissions` and streams. `assertBroadcasts` and
`assertBroadcastOn` check broadcasts made from a model, job or controller.
See [Action Cable Overview](./action-cable-overview.md).

## Running Tests in Parallel

Vitest runs test files in parallel worker processes by default, and the
tests inside one file run in order. The worker count is Vitest's own pool
setting in the app's Vitest config. Rails' threaded mode has no Node
counterpart: a Node worker shares no memory with another, so every parallel
run is the process kind.

## Continuous Integration

A CI job runs `pnpm trails test` and `pnpm trails test:system`. `trails new`
writes a GitHub Actions workflow, `.github/workflows/ci.yml`, as a starting
point.

## Testing Time-Dependent Code

`travelTo`, `travel` and `freezeTime` from `ActiveSupport.Testing.TimeHelpers`
stop or move the clock for the rest of a test, or for a block, and
`travelBack` restores it:

<!-- typecheck:skip -->

```ts
import { freezeTime } from "@blazetrails/activesupport";

it("stamps the article", async () => {
  await freezeTime(async () => {
    const article = await Article.create({ title: "Now" });
    expect(article.createdAt).toEqual(Time.current());
  });
});
```
