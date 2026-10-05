import { beforeEach, describe, expect, it, vi } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

class TestController extends Base {
  declare variableForLayout: unknown;

  static {
    this.protectFromForgery();

    this.beforeAction("setVariableForLayout");
  }

  async conditionalHelloWithExpiresIn(): Promise<void> {
    this.expiresIn(Duration.seconds(60.1));
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublic(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithMustRevalidate(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { mustRevalidate: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublicAndMustRevalidate(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, mustRevalidate: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithStaleWhileRevalidate(): Promise<void> {
    this.expiresIn(Duration.minutes(1), {
      public: true,
      staleWhileRevalidate: Duration.minutes(5),
    });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithStaleIfError(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, staleIfError: Duration.minutes(5) });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithImmutable(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, immutable: true });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublicWithMoreKeys(): Promise<void> {
    this.expiresIn(Duration.minutes(1), { public: true, "s-maxage": Duration.hours(5) });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresInWithPublicWithMoreKeysOldSyntax(): Promise<void> {
    this.expiresIn(Duration.minutes(1), {
      public: true,
      private: null,
      "s-maxage": Duration.hours(5),
    });
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresNow(): Promise<void> {
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithCacheControlHeaders(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-transform");
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithExpiresAndConflicitingCacheControlHeaders(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-cache, must-revalidate");
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithoutExpiresAndConflicitingCacheControlHeaders(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-cache, must-revalidate");
    await this.render({ action: "hello_world" });
  }

  async conditionalHelloWithoutExpiresAndPublicHeader(): Promise<void> {
    this.response.headers.set("Cache-Control", "public, no-cache");
    await this.render({ action: "hello_world" });
  }

  async cacheControlDefaultHeaderWithExtrasPartiallyOverriddenByExpiresIn(): Promise<void> {
    this.response.headers.set(
      "Cache-Control",
      "max-age=120, public, s-maxage=60, proxy-revalidate",
    );
    this.expiresIn(Duration.seconds(300), { public: true });
    await this.render({ action: "hello_world" });
  }

  async cacheControlNoStoreOverriddenByExpiresIn(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-store");
    this.expiresIn(Duration.seconds(60), { public: true });
    await this.render({ action: "hello_world" });
  }

  async cacheControlNoStoreOverriddenByExpiresNow(): Promise<void> {
    this.response.headers.set("Cache-Control", "no-store");
    this.expiresNow();
    await this.render({ action: "hello_world" });
  }

  private setVariableForLayout(): void {
    this.variableForLayout = null;
  }
}

describe("ExpiresInRenderTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new TestController();
    await tc.beforeSetup();
    Base.viewPaths().paths.forEach((path) => path.clearCache!());
  });

  it("expires in header", async () => {
    await tc.get("conditionalHelloWithExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, private");
  });

  it("expires in header with public", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublic");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public");
  });

  it("expires in header with must revalidate", async () => {
    await tc.get("conditionalHelloWithExpiresInWithMustRevalidate");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, private, must-revalidate");
  });

  it("expires in header with public and must revalidate", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublicAndMustRevalidate");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, must-revalidate");
  });

  it("expires in header with stale while revalidate", async () => {
    await tc.get("conditionalHelloWithExpiresInWithStaleWhileRevalidate");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      "max-age=60, public, stale-while-revalidate=300",
    );
  });

  it("expires in header with stale if error", async () => {
    await tc.get("conditionalHelloWithExpiresInWithStaleIfError");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, stale-if-error=300");
  });

  it("expires in header with immutable", async () => {
    await tc.get("conditionalHelloWithExpiresInWithImmutable");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, immutable");
  });

  it("expires in header with additional headers", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublicWithMoreKeys");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, s-maxage=18000");
  });

  it("expires in old syntax", async () => {
    await tc.get("conditionalHelloWithExpiresInWithPublicWithMoreKeysOldSyntax");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public, s-maxage=18000");
  });

