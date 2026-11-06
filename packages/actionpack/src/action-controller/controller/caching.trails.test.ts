import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
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

describe("conditional GET", () => {
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
