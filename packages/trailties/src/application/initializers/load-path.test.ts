import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { FileUtils, LOAD_PATH, getFs, TopLevel, include } from "@blazetrails/ruby-compat";
import type { Generation } from "../../test-helpers/isolation/abstract-unit.js";
import "../../test-helpers/isolation/abstract-unit.js";
import { Trails } from "../../trails.js";

const $ = globalThis as Record<string, unknown>;
const constants = TopLevel as unknown as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface LoadPathTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class LoadPathTest extends TestCase {}
include(LoadPathTest, Isolation);
registerSpecType(/^LoadPathTest$/, LoadPathTest);

describe("LoadPathTest", { timeout: 120_000 }, () => {
  let t: LoadPathTest;

  beforeEach(async () => {
    t = new LoadPathTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  it("initializing an application doesn't add the application paths to the load path", async () => {
    await t.addToConfig(`
        this.config.setRoot("${await t.appPath()}");
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    expect(LOAD_PATH).not.toContain(`${await t.appPath()}/app/models`);
  });

  it("initializing an application eager load any path under app", async () => {
    await t.appFile(
      "app/anything/foo.ts",
      `
        export const Foo = {};
`,
    );

    await t.addToConfig(`
        this.config.setRoot("${await t.appPath()}");
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    expect(constants.Foo).toBeTruthy();
  });

  it("eager loading accepts Pathnames", async () => {
    await t.appFile(
      "lib/foo.ts",
      `
        export const Foo = {};
`,
    );

    await t.addToConfig(`
        this.config.eagerLoad = true;
        this.config.eagerLoadPaths.push(new Pathname("${await t.appPath()}/lib"));
`);
    await t.appFile(
      "config/application.ts",
      `import { Pathname } from "@blazetrails/ruby-compat";\n` +
        (await getFs().readFile(`${await t.appPath()}/config/application.ts`, "utf-8")),
    );

    await import(`${await t.appPath()}/config/environment.ts`);
    expect(constants.Foo).toBeTruthy();
  });

  it("load environment with global", async () => {
    $.$initializeTestSetFromEnv = null;
    await t.appFile(
      "config/environments/development.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        globalThis.$initializeTestSetFromEnv = "success";
        Trails.application.configure(function () {
          this.config.enableReloading = false;
          this.config.timeZone = "Brasilia";
        });
`,
    );

    expect($.$initializeTestSetFromEnv).toBeNull();
    await t.addToConfig(`
        this.config.setRoot("${await t.appPath()}");
          this.config.timeZone = "UTC";
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    expect($.$initializeTestSetFromEnv).toBe("success");
    expect(Trails.application!.config.isReloadingEnabled()).toBe(false);
    expect(Trails.application!.config.timeZone).toBe("Brasilia");
  });
});
