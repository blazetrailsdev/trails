import { afterEach, beforeEach, describe, it } from "vitest";
import {
  assertDifference,
  assertEqual,
  assertMatch,
  LogSubscriber as ActiveSupportLogSubscriber,
  MemoryStore,
  setTrailsRoot,
  trailsRoot,
} from "@blazetrails/activesupport";
import {
  setup as testHelperSetup,
  teardown as testHelperTeardown,
  TestHelper,
  type MockLogger,
} from "@blazetrails/activesupport/log-subscriber/test-helper";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { ActionController } from "@blazetrails/actionpack";
import { File, include, type Included } from "@blazetrails/ruby-compat";

import { FIXTURE_LOAD_PATH } from "../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { LogSubscriber } from "../log-subscriber.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { Customer, GoodCustomer } from "../test-helpers/fake-models.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveSupport::LogSubscriber::TestHelper` (`log_subscriber_test.rb:9`); the class/interface merge is how a mixin surfaces on the type side.
interface AVLogSubscriberTest extends Omit<
  Included<typeof TestHelper>,
  "setup" | "teardown" | "setLogger"
> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
class AVLogSubscriberTest extends TestCase {
  declare logger: MockLogger;
  declare view: Base;
  declare definedRoot: boolean;

  static {
    include(this, TestHelper);
  }

  override setup(): void {
    testHelperSetup.call(this);

    LookupContext.DetailsKey.clear();

    const viewPaths = ActionController.Base.viewPaths();

    const lookupContext = new LookupContext(viewPaths, {}, ["test"]);
    this.view = Base.withEmptyTemplateCache().withContext(lookupContext);

    LogSubscriber.attachTo("action_view");

    if (trailsRoot() == null) {
      this.definedRoot = true;
      setTrailsRoot("defined_root");
    }
  }

  override teardown(): void {
    testHelperTeardown.call(this);
    ActionController.Base.viewPaths()
      .toAry()
      .map((p) => p.clearCache());

    ActiveSupportLogSubscriber.logSubscribers().length = 0;

    if (this.definedRoot) setTrailsRoot(null);
  }

  setLogger(logger: MockLogger | null): void {
    Base.logger = logger as unknown;
  }

  setCacheController(): void {
    const controller = new ActionController.Base();
    controller.performCaching = true;
    controller.cacheStore = new MemoryStore();
    this.view.controller = controller as never;
  }

  setViewCacheDependencies(): void {
    const view = this.view as unknown as Record<string, unknown>;
    view.viewCacheDependencies = () => [];
    view.combinedFragmentCacheKey = () => "ahoy `controller` dependency";
  }
}

function stubRoot(block: () => Promise<void>): Promise<void> {
  const was = trailsRoot();
  setTrailsRoot(File.expandPath(FIXTURE_LOAD_PATH));
  return block().finally(() => setTrailsRoot(was));
}

