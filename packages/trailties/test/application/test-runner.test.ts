import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Process, Shellwords, env as ENV, include, setEnv } from "@blazetrails/ruby-compat";
import { camelize } from "@blazetrails/activesupport";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

type Host = Generation & TestRunnerTest;

class TestRunnerTest extends TestCase {
  runTestCommand(
    this: Host,
    arguments_ = "test/unit/test.test.ts",
    opts: { stderr?: boolean } = {},
  ): Promise<string> {
    return this.trails("t", ...Shellwords.shellwords(arguments_), { allowFailure: true, ...opts });
  }

  createSchema(this: Host): Promise<string> {
    return this.appFile("db/schema.ts", "");
  }

  createTestFile(
    this: Host,
    path = "unit",
    name = "test",
    { pass = true, print = true }: { pass?: boolean; print?: boolean } = {},
  ): Promise<string> {
    return this.appFile(
      `test/${path}/${name.replaceAll("_", "-")}.test.ts`,
      `
        import "../test-helper.ts";
        import { describe, it, expect } from "vitest";

        describe("${camelize(name)}Test", () => {
          it("truth", () => {
            ${print ? `console.log("${camelize(name)}Test");` : ""}
            expect(${pass}, "wups!").toBe(true);
          });
        });
`,
    );
  }
}
include(TestRunnerTest, Isolation);
registerSpecType(/^TestRunnerTest$/, TestRunnerTest);

function it(name: string, block: (t: Host) => Promise<void>): void {
  test(name, async () => {
    const t = new TestRunnerTest(name) as Host;
    await t.buildApp();
    await t.createSchema();
    try {
      await block(t);
    } finally {
      await t.teardownApp();
    }
  });
}

describe.concurrent("TestRunnerTest", { timeout: 600_000 }, () => {
  let trailsEnv: string | undefined;

  beforeAll(() => {
    trailsEnv = ENV["TRAILS_ENV"];
  });

  afterAll(() => {
    setEnv("TRAILS_ENV", trailsEnv);
  });

  it("run single file", async (t) => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    expect(await t.runTestCommand("test/models/foo.test.ts")).toMatch("1 runs, 0 failures");
  });
  it("run single file with absolute path", async (t) => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    expect(await t.runTestCommand(`${await t.appPath()}/test/models/foo.test.ts`)).toMatch(
      "1 runs, 0 failures",
    );
  });

  it("run multiple files", async (t) => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    expect(await t.runTestCommand("test/models/foo.test.ts test/models/bar.test.ts")).toMatch(
      "2 runs, 0 failures",
    );
  });

  it("run multiple files with absolute paths", async (t) => {
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

  it("run models", async (t) => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("models", "bar");
    await t.createTestFile("controllers", "foobar_controller");
    const output = await t.runTestCommand("test/models");
    expect(output).toMatch("FooTest");
    expect(output).toMatch("BarTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run helpers", async (t) => {
    await t.createTestFile("helpers", "foo_helper");
    await t.createTestFile("helpers", "bar_helper");
    await t.createTestFile("controllers", "foobar_controller");
    const output = await t.runTestCommand("test/helpers");
    expect(output).toMatch("FooHelperTest");
    expect(output).toMatch("BarHelperTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run controllers", async (t) => {
    await t.createTestFile("controllers", "foo_controller");
    await t.createTestFile("controllers", "bar_controller");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/controllers");
    expect(output).toMatch("FooControllerTest");
    expect(output).toMatch("BarControllerTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run mailers", async (t) => {
    await t.createTestFile("mailers", "foo_mailer");
    await t.createTestFile("mailers", "bar_mailer");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/mailers");
    expect(output).toMatch("FooMailerTest");
    expect(output).toMatch("BarMailerTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run jobs", async (t) => {
    await t.createTestFile("jobs", "foo_job");
    await t.createTestFile("jobs", "bar_job");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/jobs");
    expect(output).toMatch("FooJobTest");
    expect(output).toMatch("BarJobTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run integration", async (t) => {
    await t.createTestFile("integration", "foo_integration");
    await t.createTestFile("models", "foo");
    const output = await t.runTestCommand("test/integration");
    expect(output).toMatch("FooIntegration");
    expect(output).toMatch("1 runs, 0 failures");
  });

  it("run all suites", async (t) => {
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

  it("raise error when specified file does not exist", async (t) => {
    const error = await capture(":stderr", () =>
      t.runTestCommand("test/not-exists.test.ts", { stderr: true }),
    );
    expect(error).toMatch(/cannot load such file.+test\/not-exists\.test\.ts/);
  });

  it("unrelated load error", async (t) => {
    await t.appFile(
      "test/models/account.test.ts",
      `import "../test-helper.ts";
import "does-not-exist";
import { describe, it, expect } from "vitest";

describe("AccountsTest", () => {
  it("truth", () => {
    expect(true).toBe(true);
  });
});
`,
    );

    const output = await t.runTestCommand("test/models/account.test.ts");
    expect(output).toMatch("cannot load such file -- does-not-exist");
    expect(Process.lastStatus!.isSuccess()).toBeFalsy();
  });
});
