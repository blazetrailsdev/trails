import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { CookieJar } from "@blazetrails/actionpack";
import { Methods } from "@blazetrails/rack-test";
import { File, FileUtils, include } from "@blazetrails/ruby-compat";
import { Application } from "../../../lib/application.js";
import { Trails } from "../../../lib/trails.js";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface CookiesTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class CookiesTest extends TestCase {
  async newApp(): Promise<string> {
    return File.expandPath(`${await this.appPath()}/../new_app`);
  }

  app() {
    return Trails.application;
  }
}
include(CookiesTest, Isolation);
include(CookiesTest, Methods);
registerSpecType(/^CookiesTest$/, CookiesTest);

describe("CookiesTest", { timeout: 120_000 }, () => {
  let t: CookiesTest;
  let originalEnv: string;

  beforeEach(async () => {
    originalEnv = String(Trails.env);
    t = new CookiesTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(async () => {
    await t.teardownApp();
    if (await File.isDirectoryAsync(await t.newApp())) await FileUtils.rmRfAsync(await t.newApp());
    Trails.env = originalEnv;
    Trails.application = null;
    Application.appClass = null;
  });

  it("always_write_cookie is true by default in development", async () => {
    Trails.env = "development";
    await import(`${await t.appPath()}/config/environment.ts`);
    expect(CookieJar.alwaysWriteCookie).toBe(true);
  });

  it("always_write_cookie is false by default in production", async () => {
    Trails.env = "production";
    await import(`${await t.appPath()}/config/environment.ts`);
    expect(CookieJar.alwaysWriteCookie).toBe(false);
  });

  it("always_write_cookie can be overridden", async () => {
    await t.addToConfig(`
        this.config.actionDispatch.alwaysWriteCookie = false;
`);

    Trails.env = "development";
    await import(`${await t.appPath()}/config/environment.ts`);
    expect(CookieJar.alwaysWriteCookie).toBe(false);
  });
});
