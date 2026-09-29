import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Assertion, assertEqual, assertPredicate, assertRaise } from "@blazetrails/activesupport";
import { Base } from "../../action-controller/base.js";
import { TestCase } from "../../action-controller/test-case.js";
import { controllerConstants } from "../http/request.js";
import type { MiddlewareFactory, MiddlewareStack, RackApp } from "../middleware/stack.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";
import type { Mapper, RouteOptions } from "../routing/mapper.js";
import { RouteSet } from "../routing/route-set.js";
import { IntegrationTest } from "../testing/integration.js";
import { assertRecognizes, assertRouting } from "../testing/assertions/routing.js";
import "../../test-helpers/abstract-unit.js";

class ArticlesController extends Base {}

class SecureArticlesController extends ArticlesController {
  async index(): Promise<void> {
    await this.render({ inline: "" });
  }
}
beforeAll(() => {
  controllerConstants.set("posts", StubController as unknown as DispatchableControllerClass);
  for (const [name, klass] of Object.entries({
    articles: ArticlesController,
    secure_articles: SecureArticlesController,
  })) {
    controllerConstants.set(name, klass as unknown as DispatchableControllerClass);
  }
});

class StubController {}

describe("ActionDispatch::Routing::Assertions", () => {
  it("assert generates", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: 1 }, "post")).toBe("/posts/1");
  });

  it("assert recognizes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    assertRecognizes.call({ routes }, { controller: "posts", action: "show", id: "1" }, "/posts/1");
  });

  it("assert routing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    assertRouting.call({ routes }, "/posts/1", { controller: "posts", action: "show", id: "1" });
  });

  it("with routing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/temp", { to: "temp#index", as: "temp" });
    });
    expect(routes.pathFor({}, "temp")).toBe("/temp");
    routes.clearBang();
    expect(() => routes.pathFor({}, "temp")).toThrow();
  });
});

interface Host {
  routes?: RouteSet;
  beforeSetup(): void;
  setup(): void;
  afterTeardown(test: { failures: Error[] }): void;
  assertRouting: TestCase["assertRouting"];
  withRouting<T>(block: (routes: RouteSet) => T): T;
}
type HostClass = (typeof TestCase | typeof IntegrationTest) & (new () => Host);

function runTest<T extends Host>(klass: new () => T): () => T {
  let t: T;
  beforeEach(() => {
    t = new klass();
    t.beforeSetup();
    t.setup();
  });
  afterEach(() => {
    const test = { failures: [] as Error[] };
    t.afterTeardown(test);
    expect(test.failures).toEqual([]);
  });
  return () => t;
}

function RoutingAssertionsSharedTests(t: () => Host): void {
  it("with routing", async () => {
    await t().withRouting(async (routes: RouteSet) => {
      routes.draw((r) => {
        r.resources("articles", { path: "artikel" } as RouteOptions);
      });

      t().assertRouting("/artikel", { controller: "articles", action: "index" });
      await assertRaise([Assertion], {}, () => {
        t().assertRouting("/articles", { controller: "articles", action: "index" });
      });
    });
  });
}

function WithRoutingSharedTests(klass: HostClass, t: () => Host): void {
  const beforeSetup = klass.prototype.beforeSetup;
  klass.prototype.beforeSetup = function (this: Host): void {
    this.routes = new RouteSet();
    this.routes.draw((r) => {
      r.resources("articles");
    });

    beforeSetup.call(this);
  };

  klass.withRouting((routes: RouteSet) => {
    routes.draw((r) => {
      r.resources("articles", { path: "artikel" } as RouteOptions);
    });
  });

  it("with routing for the entire test file", async () => {
    t().assertRouting("/artikel", { controller: "articles", action: "index" });
    await assertRaise([Assertion], {}, () => {
      t().assertRouting("/articles", { controller: "articles", action: "index" });
    });
  });

  it("with routing for entire test file can be overwritten for individual test", async () => {
    await t().withRouting(async (routes: RouteSet) => {
      routes.draw((r) => {
        r.resources("articles", { path: "articolo" } as RouteOptions);
      });

      t().assertRouting("/articolo", { controller: "articles", action: "index" });
      await assertRaise([Assertion], {}, () => {
        t().assertRouting("/artikel", { controller: "articles", action: "index" });
      });
    });

    t().assertRouting("/artikel", { controller: "articles", action: "index" });
    await assertRaise([Assertion], {}, () => {
      t().assertRouting("/articolo", { controller: "articles", action: "index" });
    });
  });
}

