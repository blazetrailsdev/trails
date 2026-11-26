import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { include } from "@blazetrails/ruby-compat/include";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class LoadingTest extends TestCase {}
include(LoadingTest, Isolation);
include(LoadingTest, Methods);
registerSpecType(/^LoadingTest$/, LoadingTest);

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { status: number; body: string };
  };

describe("LoadingTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new LoadingTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("reload constants on development", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => [200, { "Content-Type": "text/plain" }, [String((constGet(TopLevel, "User") as { counter(): number }).counter())]],
  });
});
`,
    );

    await t.appFile(
      "app/models/user.ts",
      `
export class User {
  static counter() { return 1; }
}
`,
    );

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("1");

    await t.appFile(
      "app/models/user.ts",
      `
export class User {
  static counter() { return 2; }
}
`,
    );

    await t.get("/c");
    expect(t.lastResponse().body).toBe("2");
  });

  it("added files (like db/schema.rb) also trigger reloading", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter ??= 0;
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => {
      constGet(TopLevel, "User");
      return [200, { "Content-Type": "text/plain" }, [String(globals.counter)]];
    },
  });
});
`,
    );

    await t.appFile(
      "app/models/user.ts",
      `
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter = (globals.counter ?? 0) + 1;
export class User {}
`,
    );

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("1");

    await t.appFile("db/schema.ts", "");

    await t.get("/c");
    expect(t.lastResponse().body).toBe("2");
  });
});
