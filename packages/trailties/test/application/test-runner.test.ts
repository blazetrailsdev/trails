import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Shellwords, include } from "@blazetrails/ruby-compat";
import { camelize } from "@blazetrails/activesupport";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface TestRunnerTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class TestRunnerTest extends TestCase {
  runTestCommand(
    arguments_ = "test/unit/test.test.ts",
    opts: { stderr?: boolean } = {},
  ): Promise<string> {
    return this.trails("t", ...Shellwords.shellwords(arguments_), { allowFailure: true, ...opts });
  }

  createSchema(): Promise<string> {
    return this.appFile("db/schema.ts", "");
  }

  createTestFile(
    path = "unit",
    name = "test",
    { pass = true, print = true }: { pass?: boolean; print?: boolean } = {},
  ): Promise<string> {
    return this.appFile(
      `test/${path}/${name.replaceAll("_", "-")}.test.ts`,
      `
        import "../test-helper.ts";
        import { TestCase } from "@blazetrails/activesupport/test-case";
        import { describe, it, expect } from "vitest";

        describe("${camelize(name)}Test", () => {
          it("truth", () => {
            ${print ? `console.log("${camelize(name)}Test");` : ""}
            expect(${pass}).toBe(true);
          });
        });
`,
    );
  }
}
include(TestRunnerTest, Isolation);
registerSpecType(/^TestRunnerTest$/, TestRunnerTest);

describe("TestRunnerTest", { timeout: 300_000 }, () => {
  let t: TestRunnerTest;

  beforeEach(async () => {
    t = new TestRunnerTest("test");
    await t.buildApp();
    await t.createSchema();
  });

  afterEach(() => t.teardownApp());

  it("run single file", async () => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    expect(await t.runTestCommand("test/models/foo.test.ts")).toMatch("1 runs, 0 failures");
  });
  it("run single file with absolute path", async () => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    expect(await t.runTestCommand(`${await t.appPath()}/test/models/foo.test.ts`)).toMatch(
      "1 runs, 0 failures",
    );
  });

  it("run multiple files", async () => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    expect(await t.runTestCommand("test/models/foo.test.ts test/models/bar.test.ts")).toMatch(
      "2 runs, 0 failures",
    );
  });

  it("run multiple files with absolute paths", async () => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("controllers", "foobar_controller");
    await t.createTestFile("models", "bar");

    const appPath = await t.appPath();
    expect(
      await t.runTestCommand(
        `${appPath}/test/models/foo.test.ts ${appPath}/test/controllers/foobar-controller.test.ts`,
      ),
    ).toMatch("2 runs, 0 failures");
  });

  it("run models", async () => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    await t.createTestFile("controllers", "foobar_controller");
    const output = await t.runTestCommand("test/models");
    expect(output).toMatch("FooTest");
    expect(output).toMatch("BarTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run helpers", async () => {
    await t.createTestFile("helpers", "foo_helper");
    await t.createTestFile("helpers", "bar_helper");
    await t.createTestFile("controllers", "foobar_controller");
    const output = await t.runTestCommand("test/helpers");
    expect(output).toMatch("FooHelperTest");
    expect(output).toMatch("BarHelperTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run controllers", async () => {
    await t.createTestFile("controllers", "foo_controller");
    await t.createTestFile("controllers", "bar_controller");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/controllers");
    expect(output).toMatch("FooControllerTest");
    expect(output).toMatch("BarControllerTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run mailers", async () => {
    await t.createTestFile("mailers", "foo_mailer");
    await t.createTestFile("mailers", "bar_mailer");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/mailers");
    expect(output).toMatch("FooMailerTest");
    expect(output).toMatch("BarMailerTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run jobs", async () => {
    await t.createTestFile("jobs", "foo_job");
    await t.createTestFile("jobs", "bar_job");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/jobs");
    expect(output).toMatch("FooJobTest");
    expect(output).toMatch("BarJobTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run integration", async () => {
    await t.createTestFile("integration", "foo_integration");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/integration");
    expect(output).toMatch("FooIntegration");
    expect(output).toMatch("1 runs, 0 failures");
  });

  it("run all suites", async () => {
    const suites = [
      "models",
      "helpers",
      "unit",
      "channels",
      "controllers",
      "mailers",
      "functional",
      "integration",
      "jobs",
      "mailboxes",
    ];
    for (const suite of suites) await t.createTestFile(suite, `foo_${suite}`);
    const output = await t.runTestCommand("");
    for (const suite of suites) expect(output).toMatch(`Foo${camelize(suite)}Test`);
    expect(output).toMatch("10 runs, 0 failures");
  });
});