  it("expires now", async () => {
    await tc.get("conditionalHelloWithExpiresNow");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("expires now with cache control headers", async () => {
    await tc.get("conditionalHelloWithCacheControlHeaders");
    expect(tc.response.headers.get("Cache-Control")).toMatch(/no-cache/);
    expect(tc.response.headers.get("Cache-Control")).toMatch(/no-transform/);
  });

  it("expires now with conflicting cache control headers", async () => {
    await tc.get("conditionalHelloWithExpiresAndConflicitingCacheControlHeaders");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("no expires now with conflicting cache control headers", async () => {
    await tc.get("conditionalHelloWithoutExpiresAndConflicitingCacheControlHeaders");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("no expires now with public", async () => {
    await tc.get("conditionalHelloWithoutExpiresAndPublicHeader");
    expect(tc.response.headers.get("Cache-Control")).toBe("public, no-cache");
  });

  it("date header when expires in", async () => {
    const time = Time.mktime(2011, 10, 30);
    const now = vi.spyOn(Time, "now").mockReturnValue(time);
    try {
      await tc.get("conditionalHelloWithExpiresIn");
      expect(tc.response.headers.get("Date")).toBe(Time.now().httpdate());
    } finally {
      now.mockRestore();
    }
  });

  it("cache control default header with extras partially overridden by expires in", async () => {
    await tc.get("cacheControlDefaultHeaderWithExtrasPartiallyOverriddenByExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      "max-age=300, public, s-maxage=60, proxy-revalidate",
    );
  });

  it("cache control no store overridden by expires in", async () => {
    await tc.get("cacheControlNoStoreOverriddenByExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=60, public");
  });

  it("cache control no store overridden by expires now", async () => {
    await tc.get("cacheControlNoStoreOverriddenByExpiresNow");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("HttpCacheForeverTest", () => {
  class HttpCacheForeverController extends Base {
    async cacheMeForever(): Promise<void> {
      let rendered: void | Promise<void> = undefined;
      this.httpCacheForever({ public: this.params.get("public") as boolean }, () => {
        rendered = this.render({ plain: "hello" });
      });
      await rendered;
    }
  }

  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new HttpCacheForeverController();
    await tc.beforeSetup();
  });

  it("cache with public", async () => {
    await tc.get("cacheMeForever", { params: { public: true } });
    assertResponse("ok");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      `max-age=${Duration.years(100)}, public, immutable`,
    );
    expect(tc.response.etag).not.toBeNull();
    expect(tc.response.isWeakEtag()).toBeTruthy();
  });

  it("cache with private", async () => {
    await tc.get("cacheMeForever");
    assertResponse("ok");
    expect(tc.response.headers.get("Cache-Control")).toBe(
      `max-age=${Duration.years(100)}, private, immutable`,
    );
    expect(tc.response.etag).not.toBeNull();
    expect(tc.response.isWeakEtag()).toBeTruthy();
  });

  it("cache response code with if modified since", async () => {
    await tc.get("cacheMeForever");
    assertResponse("ok");

    tc.request.setIfModifiedSince(tc.response.headers.get("Last-Modified") as string);
    await tc.get("cacheMeForever");
    assertResponse("not_modified");
  });

  it("cache response code with etag", async () => {
    await tc.get("cacheMeForever");
    assertResponse("ok");

    tc.request.setIfNoneMatch(tc.response.etag!);
    await tc.get("cacheMeForever");
    assertResponse("not_modified");
  });
});

describe("HttpCacheNoStoreTest", () => {
  class HttpCacheNoStoreController extends Base {
    async standaloneNoStoreCall(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).noStore(), {
        only: "noStoreOverriddenByExpiresIn",
      });
    }
    async noStoreOverriddenByExpiresIn(): Promise<void> {
      this.expiresIn(Duration.seconds(30));
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).expiresIn(Duration.seconds(30)), {
        only: "expiresInOverriddenByNoStore",
      });
    }
    async expiresInOverriddenByNoStore(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).noStore(), {
        only: "noStoreOverriddenByFreshWhen",
      });
    }
    async noStoreOverriddenByFreshWhen(): Promise<void> {
      this.freshWhen(null, { etag: "123abc" });
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction(
        (c) => (c as HttpCacheNoStoreController).freshWhen(null, { etag: "abc123" }),
        { only: "freshWhenOverriddenByNoStore" },
      );
    }
    async freshWhenOverriddenByNoStore(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).expiresNow(), {
        only: "expiresNowOverriddenByNoStore",
      });
    }
    async expiresNowOverriddenByNoStore(): Promise<void> {
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    static {
      this.beforeAction((c) => (c as HttpCacheNoStoreController).noStore(), {
        only: "noStoreOverriddenByExpiresNow",
      });
    }
    async noStoreOverriddenByExpiresNow(): Promise<void> {
      this.expiresNow();
      await this.render({ plain: "hello world" });
    }

    async cacheControlNoCacheOverriddenByNoStore(): Promise<void> {
      this.response.headers.set("Cache-Control", "no-cache");
      this.noStore();
      await this.render({ plain: "hello world" });
    }

    async cacheControlPublicWithMaxAgeOverriddenByNoStore(): Promise<void> {
      this.response.headers.set("Cache-Control", "public, max-age=604800");
      this.noStore();
      await this.render({ plain: "hello world" });
    }
  }

  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new HttpCacheNoStoreController();
    await tc.beforeSetup();
  });

  it("standalone no store call", async () => {
    await tc.get("standaloneNoStoreCall");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("no store overridden by expires in", async () => {
    await tc.get("noStoreOverriddenByExpiresIn");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=30, private");
  });

  it("expires in overridden by no store", async () => {
    await tc.get("expiresInOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("no store overridden by fresh when", async () => {
    await tc.get("noStoreOverriddenByFreshWhen");
    expect(tc.response.headers.get("Cache-Control")).toBe("max-age=0, private, must-revalidate");
  });

  it("fresh when overridden by no store", async () => {
    await tc.get("freshWhenOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("expires now overridden by no store", async () => {
    await tc.get("expiresNowOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("no store overridden by expires now", async () => {
    await tc.get("noStoreOverriddenByExpiresNow");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("cache control no cache header can be overridden by no store", async () => {
    await tc.get("cacheControlNoCacheOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("cache control public with expiration header can be overridden by no store", async () => {
    await tc.get("cacheControlPublicWithMaxAgeOverriddenByNoStore");
    expect(tc.response.headers.get("Cache-Control")).toBe("no-store");
  });
});
