import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { FileUtils, LOAD_PATH, getFs, TopLevel, include } from "@blazetrails/ruby-compat";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";
import { Trails } from "../../../lib/trails.js";

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

  // BLOCKED: trailties-load-path-require-in-application-class-body
  it.skip("initializing an application allows to load code on lib path inside application class definition", async () => {
    await t.appFile(
      "lib/foo.ts",
      `
        export const Foo = {};
`,
    );

    await t.addToConfig(`
        await rbFRequire("foo");
        if (!("Foo" in TopLevel)) throw new Error("Expected Foo to be defined");
`);

    await expect(import(`${await t.appPath()}/config/environment.ts`)).resolves.toBeDefined();

    expect(LOAD_PATH).toContain(`${await t.appPath()}/lib`);
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

  // BLOCKED: zeitwerk-namespace-body-autoloads-own-children
  it.skip("eager loading loads parent classes before children", async () => {
    await t.appFile(
      "lib/zoo.ts",
      `
        import { include } from "@blazetrails/ruby-compat";
        export class Zoo {
          static { include(this, (Zoo as unknown as { ReptileHouse: object }).ReptileHouse); }
        }
`,
    );

    await t.appFile(
      "lib/zoo/reptile-house.ts",
      `
        export const ReptileHouse = {};
`,
    );

    await t.addToConfig(`
        this.config.setRoot("${await t.appPath()}");
        this.config.eagerLoadPaths.push("${await t.appPath()}/lib");
`);

    await import(`${await t.appPath()}/config/environment.ts`);
    expect(constants.Zoo).toBeTruthy();
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
    expect(Trails.application!.config.isReloadingEnabled()).toBeFalsy();
    expect(Trails.application!.config.timeZone).toBe("Brasilia");
  });
});
