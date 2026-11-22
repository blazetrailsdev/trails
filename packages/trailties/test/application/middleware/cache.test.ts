import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { extend, include } from "@blazetrails/ruby-compat";
import { Application } from "../../../lib/application.js";
import { Trails } from "../../../lib/trails.js";
import type { Generation, Rack } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

interface Host extends Generation, Omit<Rack, "get"> {
  get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  lastResponse(): { status: number; headers: Record<string, string | undefined>; body: string };
}

class CacheTest extends TestCase {
  async simpleController(this: Host): Promise<void> {
    await this.controller(
      "expires",
      `
        import { SecureRandom } from "@blazetrails/ruby-compat";
        import { ApplicationController } from "./application-controller.ts";
        let lastModified: Date | undefined;
        export class ExpiresController extends ApplicationController {
          async expiresHeader() {
            this.expiresIn(10, { public: !this.params.get("private") });
            await this.render({ plain: SecureRandom.hex(16) });
          }

          async expiresEtag() {
            await this.renderConditionally({ etag: "1" });
          }

          async expiresLastModified() {
            lastModified ??= new Date();
            await this.renderConditionally({ lastModified });
          }

          async keepsIfModifiedSince() {
            await this.render({ plain: this.request.headers.get("If-Modified-Since") });
          }

          private async renderConditionally(headers: Record<string, unknown>) {
            if (await this.isStale(undefined, { ...headers, public: !this.params.get("private") })) {
              await this.render({ plain: SecureRandom.hex(16) });
            }
          }
        }
`,
    );

    await this.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get(":controller(/:action)");
        });
`,
    );
  }
}
include(CacheTest, Isolation);
registerSpecType(/^CacheTest$/, CacheTest);

describe("CacheTest", { timeout: 120_000 }, () => {
  let t: Host & CacheTest;

  beforeEach(async () => {
    t = new CacheTest("test") as unknown as Host & CacheTest;
    await t.buildApp();
    extend(t, Methods);

    await t.addToEnvConfig("production", `this.config.cacheStore = ":memory_store";`);
    await t.addToEnvConfig("production", "this.config.actionDispatch.rackCache = true;");
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("cache keeps if modified since", async () => {
    await t.simpleController();
    const expected = "Wed, 30 May 1984 19:43:31 GMT";

    await t.get(
      "/expires/keepsIfModifiedSince",
      {},
      { HTTP_IF_MODIFIED_SINCE: expected, HTTPS: "on" },
    );

    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body, "cache should have kept If-Modified-Since").toBe(expected);
  });

  it("cache is disabled in dev mode", async () => {
    await t.simpleController();
    await t.app("development");

    await t.get("/expires/expiresHeader");
    expect(t.lastResponse().headers["x-rack-cache"]).toBeUndefined();

    const body = t.lastResponse().body;

    await t.get("/expires/expiresHeader");
    expect(t.lastResponse().headers["x-rack-cache"]).toBeUndefined();
    expect(t.lastResponse().body).not.toBe(body);
  });

  it("cache works with expires", async () => {
    await t.simpleController();

    await t.get("/expires/expiresHeader", {}, { HTTPS: "on" });
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss, store");
    expect(t.lastResponse().headers["cache-control"]).toBe("max-age=10, public");

    const body = t.lastResponse().body;

    await t.get("/expires/expiresHeader", {}, { HTTPS: "on" });

    expect(t.lastResponse().headers["x-rack-cache"]).toBe("fresh");

    expect(t.lastResponse().body).toBe(body);
  });

  it("cache works with expires private", async () => {
    await t.simpleController();

    await t.get("/expires/expiresHeader", { private: true }, { HTTPS: "on" });
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss");
    expect(t.lastResponse().headers["cache-control"]).toBe("private, max-age=10");

    const body = t.lastResponse().body;

    await t.get("/expires/expiresHeader", { private: true }, { HTTPS: "on" });
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss");
    expect(t.lastResponse().body).not.toBe(body);
  });

  it("cache works with etags", async () => {
    await t.simpleController();

    await t.get("/expires/expiresEtag", {}, { HTTPS: "on" });
    expect(t.lastResponse().headers["cache-control"]).toBe("public");
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss, store");

    const etag = t.lastResponse().headers["etag"];

    await t.get("/expires/expiresEtag", {}, { HTTP_IF_NONE_MATCH: etag, HTTPS: "on" });
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("stale, valid, store");
    expect(t.lastResponse().status).toBe(304);
    expect(t.lastResponse().body).toBe("");
  });

  it("cache works with etags private", async () => {
    await t.simpleController();

    await t.get("/expires/expiresEtag", { private: true }, { HTTPS: "on" });
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss");
    expect(t.lastResponse().headers["cache-control"]).toBe("must-revalidate, private, max-age=0");

    const body = t.lastResponse().body;
    const etag = t.lastResponse().headers["etag"];

    await t.get(
      "/expires/expiresEtag",
      { private: true },
      { HTTP_IF_NONE_MATCH: etag, HTTPS: "on" },
    );
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss");
    expect(t.lastResponse().body).not.toBe(body);
  });

  it("cache works with last modified", async () => {
    await t.simpleController();

    await t.get("/expires/expiresLastModified", {}, { HTTPS: "on" });
    expect(t.lastResponse().headers["cache-control"]).toBe("public");
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss, store");

    const last = t.lastResponse().headers["last-modified"];

    await t.get("/expires/expiresLastModified", {}, { HTTP_IF_MODIFIED_SINCE: last, HTTPS: "on" });
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("stale, valid, store");
    expect(t.lastResponse().status).toBe(304);
    expect(t.lastResponse().body).toBe("");
  });

  it("cache works with last modified private", async () => {
    await t.simpleController();

    await t.get("/expires/expiresLastModified", { private: true }, { HTTPS: "on" });
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss");
    expect(t.lastResponse().headers["cache-control"]).toBe("must-revalidate, private, max-age=0");

    const body = t.lastResponse().body;
    const last = t.lastResponse().headers["last-modified"];

    await t.get(
      "/expires/expiresLastModified",
      { private: true },
      { HTTP_IF_MODIFIED_SINCE: last, HTTPS: "on" },
    );
    expect(t.lastResponse().headers["x-rack-cache"]).toBe("miss");
    expect(t.lastResponse().body).not.toBe(body);
  });
});
