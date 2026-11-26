import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Builder } from "@blazetrails/rack";
import { File } from "@blazetrails/ruby-compat/file";
import { include } from "@blazetrails/ruby-compat/include";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class RackupTest extends TestCase {
  async rackup(this: RackupTest & Host): Promise<Rack["_app"]> {
    const app = await Builder.parseFile(`${await this.appPath()}/config.ts`);
    return app;
  }
}
include(RackupTest, Isolation);
registerSpecType(/^RackupTest$/, RackupTest);

type Host = Generation & Rack & RackupTest;

describe("RackupTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new RackupTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("Trails app is present", async () => {
    expect(await File.isExistAsync(await t.appPath("config"))).toBeTruthy();
  });

  it("config.ru can be racked up", async () => {
    t._app = await t.rackup();
    await t.assertWelcome(await t.get("/"));
  });

  it("Trails.application is available after config.ru has been racked up", async () => {
    await t.rackup();
    expect(Trails.application).toBeInstanceOf(Application);
  });

  it("the config object is available on the application object", async () => {
    await t.rackup();
    expect(Trails.application!.config.timeZone).toBe("UTC");
  });
});
