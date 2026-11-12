import { afterEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { getFs, env as ENV } from "@blazetrails/ruby-compat";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface GenerationTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class GenerationTest extends TestCase {}

describe("TestHelpers::Generation#build_app", () => {
  let t: GenerationTest;

  afterEach(() => t.teardownApp());

  it("strips the ESLint autocorrect line and keeps the app's config writable", async () => {
    t = new GenerationTest("test");
    await t.buildApp();
    const appPath = await t.appPath();

    const development = await getFs().readFile(
      `${appPath}/config/environments/development.ts`,
      "utf-8",
    );
    expect(development).not.toContain("applyEslintAutocorrectAfterGenerateBang");
    expect(development).toContain("annotateRenderedViewWithFilenames = false;");
    expect(await getFs().readFile(`${appPath}/config/routes.ts`, "utf-8")).toContain(
      `ActionDispatch.deprecator().silence(() => this.match(":controller(/:action(/:id))(.:format)", { via: ":all" }));`,
    );
    expect(await getFs().readdir!(`${appPath}/config/initializers`)).toEqual([]);
  });

  it("boots the copied app in the test's own process", async () => {
    t = new GenerationTest("test");
    await t.buildApp();

    await t.bootTrails();

    expect(Trails.application).not.toBeNull();
    expect(Application.appClass).not.toBeNull();
    expect(String(Trails.application!.config.root)).toBe(await t.appPath());
  }, 60_000);
});

describe("TestCase#with_env", () => {
  it("sets the variables for the block and deletes them after", async () => {
    const t = new GenerationTest("test");
    const seen = await t.withEnv({ WITH_ENV_PROBE: "1" }, () => ENV["WITH_ENV_PROBE"]);

    expect(seen).toBe("1");
    expect("WITH_ENV_PROBE" in ENV).toBe(false);
  });
});

describe("TestHelpers::Generation#add_to_config", () => {
  let t: GenerationTest;

  afterEach(() => t.teardownApp());

  it("keeps inserting into the class body and after it across repeated calls", async () => {
    t = new GenerationTest("test");
    await t.buildApp();
    const configFile = `${await t.appPath()}/config/application.ts`;

    await t.addToConfig(`await Promise.resolve("first");`);
    await t.addToConfig(`this.config.first = "first";`);
    await t.addToConfig(`await Promise.resolve("second");`);
    await t.addToConfig(`this.config.second = "second";`);

    const config = await getFs().readFile(configFile, "utf-8");
    const classEnd = config.search(/\n\}\n/);
    const declaration = config.search(/\ndeclare module /);

    for (const line of ['this.config.first = "first";', 'this.config.second = "second";']) {
      expect(config.indexOf(line)).toBeGreaterThan(-1);
      expect(config.indexOf(line)).toBeLessThan(classEnd);
    }
    const first = config.indexOf('await Promise.resolve("first");');
    const second = config.indexOf('await Promise.resolve("second");');
    expect(first).toBeGreaterThan(classEnd);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(declaration);
  }, 120_000);
});
