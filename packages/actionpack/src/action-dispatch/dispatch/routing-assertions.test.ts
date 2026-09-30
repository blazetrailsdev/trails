import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Assertion,
  assertEqual,
  assertMatch,
  assertPredicate,
  assertRaise,
  include,
  TopLevel,
} from "@blazetrails/activesupport";
import { Base } from "../../action-controller/base.js";
import { TestCase } from "../../action-controller/test-case.js";
import { controllerConstants } from "../http/request.js";
import type { MiddlewareFactory, MiddlewareStack, RackApp } from "../middleware/stack.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";
import type { Request } from "../http/request.js";
import type { MountableApp, RouteOptions } from "../routing/mapper.js";
import { RouteSet } from "../routing/route-set.js";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";

class ArticlesController extends Base {}
class BooksController extends Base {}

class SecureArticlesController extends ArticlesController {
  async index(): Promise<void> {
    await this.render({ inline: "" });
  }
}
class BlockArticlesController extends ArticlesController {}
class QueryArticlesController extends ArticlesController {}

class SecureBooksController extends BooksController {}
class BlockBooksController extends BooksController {}
class QueryBooksController extends BooksController {}

beforeAll(() => {
  for (const [name, klass] of Object.entries({
    articles: ArticlesController,
    secure_articles: SecureArticlesController,
    block_articles: BlockArticlesController,
    query_articles: QueryArticlesController,
    books: BooksController,
    secure_books: SecureBooksController,
    block_books: BlockBooksController,
    query_books: QueryBooksController,
  })) {
    controllerConstants.set(name, klass as unknown as DispatchableControllerClass);
  }
});

class Engine {}

let trails: typeof TopLevel.Trails;
beforeAll(() => {
  trails = TopLevel.Trails;
  TopLevel.Trails = { Engine } as never;
});
afterAll(() => {
  TopLevel.Trails = trails;
});

function engineClass(name: string): MountableApp & { routes(): RouteSet } {
  const klass = class extends Engine {
    static _routes = new RouteSet();

    static routes(): RouteSet {
      return this._routes;
    }

    static call(_env: Record<string, unknown>): void {}
  };
  Object.defineProperty(klass, "name", { value: name });
  return klass as unknown as MountableApp & { routes(): RouteSet };
}

