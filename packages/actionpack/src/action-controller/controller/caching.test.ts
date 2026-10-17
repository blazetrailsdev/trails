import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  assert,
  assertEmpty,
  assertEqual,
  assertMatch,
  assertNil,
  assertNothingRaised,
  assertNot,
  assertPredicate,
  htmlSafe,
  isHtmlSafe,
  MemoryStore,
  extend,
  Notifications,
  stub,
} from "@blazetrails/activesupport";
import { rbFSend, setEnv } from "@blazetrails/ruby-compat";
import { CacheHelper, Digestor, OutputBuffer, PartialRenderer } from "@blazetrails/actionview";
import { Time } from "@blazetrails/date";
import "../../test-helpers/abstract-unit.js";
import { Customer } from "../../test-helpers/lib/controller/fake-models.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import type { VariantCollector } from "../metal/mime-responds.js";
import type { CachingClassMethods, CachingHost } from "../../abstract-controller/caching.js";
import type { FragmentsHost } from "../../abstract-controller/caching/fragments.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}
function makeResponse(): Response {
  return new Response();
}

describe("FragmentCachingTest", () => {
  it("freshWhen sets ETag", async () => {
    class C extends Base {
      async show() {
        await this.freshWhen(null, { etag: "resource-v1" });
        if (!this.performed) await this.render({ plain: "content" });
      }
    }
    const c = new C();
    await c.dispatch("show", makeRequest(), makeResponse());
    expect(c.headers.get("etag")).toMatch(/^W\/"[a-f0-9]{32}"$/);
  });

  it("freshWhen sets Last-Modified", async () => {
    const date = new Date("2024-06-15T12:00:00Z");
    class C extends Base {
      async show() {
        await this.freshWhen(null, { lastModified: date });
        if (!this.performed) await this.render({ plain: "content" });
      }
    }
    const c = new C();
    await c.dispatch("show", makeRequest(), makeResponse());
    expect(c.headers.get("last-modified")).toBe("Sat, 15 Jun 2024 12:00:00 GMT");
  });

  it("freshWhen accepts a Temporal.Instant lastModified", async () => {
    const instant = Temporal.Instant.from("2024-06-15T12:00:00Z");
    class C extends Base {
      async show() {
        await this.freshWhen(null, { lastModified: instant });
        if (!this.performed) await this.render({ plain: "content" });
      }
    }
    const c = new C();
    await c.dispatch("show", makeRequest(), makeResponse());
    expect(c.headers.get("last-modified")).toBe("Sat, 15 Jun 2024 12:00:00 GMT");
  });

  it("freshWhen sets Cache-Control public", async () => {
    class C extends Base {
      async show() {
        await this.freshWhen(null, { etag: "test", public: true });
        if (!this.performed) await this.render({ plain: "content" });
      }
    }
    const c = new C();
    await c.dispatch("show", makeRequest(), makeResponse());
    expect(c.headers.get("cache-control")).toBe("public");
  });

  it("freshWhen returns 304 when ETag matches", async () => {
    class C extends Base {
      async show() {
        await this.freshWhen(null, { etag: "stable" });
        if (!this.performed) await this.render({ plain: "body" });
      }
    }
    const c1 = new C();
    await c1.dispatch("show", makeRequest(), makeResponse());
    const etag = c1.headers.get("etag")!;
    expect(c1.status).toBe(200);

    const c2 = new C();
    await c2.dispatch(
      "show",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/",
        HTTP_HOST: "localhost",
        HTTP_IF_NONE_MATCH: etag,
      }),
      makeResponse(),
    );
    expect(c2.status).toBe(304);
  });

  it("freshWhen returns 304 when Last-Modified matches", async () => {
    const date = new Date("2024-01-01T00:00:00Z");
    class C extends Base {
      async show() {
        await this.freshWhen(null, { lastModified: date });
        if (!this.performed) await this.render({ plain: "body" });
      }
    }
    const c = new C();
    await c.dispatch(
      "show",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/",
        HTTP_HOST: "localhost",
        HTTP_IF_MODIFIED_SINCE: date.toUTCString(),
      }),
      makeResponse(),
    );
    expect(c.status).toBe(304);
  });

  it("freshWhen does not return 304 for different ETag", async () => {
    class C extends Base {
      async show() {
        await this.freshWhen(null, { etag: "current" });
        if (!this.performed) await this.render({ plain: "body" });
      }
    }
    const c = new C();
    await c.dispatch(
      "show",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/",
        HTTP_HOST: "localhost",
        HTTP_IF_NONE_MATCH: 'W/"old-etag"',
      }),
      makeResponse(),
    );
    expect(c.status).toBe(200);
  });

  it("stale? returns true when no conditional headers", async () => {
    let result: boolean | undefined;
    class C extends Base {
      async show() {
        result = await this.isStale(null, { etag: "test" });
        if (result) await this.render({ plain: "content" });
      }
    }
    const c = new C();
    await c.dispatch("show", makeRequest(), makeResponse());
    expect(result).toBe(true);
    expect(c.responseBody).toBe("content");
  });

  it("stale? returns false when ETag matches", async () => {
    class C extends Base {
      async show() {
        await this.freshWhen(null, { etag: "match" });
        if (!this.performed) await this.render({ plain: "body" });
      }
    }
    const c1 = new C();
    await c1.dispatch("show", makeRequest(), makeResponse());
    const etag = c1.headers.get("etag")!;

    let result: boolean | undefined;
    class C2 extends Base {
      async show() {
        result = await this.isStale(null, { etag: "match" });
        if (result) await this.render({ plain: "body" });
      }
    }
    const c2 = new C2();
    await c2.dispatch(
      "show",
      new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/",
        HTTP_HOST: "localhost",
        HTTP_IF_NONE_MATCH: etag,
      }),
      makeResponse(),
    );
    expect(result).toBe(false);
  });

  it("expiresIn sets max-age", async () => {
    class C extends Base {
      async index() {
        this.expiresIn(3600);
        await this.render({ plain: "ok" });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.headers.get("cache-control")).toBe("max-age=3600, private");
  });

  it("expiresIn with public", async () => {
    class C extends Base {
      async index() {
        this.expiresIn(600, { public: true });
        await this.render({ plain: "ok" });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.headers.get("cache-control")).toBe("max-age=600, public");
  });

  it("expiresIn with must-revalidate", async () => {
    class C extends Base {
      async index() {
        this.expiresIn(300, { mustRevalidate: true });
        await this.render({ plain: "ok" });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.headers.get("cache-control")).toBe("max-age=300, private, must-revalidate");
  });

  it("expiresIn with public and must-revalidate", async () => {
    class C extends Base {
      async index() {
        this.expiresIn(60, { public: true, mustRevalidate: true });
        await this.render({ plain: "ok" });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.headers.get("cache-control")).toBe("max-age=60, public, must-revalidate");
  });

  it("expiresNow sets no-cache", async () => {
    class C extends Base {
      async index() {
        this.expiresNow();
        await this.render({ plain: "ok" });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.headers.get("cache-control")).toBe("no-cache");
  });
});

const CACHE_DIR = "test_cache";
const FILE_STORE_PATH = new URL(`../temp/${CACHE_DIR}`, import.meta.url).pathname;

class CachingController extends Base {
  declare performCaching: boolean;
  declare enableFragmentCacheLogging: boolean;

  static {
    this.abstractBang();
    (this as unknown as CachingClassMethods).cacheStore = [":file_store", FILE_STORE_PATH];
  }
}

class FragmentCachingTestController extends CachingController {
  someAction() {}
}

describe("FragmentCachingTest", () => {
  class ModelWithKeyAndVersion {
    constructor(
      private _cacheKey: string,
      private _cacheVersion: string,
    ) {}

    cacheKey(): string {
      return this._cacheKey;
    }

    cacheVersion(): string {
      return this._cacheVersion;
    }
  }

  let tc: TestCase;
  let store: MemoryStore;
  let controller: FragmentCachingTestController & FragmentsHost;
  let params: Record<string, unknown>;
  let m1v1: ModelWithKeyAndVersion;
  let m1v2: ModelWithKeyAndVersion;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    await tc.beforeSetup();
    store = new MemoryStore();
    controller = new FragmentCachingTestController() as typeof controller;
    controller.performCaching = true;
    controller.cacheStore = store;
    params = { controller: "posts", action: "index" };
    controller.params = params;
    controller.request = tc.request;
    controller.response = tc.response;

    m1v1 = new ModelWithKeyAndVersion("model/1", "1");
    m1v2 = new ModelWithKeyAndVersion("model/1", "2");
  });

  it("combined fragment cache key", () => {
    assertEqual(["views", "what a key"], controller.combinedFragmentCacheKey("what a key"));
    assertEqual(
      ["views", "test.host/fragment_caching_test/some_action"],
      controller.combinedFragmentCacheKey({
        controller: "fragment_caching_test",
        action: "some_action",
      }),
    );
  });

  it("read fragment with caching enabled", async () => {
    await store.write("views/name", "value");
    assertEqual("value", await controller.readFragment("name"));
  });

  it("read fragment with caching disabled", async () => {
    controller.performCaching = false;
    await store.write("views/name", "value");
    assertNil(await controller.readFragment("name"));
  });

  it("read fragment with versioned model", async () => {
    await controller.writeFragment(["stuff", m1v1], "hello");
    assertEqual("hello", await controller.readFragment(["stuff", m1v1]));
    assertNil(await controller.readFragment(["stuff", m1v2]));
  });

  it("fragment exist with caching enabled", async () => {
    await store.write("views/name", "value");
    assert(await controller.fragmentExist("name"));
    assertNot(await controller.fragmentExist("other_name"));
  });

  it("fragment exist with caching disabled", async () => {
    controller.performCaching = false;
    await store.write("views/name", "value");
    assertNot(await controller.fragmentExist("name"));
    assertNot(await controller.fragmentExist("other_name"));
  });

  it("write fragment with caching enabled", async () => {
    assertNil(await store.read("views/name"));
    assertEqual("value", await controller.writeFragment("name", "value"));
    assertEqual("value", await store.read("views/name"));
  });

  it("write fragment with caching disabled", async () => {
    assertNil(await store.read("views/name"));
    controller.performCaching = false;
    assertEqual("value", await controller.writeFragment("name", "value"));
    assertNil(await store.read("views/name"));
  });

  it("expire fragment with simple key", async () => {
    await store.write("views/name", "value");
    await controller.expireFragment("name");
    assertNil(await store.read("views/name"));
  });

  it("expire fragment with regexp", async () => {
    await store.write("views/name", "value");
    await store.write("views/another_name", "another_value");
    await store.write("views/primalgrasp", "will not expire ;-)");

    await controller.expireFragment(/name/);

    assertNil(await store.read("views/name"));
    assertNil(await store.read("views/another_name"));
    assertEqual("will not expire ;-)", await store.read("views/primalgrasp"));
  });

  it("fragment for", async () => {
    await store.write("views/expensive", "fragment content");
    let fragmentComputed = false;

    const viewContext = controller.viewContext();

    const buffer = htmlSafe("generated till now -> ");
    buffer.concat(
      await rbFSend(viewContext, "fragmentFor", "expensive", undefined, () => {
        fragmentComputed = true;
      }),
    );

    assertNot(fragmentComputed);
    assertEqual("generated till now -> fragment content", buffer.toString());
  });

  it("html safety", async () => {
    assertNil(await store.read("views/name"));
    const content = htmlSafe("value");
    assertEqual(content, await controller.writeFragment("name", content));

    const cached = await store.read("views/name");
    assertEqual(content, cached);
    assertEqual("string", typeof cached);

    const htmlSafeValue = await controller.readFragment("name");
    assertEqual(content, htmlSafeValue);
    assertPredicate(htmlSafeValue, isHtmlSafe);
  });
});

class FunctionalCachingController extends CachingController {
  fragmentCached() {}

  async htmlFragmentCachedWithPartial() {
    await this.respondTo((format) => {
      format.html();
    });
  }

  xmlFragmentCachedWithHtmlPartial() {}

  async formattedFragmentCached() {
    await this.respondTo((format) => {
      format.html();
      format.xml();
    });
  }

  async formattedFragmentCachedWithVariant() {
    if (this.params.get("v") === "phone") this.request.variant = ":phone";

    await this.respondTo((format) => {
      (format.html() as VariantCollector & Record<string, () => void>).phone();
      format.html();
    });
  }

  fragmentCachedWithoutDigest() {}

  fragmentCachedWithOptions() {}
}

describe("FunctionalFragmentCachingTest", () => {
  let tc: TestCase;
  let store: MemoryStore;
  let controller: FunctionalCachingController;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    await tc.beforeSetup();
    store = new MemoryStore();
    controller = new FunctionalCachingController();
    tc.controller = controller;
    controller.performCaching = true;
    controller.cacheStore = store;
    controller.enableFragmentCacheLogging = true;
  });

  function templateDigest(name: string, format: string): unknown {
    return Digestor.digest({ name, format, finder: controller.lookupContext });
  }

  it("fragment caching", async () => {
    await tc.get("fragmentCached");
    tc.assertResponse("success");
    const expectedBody = "Hello\nThis bit's fragment cached\nCiao\n";
    assertEqual(expectedBody, tc.response.body);

    assertEqual(
      "This bit's fragment cached",
      String(
        await store.read(
          `views/functional-caching/fragment-cached:${templateDigest("functional-caching/fragment-cached", "html")}/fragment`,
        ),
      ),
    );
  });

  it("fragment caching in partials", async () => {
    await tc.get("htmlFragmentCachedWithPartial");
    tc.assertResponse("success");
    assertMatch(/Old fragment caching in a partial/, tc.response.body);

    assertMatch(
      "Old fragment caching in a partial",
      String(
        await store.read(
          `views/functional-caching/_partial:${templateDigest("functional-caching/_partial", "html")}/test.host/functional_caching/htmlFragmentCachedWithPartial`,
        ),
      ),
    );
  });

  it("skipping fragment cache digesting", async () => {
    await tc.get("fragmentCachedWithoutDigest", { format: "html" });
    tc.assertResponse("success");
    const expectedBody = "<body>\n<p>ERB</p>\n</body>\n";

    assertEqual(expectedBody, tc.response.body);
    assertEqual("<p>ERB</p>", String(await store.read("views/nodigest")));
  });

  it("fragment caching with options", async () => {
    const time = Time.now();
    await tc.get("fragmentCachedWithOptions");
    tc.assertResponse("success");
    const expectedBody = "<body>\n<p>ERB</p>\n</body>\n";

    assertEqual(expectedBody, tc.response.body);
    await stub(Time, "now", time.plus(11), [], async () => {
      assertNil(await store.read("views/with_options"));
    });
  });

  it("render inline before fragment caching", async () => {
    await tc.get("inlineFragmentCached");
    tc.assertResponse("success");
    assertMatch(/Some inline content/, tc.response.body);
    assertMatch(/Some cached content/, tc.response.body);
    assertMatch(
      "Some cached content",
      String(
        await store.read(
          `views/functional-caching/inline-fragment-cached:${templateDigest("functional-caching/inline-fragment-cached", "html")}/test.host/functional_caching/inlineFragmentCached`,
        ),
      ),
    );
  });

  it("fragment cache instrumentation", async () => {
    let payload: Record<string, unknown> | null = null;

    const subscriber = (event: { payload: Record<string, unknown> }) => {
      payload = event.payload;
    };

    await Notifications.subscribed(subscriber, "read_fragment.action_controller", async () => {
      await tc.get("inlineFragmentCached");
    });

    assertEqual("functional_caching", payload!.controller);
    assertEqual("inlineFragmentCached", payload!.action);
  });

  it("html formatted fragment caching", async () => {
    const format = "html";
    await tc.get("formattedFragmentCached", { format });
    tc.assertResponse("success");
    const expectedBody = "<body>\n<p>ERB</p>\n</body>\n";

    assertEqual(expectedBody, tc.response.body);

    assertEqual(
      "<p>ERB</p>",
      String(
        await store.read(
          `views/functional-caching/formatted-fragment-cached:${templateDigest("functional-caching/formatted-fragment-cached", format)}/fragment`,
        ),
      ),
    );
  });

  // PERMANENT-SKIP: renders a `.builder` template; `template/handlers/builder.rb` is unported (scripts/parity/unported-files/actionview.ts), the `builder` gem being a third-party runtime dep.
  it.skip("xml formatted fragment caching", async () => {
    const format = "xml";
    await tc.get("formattedFragmentCached", { format });
    tc.assertResponse("success");
    const expectedBody = "<body>\n  <p>Builder</p>\n</body>\n";

    assertEqual(expectedBody, tc.response.body);

    assertEqual(
      "  <p>Builder</p>\n",
      String(
        await store.read(
          `views/functional-caching/formatted-fragment-cached:${templateDigest("functional-caching/formatted-fragment-cached", format)}/fragment`,
        ),
      ),
    );
  });

  it("fragment caching with variant", async () => {
    const format = "html";
    await tc.get("formattedFragmentCachedWithVariant", { format, params: { v: "phone" } });
    tc.assertResponse("success");
    const expectedBody = "<body>\n<p>PHONE</p>\n</body>\n";

    assertEqual(expectedBody, tc.response.body);

    assertEqual(
      "<p>PHONE</p>",
      String(
        await store.read(
          `views/functional-caching/formatted-fragment-cached-with-variant:${templateDigest("functional-caching/formatted-fragment-cached-with-variant", format)}/fragment`,
        ),
      ),
    );
  });

  // PERMANENT-SKIP: renders a `.builder` template; `template/handlers/builder.rb` is unported (scripts/parity/unported-files/actionview.ts), the `builder` gem being a third-party runtime dep.
  it.skip("fragment caching with html partials in xml", async () => {
    await tc.get("xmlFragmentCachedWithHtmlPartial", { format: "*/*" });
    tc.assertResponse("success");
  });
});