describe("RoutingAssertionsControllerTest", () => {
  class RoutingAssertionsControllerTest extends TestCase {
    constructor() {
      super(ArticlesController);
    }
  }
  RoutingAssertionsSharedTests(runTest(RoutingAssertionsControllerTest));

  describe("WithRoutingTest", () => {
    class WithRoutingTest extends TestCase {
      constructor() {
        super(SecureArticlesController);
      }
    }
    const t = runTest(WithRoutingTest);
    WithRoutingSharedTests(WithRoutingTest, t);

    it("with_routing routes are reachable", async () => {
      t().controller = new SecureArticlesController();

      await t().withRouting(async (routes: RouteSet) => {
        routes.draw((r) => {
          r.get("new_route", { to: "secure_articles#index" });
        });

        await t().get("index");

        assertPredicate(t().response, (v) => v.isOk);
      });
    });
  });
});

describe("RoutingAssertionsIntegrationTest", () => {
  class RoutingAssertionsIntegrationTest extends IntegrationTest {}
  const t = runTest(RoutingAssertionsIntegrationTest);
  RoutingAssertionsSharedTests(t);

  it("https and host settings are set on new session", () => {
    t().httpsBang();
    t().hostBang("newhost.com");

    t().withRouting((routes: RouteSet) => {
      routes.draw(() => {});
      assertPredicate(t().integrationSession, (v) => v.isHttps());
      assertEqual("newhost.com", t().integrationSession.host);
    });
  });

  describe("WithRoutingTest", () => {
    class WithRoutingTest extends IntegrationTest {}
    const t = runTest(WithRoutingTest);
    WithRoutingSharedTests(WithRoutingTest, t);

    it("with_routing routes are reachable", async () => {
      await t().withRouting(async (routes: RouteSet) => {
        routes.draw((r) => {
          r.get("new_route", { to: "secure_articles#index" });
        });

        await t().get("/new_route");

        assertPredicate(t().response, (v) => v.isOk);
      });
    });
  });

  describe("WithRoutingSettingsTest", () => {
    class WithRoutingSettingsTest extends IntegrationTest {
      static {
        this.setup(function (this: IntegrationTest) {
          this.httpsBang();
          this.hostBang("newhost.com");
        });

        this.withRouting((routes: RouteSet) => {
          routes.draw(() => {});
        });
      }
    }
    const t = runTest(WithRoutingSettingsTest);

    it("https and host settings are set on new session", () => {
      assertPredicate(t().integrationSession, (v) => v.isHttps());
      assertEqual("newhost.com", t().integrationSession.host);
    });
  });
});

describe("WithRoutingResetTest", () => {
  class WithRoutingResetTest extends IntegrationTest {}
  const t = runTest(WithRoutingResetTest);

  it("with_routing doesn't rebuild the middleware stack", async () => {
    const middleware = class {
      _app: RackApp;
      _config: Record<string, unknown>;

      constructor(app: RackApp, block: (config: Record<string, unknown>) => void) {
        this._app = app;
        this._config = {};

        block(this._config);
      }

      call(_env: unknown): [number, Record<string, string>, string[]] {
        return [200, { "content-type": "text/plain; charset=UTF-8" }, [String(this._config.foo)]];
      }
    };

    let middlewareConfig: Record<string, unknown> | null = null;

    t().app = IntegrationTest.buildApp(null, (middlewareStack: MiddlewareStack) => {
      middlewareStack.use(
        middleware as unknown as MiddlewareFactory,
        (config: Record<string, unknown>) => {
          middlewareConfig = config;
        },
      );
    });
    (t().app as { routes: RouteSet }).routes.draw((r: Mapper) => {
      r.get("/purchase", { to: "store#purchase" });
    });

    middlewareConfig!.foo = "bar";

    await t().get("/purchase");
    t().assertResponse("ok");
    assertEqual("bar", t().response.body);

    await t().withRouting(async (routeSet: RouteSet) => {
      routeSet.draw((r) => {
        r.get("/purchase", { to: "store#purchase" });
      });

      await t().get("/purchase");
      t().assertResponse("ok");
      assertEqual("bar", t().response.body);
    });

    await t().get("/purchase");
    t().assertResponse("ok");
    assertEqual("bar", t().response.body);
  });
});
