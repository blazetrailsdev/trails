import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { FileUtils, getFs, include } from "@blazetrails/ruby-compat";
import type { Generation } from "../../test-helpers/isolation/abstract-unit.js";
import "../../test-helpers/isolation/abstract-unit.js";
import { Trails } from "../../trails.js";

const $ = globalThis as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface HooksTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class HooksTest extends TestCase {}
include(HooksTest, Isolation);
registerSpecType(/^HooksTest$/, HooksTest);

describe("HooksTest", { timeout: 120_000 }, () => {
  let t: HooksTest;

  beforeEach(async () => {
    t = new HooksTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  it("load initializers", async () => {
    await t.appFile("config/initializers/foo.ts", "globalThis.$foo = true;");
    await import(`${await t.appPath()}/config/environment.ts`);
    expect($.$foo).toBeTruthy();
  });

  it("hooks block works correctly without eager_load (before_eager_load is not called)", async () => {
    await t.addToConfig(`
        globalThis.$initializationCallbacks = [];
        this.config.setRoot("${await t.appPath()}");
        this.config.eagerLoad = false;
        this.config.beforeConfiguration(() => globalThis.$initializationCallbacks.push(1));
        this.config.beforeInitialize(() => globalThis.$initializationCallbacks.push(2));
        this.config.beforeEagerLoad(() => Boom);
        this.config.afterInitialize(() => globalThis.$initializationCallbacks.push(3));
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    expect($.$initializationCallbacks).toEqual([1, 2, 3]);
  });

  it("hooks block works correctly with eager_load", async () => {
    await t.addToConfig(`
        globalThis.$initializationCallbacks = [];
        this.config.setRoot("${await t.appPath()}");
        this.config.eagerLoad = true;
        this.config.beforeConfiguration(() => globalThis.$initializationCallbacks.push(1));
        this.config.beforeInitialize(() => globalThis.$initializationCallbacks.push(2));
        this.config.beforeEagerLoad(() => globalThis.$initializationCallbacks.push(3));
        this.config.afterInitialize(() => globalThis.$initializationCallbacks.push(4));
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    expect($.$initializationCallbacks).toEqual([1, 2, 3, 4]);
  });

  it("after_initialize runs after frameworks have been initialized", async () => {
    $.$activerecordConfiguration = null;
    await t.addToConfig(`
        this.config.afterInitialize(() => { globalThis.$activerecordConfiguration = ActiveRecord.Base.configurations().configsFor({ envName: "development", name: "primary" }); });
`);
    await t.appFile(
      "config/application.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";\n` +
        (await getFs().readFile(`${await t.appPath()}/config/application.ts`, "utf-8")),
    );

    await import(`${await t.appPath()}/config/environment.ts`);
    expect($.$activerecordConfiguration).toBeTruthy();
  });

  it("after_initialize happens after to_prepare in development", async () => {
    $.$order = [];
    await t.addToConfig(`
        this.config.enableReloading = true;
        this.config.afterInitialize(() => globalThis.$order.push("after_initialize"));
        this.config.toPrepare(() => globalThis.$order.push("to_prepare"));
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    expect($.$order).toEqual(["to_prepare", "after_initialize"]);
  });

  // BLOCKED: secret-key-base-credentials-arm
  it.skip("after_initialize happens after to_prepare in production", async () => {
    $.$order = [];
    await t.addToConfig(`
        this.config.enableReloading = false;
        this.config.afterInitialize(() => globalThis.$order.push("after_initialize"));
        this.config.toPrepare(() => globalThis.$order.push("to_prepare"));
`);

    await import(`${await t.appPath()}/config/application.ts`);
    Trails.env = "production";
    await import(`${await t.appPath()}/config/environment.ts`);
    expect($.$order).toEqual(["to_prepare", "after_initialize"]);
  });
});