describe("CacheHelperOutputBufferTest", () => {
  class MockController {
    readFragment(_name: unknown, _options: unknown) {
      return false;
    }

    writeFragment(_name: unknown, fragment: unknown, _options: unknown) {
      return fragment;
    }
  }

  it("output buffer", async () => {
    const outputBuffer = new OutputBuffer();
    const controller = new MockController();
    const cacheHelper = class {
      static get controller(): unknown {
        return undefined;
      }
      static get outputBuffer(): unknown {
        return undefined;
      }
      static set outputBuffer(_value: unknown) {}
    };
    extend(cacheHelper, CacheHelper);

    await stub(cacheHelper, "controller", controller, [], async () => {
      await stub(cacheHelper, "outputBuffer", outputBuffer, [], async () => {
        await assertNothingRaised(async () => {
          await rbFSend(
            cacheHelper,
            "fragmentFor",
            "Test fragment name",
            "Test fragment",
            () => null,
          );
        });
      });
    });
  });
});

describe("ViewCacheDependencyTest", () => {
  class NoDependenciesController extends Base {}

  class HasDependenciesController extends Base {
    static {
      this.viewCacheDependency(() => "trombone");
      this.viewCacheDependency(() => "flute");
    }
  }

  it("view cache dependencies are empty by default", () => {
    assertEmpty((new NoDependenciesController() as Base & CachingHost).viewCacheDependencies());
  });

  it("view cache dependencies are listed in declaration order", () => {
    assertEqual(
      ["trombone", "flute"],
      (new HasDependenciesController() as Base & CachingHost).viewCacheDependencies(),
    );
  });
});

