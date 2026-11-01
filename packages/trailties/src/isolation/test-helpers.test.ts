import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { getFs, include } from "@blazetrails/ruby-compat";
import { Generation, Paths } from "../test-helpers/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface GenerationTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class GenerationTest extends TestCase {}
include(GenerationTest, Paths);
include(GenerationTest, Generation);

describe("TestHelpersTests::GenerationTest", () => {
  const fs = getFs();
  let t: GenerationTest;

  beforeEach(() => {
    t = new GenerationTest("test");
  });

  afterEach(() => t.teardownApp());

  it("build app", async () => {
    await t.buildApp();

    const appPath = await t.appPath();
    expect(await fs.exists(`${appPath}/config/database.ts`)).toBe(true);
    expect(await fs.exists(`${appPath}/config/routes.ts`)).toBe(true);
    expect(await fs.exists(`${appPath}/config/initializers`)).toBe(true);
  });

  it("teardown app", async () => {
    await t.buildApp();
    await t.teardownApp();

    expect(await fs.exists(await t.appPath())).toBe(false);
  });

  it("add to config", async () => {
    await t.buildApp();

    const configFile = `${await t.appPath()}/config/application.ts`;

    expect(await fs.readFile(configFile, "utf-8")).not.toHaveLength(0);

    await t.addToConfig(`
        this.config.zomg = "zomg";
`);

    const config = await fs.readFile(configFile, "utf-8");

    expect(config).toMatch(/ {7}this\.config\.zomg = "zomg";$/m);
  });

  it("remove from config", async () => {
    await t.buildApp();

    const configFile = `${await t.appPath()}/config/application.ts`;

    expect(await fs.readFile(configFile, "utf-8")).not.toHaveLength(0);

    await t.addToConfig(`
        this.config.zomg = "zomg";
`);

    await t.removeFromConfig(`this.config.zomg = "zomg";`);

    let config = await fs.readFile(configFile, "utf-8");

    expect(config).not.toMatch(/this\.config\.zomg = "zomg";$/m);

    await t.addToConfig(`
        this.config.duplicates = "none";
        this.config.duplicates = "none";
`);

    await t.removeFromConfig(`this.config.duplicates = "none";`);

    config = await fs.readFile(configFile, "utf-8");

    expect(config).not.toMatch(/this\.config\.duplicates = "none";$/m);
  });
});