describe("AVLogSubscriberTest", () => {
  let tc: AVLogSubscriberTest;
  let viewPathsWas: unknown;

  beforeEach(({ task }) => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    viewPathsWas = ActionController.Base.viewPaths();
    ActionController.Base.viewPaths(FIXTURE_LOAD_PATH);
    tc = new AVLogSubscriberTest(task.name);
    tc.setup();
  });

  afterEach(() => {
    tc.teardown();
    ActionController.Base.viewPaths(viewPathsWas as never);
    TemplateHandlers.clear();
  });

  it("render template template", () =>
    stubRoot(async () => {
      await tc.view.render({ template: "test/hello_world" });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertEqual(1, tc.logger.logged(":info").length);
      assertMatch(/Rendering test\/hello_world\.tse/, tc.logger.logged(":debug").at(-1)!);
      assertMatch(/Rendered test\/hello_world\.tse/, tc.logger.logged(":info").at(-1)!);
    }));

  it("render template with layout", () =>
    stubRoot(async () => {
      await tc.view.render({ template: "test/hello_world", layout: "layouts/yield" });
      tc.wait();

      assertEqual(2, tc.logger.logged(":debug").length);
      assertEqual(2, tc.logger.logged(":info").length);

      assertMatch(/Rendering layout layouts\/yield\.tse/, tc.logger.logged(":debug")[0]);
      assertMatch(
        /Rendering test\/hello_world\.tse within layouts\/yield/,
        tc.logger.logged(":debug").at(-1)!,
      );
      assertMatch(
        /Rendered test\/hello_world\.tse within layouts\/yield/,
        tc.logger.logged(":info")[0],
      );
      assertMatch(/Rendered layout layouts\/yield\.tse/, tc.logger.logged(":info").at(-1)!);
    }));

  it("render file template", () =>
    stubRoot(async () => {
      await tc.view.render({ file: `${FIXTURE_LOAD_PATH}/test/hello_world.tse` });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertEqual(1, tc.logger.logged(":info").length);
      assertMatch(/Rendering test\/hello_world\.tse/, tc.logger.logged(":debug").at(-1)!);
      assertMatch(/Rendered test\/hello_world\.tse/, tc.logger.logged(":info").at(-1)!);
    }));

  it("render text template", () =>
    stubRoot(async () => {
      await tc.view.render({ plain: "TEXT" });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertEqual(1, tc.logger.logged(":info").length);
      assertMatch(/Rendering text template/, tc.logger.logged(":debug").at(-1)!);
      assertMatch(/Rendered text template/, tc.logger.logged(":info").at(-1)!);
    }));

  it("render inline template", () =>
    stubRoot(async () => {
      await tc.view.render({ inline: "<%= 'TEXT' %>" });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertEqual(1, tc.logger.logged(":info").length);
      assertMatch(/Rendering inline template/, tc.logger.logged(":debug").at(-1)!);
      assertMatch(/Rendered inline template/, tc.logger.logged(":info").at(-1)!);
    }));

  it("render partial with implicit path", () =>
    stubRoot(async () => {
      await tc.view.render(new Customer("david"), { greeting: "hi" });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(/Rendered customers\/_customer\.html\.tse/, tc.logger.logged(":debug").at(-1)!);
    }));

  it("render partial with cache missed", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({
        partial: "test/cached_customer",
        locals: { cached_customer: new Customer("david") },
      });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(
        /Rendered test\/_cached_customer\.tse (.*) \[cache miss\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));

  it("render partial with cache hitted", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({
        partial: "test/cached_customer",
        locals: { cached_customer: new Customer("david") },
      });
      await tc.view.render({
        partial: "test/cached_customer",
        locals: { cached_customer: new Customer("david") },
      });
      tc.wait();

      assertEqual(2, tc.logger.logged(":debug").length);
      assertMatch(
        /Rendered test\/_cached_customer\.tse (.*) \[cache hit\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));

  it("render partial as layout", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({ layout: "layouts/yield_only" }, {}, () => "hello");

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(/Rendered layouts\/_yield_only\.tse/, tc.logger.logged(":debug")[0]);
    }));

  it("render partial with layout", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({ partial: "partial", layout: "layouts/yield_only" });

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(
        /Rendered test\/_partial\.html\.tse within layouts\/_yield_only/,
        tc.logger.logged(":debug")[0],
      );
    }));

  it("render uncached outer partial with inner cached partial wont mix cache hits or misses", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({
        partial: "test/nested_cached_customer",
        locals: { cached_customer: new Customer("Stan") },
      });
      tc.wait();
      let [cachedInner, uncachedOuter] = tc.logger.logged(":debug").slice(-2);
      assertMatch(/Rendered test\/_cached_customer\.tse (.*) \[cache miss\]/, cachedInner);
      assertMatch(
        /Rendered test\/_nested_cached_customer\.tse \(Duration: .*?ms \| GC: .*?\)$/,
        uncachedOuter,
      );

      await tc.view.render({
        partial: "test/nested_cached_customer",
        locals: { cached_customer: new Customer("Stan") },
      });
      tc.wait();
      [cachedInner, uncachedOuter] = tc.logger.logged(":debug").slice(-2);
      assertMatch(/Rendered test\/_cached_customer\.tse (.*) \[cache hit\]/, cachedInner);
      assertMatch(
        /Rendered test\/_nested_cached_customer\.tse \(Duration: .*?ms \| GC: .*?\)$/,
        uncachedOuter,
      );
    }));

  it.skip("render cached outer partial with cached inner partial", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({
        partial: "test/cached_nested_cached_customer",
        locals: { cached_customer: new Customer("Stan") },
      });
      tc.wait();
      const [cachedInner, cachedOuter] = tc.logger.logged(":debug").slice(-2);
      assertMatch(/Rendered test\/_cached_customer\.tse (.*) \[cache miss\]/, cachedInner);
      assertMatch(
        /Rendered test\/_cached_nested_cached_customer\.tse (.*) \[cache miss\]/,
        cachedOuter,
      );

      await assertDifference(
        () => tc.logger.logged(":debug").length,
        +1,
        async () => {
          await tc.view.render({
            partial: "test/cached_nested_cached_customer",
            locals: { cached_customer: new Customer("Stan") },
          });
          tc.wait();
        },
      );
      assertMatch(
        /Rendered test\/_cached_nested_cached_customer\.tse (.*) \[cache hit\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));

  it("render partial with cache hitted and missed", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({
        partial: "test/cached_customer",
        locals: { cached_customer: new Customer("david") },
      });
      tc.wait();
      assertMatch(
        /Rendered test\/_cached_customer\.tse (.*) \[cache miss\]/,
        tc.logger.logged(":debug").at(-1)!,
      );

      await tc.view.render({
        partial: "test/cached_customer",
        locals: { cached_customer: new Customer("david") },
      });
      tc.wait();
      assertMatch(
        /Rendered test\/_cached_customer\.tse (.*) \[cache hit\]/,
        tc.logger.logged(":debug").at(-1)!,
      );

      await tc.view.render({
        partial: "test/cached_customer",
        locals: { cached_customer: new Customer("Stan") },
      });
      tc.wait();
      assertMatch(
        /Rendered test\/_cached_customer\.tse (.*) \[cache miss\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));

  it("render collection template", () =>
    stubRoot(async () => {
      tc.setCacheController();

      await tc.view.render({
        partial: "test/customer",
        collection: [new Customer("david"), new Customer("mary")],
      });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(
        /Rendered collection of test\/_customer.tse \[2 times\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));

  it("render collection template with layout", () =>
    stubRoot(async () => {
      tc.setCacheController();

      await tc.view.render({
        partial: "test/customer",
        layout: "layouts/yield_only",
        collection: [new Customer("david"), new Customer("mary")],
      });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(
        /Rendered collection of test\/_customer.tse within layouts\/_yield_only \[2 times\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));

  it("render collection with implicit path", () =>
    stubRoot(async () => {
      tc.setCacheController();

      await tc.view.render([new Customer("david"), new Customer("mary")], { greeting: "hi" });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(
        /Rendered collection of customers\/_customer\.html\.tse \[2 times\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));

  it("render collection template without path", () =>
    stubRoot(async () => {
      tc.setCacheController();

      await tc.view.render([new GoodCustomer("david"), new Customer("mary")], { greeting: "hi" });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(/Rendered collection of templates/, tc.logger.logged(":debug").at(-1)!);
    }));

  it("render collection with cached set", () =>
    stubRoot(async () => {
      tc.setViewCacheDependencies();
      tc.setCacheController();

      await tc.view.render({
        partial: "customers/customer",
        collection: [new Customer("david"), new Customer("mary")],
        cached: true,
        locals: { greeting: "hi" },
      });
      tc.wait();

      assertEqual(1, tc.logger.logged(":debug").length);
      assertMatch(
        /Rendered collection of customers\/_customer\.html\.tse \[0 \/ 2 cache hits\]/,
        tc.logger.logged(":debug").at(-1)!,
      );
    }));
});
