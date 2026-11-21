import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { FileUtils, include } from "@blazetrails/ruby-compat";
import { Application } from "../../../lib/application.js";
import { Trails } from "../../../lib/trails.js";
import type { Generation, Rack } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

class MiddlewareStaticTest extends TestCase {}
include(MiddlewareStaticTest, Isolation);
include(MiddlewareStaticTest, Methods);
registerSpecType(/^MiddlewareStaticTest$/, MiddlewareStaticTest);

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { headers: Record<string, string | undefined>; body: string };
  };

describe("MiddlewareStaticTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new MiddlewareStaticTest("test") as unknown as Host;
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("doesn't set Cache-Control header when it is nil", async () => {
    await t.appFile("public/foo.html", "static");

    await import(`${await t.appPath()}/config/environment.ts`);

    await t.get("foo");

    expect(
      Object.hasOwn(t.lastResponse().headers, "cache-control"),
      "Cache-Control should not be set",
    ).toBeFalsy();
  });

  it("headers for static files are configurable", async () => {
    await t.appFile("public/about.html", "static");
    await t.addToConfig(`
        this.config.publicFileServer.headers = {
          "Access-Control-Allow-Origin": "http://rubyonrails.org",
          "Cache-Control": "public, max-age=60",
        };
`);

    await import(`${await t.appPath()}/config/environment.ts`);

    await t.get("/about.html");

    expect(t.lastResponse().headers["access-control-allow-origin"]).toBe("http://rubyonrails.org");
    expect(t.lastResponse().headers["cache-control"]).toBe("public, max-age=60");
  });

  it("public_file_server.index_name defaults to 'index'", async () => {
    await t.appFile("public/index.html", "/index.html");

    await import(`${await t.appPath()}/config/environment.ts`);

    await t.get("/");

    expect(t.lastResponse().body).toBe("/index.html\n");
  });

  it("public_file_server.index_name configurable", async () => {
    await t.appFile("public/other-index.html", "/other-index.html");
    await t.addToConfig("this.config.publicFileServer.indexName = 'other-index';");

    await import(`${await t.appPath()}/config/environment.ts`);

    await t.get("/");

    expect(t.lastResponse().body).toBe("/other-index.html\n");
  });
});
