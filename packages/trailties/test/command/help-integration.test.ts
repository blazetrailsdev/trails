import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat/include";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface HelpIntegrationTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class HelpIntegrationTest extends TestCase {}
include(HelpIntegrationTest, Isolation);

describe("Trails::Command::HelpIntegrationTest", { timeout: 120_000 }, () => {
  let t: HelpIntegrationTest;

  beforeEach(async () => {
    t = new HelpIntegrationTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("when passing --trace it invokes default", async () => {
    expect(await t.trails("--trace")).toMatch("Invoke default");
  });

  it("prints helpful error on unrecognized command", async () => {
    const output = await t.trails("vershen", { allowFailure: true });

    expect(output).toMatch(`Unrecognized command "vershen"`);
    expect(output).toMatch("Did you mean?  version");
  });

  it("loads Rake tasks only once on unrecognized command", async () => {
    await t.appFile(
      "lib/tasks/my-task.rake.ts",
      `import { TopLevel, constDefined, constSet } from "@blazetrails/ruby-compat";
console.log(\`MY_TASK already defined? => \${constDefined(TopLevel, "MY_TASK")}\`);
constSet(TopLevel, "MY_TASK", true);
`,
    );

    const output = await t.trails("vershen", { allowFailure: true });

    expect(output).toMatch("MY_TASK already defined? => false");
    expect(output).not.toMatch("MY_TASK already defined? => true");
  });

  it("prints help via `X:help` command when running `X` and `X:X` command is not defined", async () => {
    const help = await t.trails("dev:help");
    const output = await t.trails("dev", { allowFailure: true });

    expect(output).toMatch(help);
  });

  it("prints Rake tasks on --tasks / -T option", async () => {
    await t.appFile(
      "lib/tasks/my-task.rake.ts",
      `import { DSL, Rake } from "@blazetrails/rake";
Rake.application!.clear();

DSL.desc("my_task");
DSL.task("my_task");
`,
    );

    expect(await t.trails("--tasks")).toMatch("my_task");
    expect(await t.trails("-T")).toMatch("my_task");
  });
});
