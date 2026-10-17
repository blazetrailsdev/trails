import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  assert,
  assertEmpty,
  assertEqual,
  assertNil,
  assertNot,
  assertPredicate,
  htmlSafe,
  isHtmlSafe,
  MemoryStore,
} from "@blazetrails/activesupport";
import { rbFSend, setEnv } from "@blazetrails/ruby-compat";
import "../../test-helpers/abstract-unit.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
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

class CachingController extends Base {
  static {
    this.abstractBang();
    this.cacheStore = "memory_store";
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
  let controller: FragmentCachingTestController;
  let params: Record<string, unknown>;
  let m1v1: ModelWithKeyAndVersion;
  let m1v2: ModelWithKeyAndVersion;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    await tc.beforeSetup();
    store = new MemoryStore();
    controller = new FragmentCachingTestController();
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

describe("ViewCacheDependencyTest", () => {
  class NoDependenciesController extends Base {}

  class HasDependenciesController extends Base {
    static {
      this.viewCacheDependency(() => "trombone");
      this.viewCacheDependency(() => "flute");
    }
  }

  it("view cache dependencies are empty by default", () => {
    assertEmpty(new NoDependenciesController().viewCacheDependencies());
  });

  it("view cache dependencies are listed in declaration order", () => {
    assertEqual(["trombone", "flute"], new HasDependenciesController().viewCacheDependencies());
  });
});

class FragmentCacheKeyTestController extends CachingController {
  declare accountId: string | null;

  static {
    this.fragmentCacheKey("v1");
    this.fragmentCacheKey(null, function (this: FragmentCacheKeyTestController) {
      return this.accountId;
    });
  }
}

describe("FragmentCacheKeyTest", () => {
  let store: MemoryStore;
  let controller: FragmentCacheKeyTestController;

  beforeEach(async ({ task }) => {
    const tc = new TestCase(task.name);
    await tc.beforeSetup();
    store = new MemoryStore();
    controller = new FragmentCacheKeyTestController();
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
