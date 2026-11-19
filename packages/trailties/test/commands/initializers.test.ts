import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface InitializersTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class InitializersTest extends TestCase {}
include(InitializersTest, Isolation);

describe("Trails::Command::InitializersTest", { timeout: 120_000 }, () => {
  let t: InitializersTest;

  beforeEach(async () => {
    t = new InitializersTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  const runInitializersCommand = (args: string[] = []) => t.trails("initializers", args);

  it("`trails initializers` prints out defined initializers invoked by Trails", async () => {
    const initialOutput = await runInitializersCommand();
    const initialOutputLength = initialOutput.split("\n").length;

    expect(initialOutputLength).toBeGreaterThan(0);
    expect(initialOutput.includes("set_added_test_module")).toBeFalsy();

    await t.addToConfig(`
      this.initializer("set_added_test_module", () => {});
`);

    const finalOutput = await runInitializersCommand();
    const finalOutputLength = finalOutput.split("\n").length;

    expect(finalOutputLength - initialOutputLength).toBe(1);
    expect(finalOutput.includes("set_added_test_module")).toBeTruthy();
  });

  // BLOCKED: generated-app-constant-is-app-const-base-application
  it.skip("prints out initializers only specified in environment option", async () => {
    await t.addToConfig(`
      if (Trails.env.isDevelopment()) this.initializer("set_added_development_module", () => {});
      if (Trails.env.isProduction()) this.initializer("set_added_production_module", () => {});
`);

    let output = (await runInitializersCommand()).split("\n");
    expect(output).toContain("AppTemplate::Application.set_added_development_module");
    expect(output).not.toContain("AppTemplate::Application.set_added_production_module");

    output = (await runInitializersCommand(["-e", "production"])).split("\n");
    expect(output).not.toContain("AppTemplate::Application.set_added_development_module");
    expect(output).toContain("AppTemplate::Application.set_added_production_module");
  });
});