class CollectionCacheController extends Base {
  declare performCaching: boolean;
  declare partialRenderedTimes: number;
  declare customers: Customer[];

  index() {
    this.customers = [new Customer("david", this.params.get("id") ?? 1)];
  }

  async indexOrdered() {
    this.customers = [new Customer("david", 1), new Customer("david", 2), new Customer("david", 3)];
    await this.render("index");
  }

  async indexExplicitRenderInController() {
    this.customers = [new Customer("david", 1)];
    await this.render({ partial: "customers/customer", collection: this.customers, cached: true });
  }

  async indexWithComment() {
    this.customers = [new Customer("david", 1)];
    await this.render({
      partial: "customers/commented_customer",
      collection: this.customers,
      as: "customer",
      cached: true,
    });
  }

  async indexWithCallableCacheKey() {
    this.customers = [new Customer("david", 1)];
    await this.render({
      partial: "customers/customer",
      collection: this.customers,
      cached: (_customer: Customer) => "cached_david",
    });
  }
}

describe("CollectionCacheTest", () => {
  let tc: TestCase & { assertSelect(selector: string, equality: string): void };
  let controller: CollectionCacheController;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name) as typeof tc;
    await tc.beforeSetup();
    controller = new CollectionCacheController();
    tc.controller = controller;
    controller.performCaching = true;
    controller.partialRenderedTimes = 0;
    controller.cacheStore = new MemoryStore();
    PartialRenderer.setCollectionCache(new MemoryStore());
  });

  it("collection fetches cached views", async () => {
    await tc.get("index");
    assertEqual(1, controller.partialRenderedTimes);
    assertMatch(
      "david, 1",
      String(
        await PartialRenderer.collectionCache().read(
          "views/customers/_customer:239b0b044be6fb844f59709f5046b6ab/david/1",
        ),
      ),
    );

    await tc.get("index");
    assertEqual(1, controller.partialRenderedTimes);
  });

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("preserves order when reading from cache plus rendering", async () => {
    await tc.get("index", { params: { id: 2 } });
    assertEqual(1, controller.partialRenderedTimes);
    tc.assertSelect(":root", "david, 2");

    await tc.get("indexOrdered");
    assertEqual(3, controller.partialRenderedTimes);
    tc.assertSelect(":root", "david, 1\n  david, 2\n  david, 3");
  });

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("explicit render call with options", async () => {
    await tc.get("indexExplicitRenderInController");

    tc.assertSelect(":root", "david, 1");
  });

  it("caching works with beginning comment", async () => {
    await tc.get("indexWithComment");
    assertEqual(1, controller.partialRenderedTimes);

    await tc.get("indexWithComment");
    assertEqual(1, controller.partialRenderedTimes);
  });

  it("caching with callable cache key", async () => {
    await tc.get("indexWithCallableCacheKey");
    assertMatch(
      "david, 1",
      String(
        await PartialRenderer.collectionCache().read(
          "views/customers/_customer:239b0b044be6fb844f59709f5046b6ab/cached_david",
        ),
      ),
    );
  });
});

