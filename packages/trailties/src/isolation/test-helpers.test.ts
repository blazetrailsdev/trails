import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { getFs, include } from "@blazetrails/ruby-compat";
import { Generation, Paths } from "../test-helpers/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface GenerationTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class GenerationTest extends TestCase {}
include(GenerationTest, Paths);
include(GenerationTest, Generation);
include(GenerationTest, Isolation);
registerSpecType(/^GenerationTest$/, GenerationTest);

describe("GenerationTest", () => {
  const fs = getFs();
  let t: GenerationTest;

  beforeEach(() => {
    t = new GenerationTest("test");
  });

  afterEach(() => t.teardownApp());

  it("build app", { timeout: 120_000 }, async () => {
    await t.buildApp();

    const appPath = await t.appPath();
    expect(await fs.exists(`${appPath}/config/database.ts`)).toBeTruthy();
    expect(await fs.exists(`${appPath}/config/routes.ts`)).toBeTruthy();
    expect(await fs.exists(`${appPath}/config/initializers`)).toBeTruthy();
  });

  it("teardown app", { timeout: 120_000 }, async () => {
    await t.buildApp();
    await t.teardownApp();

    expect(await fs.exists(await t.appPath())).toBeFalsy();
  });

  it("add to config", { timeout: 120_000 }, async () => {
    await t.buildApp();

    const configFile = `${await t.appPath()}/config/application.ts`;

    expect(await fs.readFile(configFile, "utf-8")).not.toBeEmpty();

    await t.addToConfig(`
        this.config.zomg = "zomg";
`);

    const config = await fs.readFile(configFile, "utf-8");

    expect(
      config,
      `Expected \`${configFile}\` to include \`this.config.zomg = "zomg";\`, but did not:\n ${config}`,
    ).toMatch(/ {7}this\.config\.zomg = "zomg";$/m);
  });

  it("remove from config", { timeout: 120_000 }, async () => {
    await t.buildApp();

    const configFile = `${await t.appPath()}/config/application.ts`;

    expect(await fs.readFile(configFile, "utf-8")).not.toBeEmpty();

    await t.addToConfig(`
        this.config.zomg = "zomg";
`);

    await t.removeFromConfig(`this.config.zomg = "zomg";`);

    let config = await fs.readFile(configFile, "utf-8");

    expect(
      config,
      `Expected \`${configFile}\` to include \`this.config.zomg = "zomg";\`, but did not:\n ${config}`,
    ).not.toMatch(/this\.config\.zomg = "zomg";$/m);

    await t.addToConfig(`
        this.config.duplicates = "none";
        this.config.duplicates = "none";
`);

    await t.removeFromConfig(`this.config.duplicates = "none";`);

    config = await fs.readFile(configFile, "utf-8");

    expect(
      config,
      `Expected \`${configFile}\` to include \`this.config.duplicates = "none";\`, but did not:\n ${config}`,
    ).not.toMatch(/this\.config\.duplicates = "none";$/m);
  });
});