interface Host {
  routes?: RouteSet;
  beforeSetup(): void;
  setup(): void;
  afterTeardown(test: { failures: Error[] }): void;
  assertGenerates: TestCase["assertGenerates"];
  assertRecognizes: TestCase["assertRecognizes"];
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

function RoutingAssertionsSharedTests(klass: HostClass, t: () => Host): void {
  const assertGenerates = (...args: Parameters<Host["assertGenerates"]>) =>
    t().assertGenerates(...args);
  const assertRecognizes = (...args: Parameters<Host["assertRecognizes"]>) =>
    t().assertRecognizes(...args);
  const assertRouting = (...args: Parameters<Host["assertRouting"]>) => t().assertRouting(...args);

  include(klass, {
    setup(this: Host): void {
      const rootEngine = engineClass("root_engine");

      rootEngine.routes().draw(function () {
        this.root({ to: "books#index" });
      });

      const engine = engineClass("blog_engine");

      engine.routes().draw(function () {
        this.resources("books");

        this.scope("secure", { constraints: { protocol: "https://" } }, () => {
          this.resources("books", { controller: "secure_books" } as RouteOptions);
        });

        this.scope("block", { constraints: (req: Request) => req.ssl }, () => {
          this.resources("books", { controller: "block_books" } as RouteOptions);
        });

        this.scope(
          "query",
          { constraints: (req: Request) => req.params["use_query"] === "true" },
          () => {
            this.resources("books", { controller: "query_books" } as RouteOptions);
          },
        );
      });

      this.routes = new RouteSet();
      this.routes.draw(function () {
        this.resources("articles");

        this.scope("secure", { constraints: { protocol: "https://" } }, () => {
          this.resources("articles", { controller: "secure_articles" } as RouteOptions);
        });

        this.scope("block", { constraints: (req: Request) => req.ssl }, () => {
          this.resources("articles", { controller: "block_articles" } as RouteOptions);
        });

        this.scope(
          "query",
          { constraints: (req: Request) => req.params["use_query"] === "true" },
          () => {
            this.resources("articles", { controller: "query_articles" } as RouteOptions);
          },
        );

        this.mount(engine, { at: "/shelf" });

        this.mount(rootEngine, { at: "/" });

        this.get("/shelf/foo", { controller: "query_articles", action: "index" });
      });
    },
  });

  it("assert generates", () => {
    assertGenerates("/articles", { controller: "articles", action: "index" });
    assertGenerates("/articles/1", { controller: "articles", action: "show", id: "1" });
  });

  it("assert generates with defaults", () => {
    assertGenerates("/articles/1/edit", { controller: "articles", action: "edit" }, { id: "1" });
  });

  it("assert generates with extras", () => {
    assertGenerates(
      "/articles",
      { controller: "articles", action: "index", page: "1" },
      {},
      { page: "1" },
    );
  });

  it("assert recognizes", () => {
    assertRecognizes({ controller: "articles", action: "index" }, "/articles");
    assertRecognizes({ controller: "articles", action: "show", id: "1" }, "/articles/1");
  });

  it("assert recognizes with extras", () => {
    assertRecognizes({ controller: "articles", action: "index", page: "1" }, "/articles", {
      page: "1",
    });
  });

  it("assert recognizes with method", () => {
    assertRecognizes(
      { controller: "articles", action: "create" },
      { path: "/articles", method: "post" },
    );
    assertRecognizes(
      { controller: "articles", action: "update", id: "1" },
      { path: "/articles/1", method: "put" },
    );
  });

  it("assert recognizes with hash constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "secure_articles", action: "index" },
        "http://test.host/secure/articles",
      );
    });
    assertRecognizes(
      { controller: "secure_articles", action: "index", protocol: "https://" },
      "https://test.host/secure/articles",
    );
  });

  it("assert recognizes with block constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "block_articles", action: "index" },
        "http://test.host/block/articles",
      );
    });
    assertRecognizes(
      { controller: "block_articles", action: "index" },
      "https://test.host/block/articles",
    );
  });

  it("assert recognizes with query constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "query_articles", action: "index", use_query: "false" },
        "/query/articles",
        { use_query: "false" },
      );
    });
    assertRecognizes(
      { controller: "query_articles", action: "index", use_query: "true" },
      "/query/articles",
      { use_query: "true" },
    );
  });

  it("assert recognizes raises message", async () => {
    const err = await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "secure_articles", action: "index" },
        "http://test.host/secure/articles",
        {},
        "This is a really bad msg",
      );
    });

    assertMatch(err.message, "This is a really bad msg");
  });

  it("assert recognizes with engine", () => {
    assertRecognizes({ controller: "books", action: "index" }, "/shelf/books");
    assertRecognizes({ controller: "books", action: "show", id: "1" }, "/shelf/books/1");
  });

  it("assert recognizes with engine at root", () => {
    assertRecognizes({ controller: "books", action: "index" }, "/");
  });

  it("assert recognizes with engine and extras", () => {
    assertRecognizes({ controller: "books", action: "index", page: "1" }, "/shelf/books", {
      page: "1",
    });
  });

  it("assert recognizes with engine and method", () => {
    assertRecognizes(
      { controller: "books", action: "create" },
      { path: "/shelf/books", method: "post" },
    );
    assertRecognizes(
      { controller: "books", action: "update", id: "1" },
      { path: "/shelf/books/1", method: "put" },
    );
  });

  it("assert recognizes with engine and hash constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "secure_books", action: "index" },
        "http://test.host/shelf/secure/books",
      );
    });
    assertRecognizes(
      { controller: "secure_books", action: "index", protocol: "https://" },
      "https://test.host/shelf/secure/books",
    );
  });

  it("assert recognizes with engine and block constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "block_books", action: "index" },
        "http://test.host/shelf/block/books",
      );
    });
    assertRecognizes(
      { controller: "block_books", action: "index" },
      "https://test.host/shelf/block/books",
    );
  });

  it("assert recognizes with engine and query constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "query_books", action: "index", use_query: "false" },
        "/shelf/query/books",
        { use_query: "false" },
      );
    });
    assertRecognizes(
      { controller: "query_books", action: "index", use_query: "true" },
      "/shelf/query/books",
      { use_query: "true" },
    );
  });

  it("assert recognizes raises message with engine", async () => {
    const err = await assertRaise([Assertion], {}, () => {
      assertRecognizes(
        { controller: "secure_books", action: "index" },
        "http://test.host/shelf/secure/books",
        {},
        "This is a really bad msg",
      );
    });

    assertMatch(err.message, "This is a really bad msg");
  });

  it("assert recognizes continue to recognize after it tried engines", () => {
    assertRecognizes({ controller: "query_articles", action: "index" }, "/shelf/foo");
  });

  it("assert routing", () => {
    assertRouting("/articles", { controller: "articles", action: "index" });
  });

  it("assert routing raises message", async () => {
    const err = await assertRaise([Assertion], {}, () => {
      assertRouting(
        "/thisIsNotARoute",
        { controller: "articles", action: "edit", id: "1" },
        { id: "1" },
        {},
        "This is a really bad msg",
      );
    });

    assertMatch(err.message, "This is a really bad msg");
  });

  it("assert routing with defaults", () => {
    assertRouting(
      "/articles/1/edit",
      { controller: "articles", action: "edit", id: "1" },
      { id: "1" },
    );
  });

  it("assert routing with extras", () => {
    assertRouting(
      "/articles",
      { controller: "articles", action: "index", page: "1" },
      {},
      { page: "1" },
    );
  });

  it("assert routing with hash constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRouting("http://test.host/secure/articles", {
        controller: "secure_articles",
        action: "index",
      });
    });
    assertRouting("https://test.host/secure/articles", {
      controller: "secure_articles",
      action: "index",
      protocol: "https://",
    });
  });

  it("assert routing with block constraint", async () => {
    await assertRaise([Assertion], {}, () => {
      assertRouting("http://test.host/block/articles", {
        controller: "block_articles",
        action: "index",
      });
    });
    assertRouting("https://test.host/block/articles", {
      controller: "block_articles",
      action: "index",
    });
  });

  it("with routing", async () => {
    await t().withRouting(async (routes: RouteSet) => {
      routes.draw(function () {
        this.resources("articles", { path: "artikel" } as RouteOptions);
      });

      assertRouting("/artikel", { controller: "articles", action: "index" });
      await assertRaise([Assertion], {}, () => {
        assertRouting("/articles", { controller: "articles", action: "index" });
      });
    });
  });
}