class FragmentCacheKeyTestController extends CachingController {
  declare accountId: string | null;

  static {
    this.fragmentCacheKey("v1");
    this.fragmentCacheKey(null, function (this: FragmentsHost) {
      return (this as unknown as FragmentCacheKeyTestController).accountId;
    });
  }
}

describe("FragmentCacheKeyTest", () => {
  let store: MemoryStore;
  let controller: FragmentCacheKeyTestController & FragmentsHost;

  beforeEach(async ({ task }) => {
    const tc = new TestCase(task.name);
    await tc.beforeSetup();
    store = new MemoryStore();
    controller = new FragmentCacheKeyTestController() as typeof controller;
    controller.performCaching = true;
    controller.cacheStore = store;
  });

  afterEach(() => {
    setEnv("RAILS_CACHE_ID", undefined);
    setEnv("RAILS_APP_VERSION", undefined);
  });

  it("combined fragment cache key", () => {
    controller.accountId = "123";
    assertEqual(
      ["views", "v1", "123", "what a key"],
      controller.combinedFragmentCacheKey("what a key"),
    );

    controller.accountId = null;
    assertEqual(["views", "v1", "what a key"], controller.combinedFragmentCacheKey("what a key"));
  });

  it("combined fragment cache key with envs", () => {
    setEnv("RAILS_APP_VERSION", "55");
    assertEqual(
      ["views", "55", "v1", "what a key"],
      controller.combinedFragmentCacheKey("what a key"),
    );

    setEnv("RAILS_CACHE_ID", "66");
    assertEqual(
      ["views", "66", "v1", "what a key"],
      controller.combinedFragmentCacheKey("what a key"),
    );
  });
});
