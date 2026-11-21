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
        import { SecureRandom } from "@blazetrails/activesupport";
        import { ApplicationController } from "./application-controller.ts";
        let lastModified: Date | undefined;
        export class ExpiresController extends ApplicationController {
          async expiresHeader() {
            this.expiresIn(10, { public: !this.params.get("private") });
            await this.render({ plain: SecureRandom.hex(16) });
          }

          async expiresEtag() {
            await this._renderConditionally({ etag: "1" });
          }

          async expiresLastModified() {
            lastModified ??= new Date();
            await this._renderConditionally({ lastModified });
          }

          async keepsIfModifiedSince() {
            await this.render({ plain: this.request.headers.get("If-Modified-Since") });
          }

          async _renderConditionally(headers: Record<string, unknown>) {
            if (await this.isStale({ ...headers, public: !this.params.get("private") })) {
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
});