function WithRoutingSharedTests(klass: HostClass, t: () => Host): void {
  const assertRouting = (...args: Parameters<Host["assertRouting"]>) => t().assertRouting(...args);

  const beforeSetup = klass.prototype.beforeSetup;
  klass.prototype.beforeSetup = function (this: Host): void {
    this.routes = new RouteSet();
    this.routes.draw(function () {
      this.resources("articles");
    });

    beforeSetup.call(this);
  };

  klass.withRouting((routes: RouteSet) => {
    routes.draw(function () {
      this.resources("articles", { path: "artikel" } as RouteOptions);
    });
  });

  it("with routing for the entire test file", async () => {
    assertRouting("/artikel", { controller: "articles", action: "index" });
    await assertRaise([Assertion], {}, () => {
      assertRouting("/articles", { controller: "articles", action: "index" });
    });
  });

  it("with routing for entire test file can be overwritten for individual test", async () => {
    await t().withRouting(async (routes: RouteSet) => {
      routes.draw(function () {
        this.resources("articles", { path: "articolo" } as RouteOptions);
      });

      assertRouting("/articolo", { controller: "articles", action: "index" });
      await assertRaise([Assertion], {}, () => {
        assertRouting("/artikel", { controller: "articles", action: "index" });
      });
    });

    assertRouting("/artikel", { controller: "articles", action: "index" });
    await assertRaise([Assertion], {}, () => {
      assertRouting("/articolo", { controller: "articles", action: "index" });
    });
  });
}

describe("RoutingAssertionsControllerTest", () => {
  class RoutingAssertionsControllerTest extends TestCase {
    constructor() {
      super(ArticlesController);
    }
  }
  RoutingAssertionsSharedTests(
    RoutingAssertionsControllerTest,
    runTest(RoutingAssertionsControllerTest),
  );

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
        routes.draw(function () {
          this.get("new_route", { to: "secure_articles#index" });
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
  RoutingAssertionsSharedTests(RoutingAssertionsIntegrationTest, t);

  it("https and host settings are set on new session", () => {
    t().httpsBang();
    t().hostBang("newhost.com");

    t().withRouting((routes: RouteSet) => {
      routes.draw(function () {});
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
        routes.draw(function () {
          this.get("new_route", { to: "secure_articles#index" });
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
          routes.draw(function () {});
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
    (t().app as { routes: RouteSet }).routes.draw(function () {
      this.get("/purchase", { to: "store#purchase" });
    });

    middlewareConfig!.foo = "bar";

    await t().get("/purchase");
    t().assertResponse("ok");
    assertEqual("bar", t().response.body);

    await t().withRouting(async (routeSet: RouteSet) => {
      routeSet.draw(function () {
        this.get("/purchase", { to: "store#purchase" });
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
