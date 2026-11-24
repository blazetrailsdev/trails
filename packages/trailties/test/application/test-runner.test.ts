import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Process, Shellwords, env as ENV, include, setEnv } from "@blazetrails/ruby-compat";
import { camelize } from "@blazetrails/activesupport";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { EnvHelpers } from "../support/env-helpers.js";

type Host = Generation & EnvHelpers & TestRunnerTest;

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
        import "${"../".repeat(path.split("/").length)}test-helper.ts";
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
include(TestRunnerTest, EnvHelpers);
registerSpecType(/^TestRunnerTest$/, TestRunnerTest);

const chu2Koi = `import "../test-helper.ts";
import { describe, it } from "vitest";

describe("Chu2KoiTest", () => {
  it("test_rikka", () => {
    console.log("Rikka");
  });

  it("test_sanae", () => {
    console.log("Sanae");
  });
});
`;

function createEnvTest(t: Host): Promise<string> {
  return t.appFile(
    "test/unit/env.test.ts",
    `import "../test-helper.ts";
import { describe, it } from "vitest";
import { Trails } from "@blazetrails/trailties";

describe("EnvTest", () => {
  it("test_env", () => {
    console.log(\`Current Environment: \${Trails.env}\`);
  });
});
`,
  );
}

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

  it("run units", async (t) => {
    await t.createTestFile("models", "foo");
    await t.createTestFile("helpers", "bar_helper");
    await t.createTestFile("unit", "baz_unit");
    await t.createTestFile("controllers", "foobar_controller");

    const output = await t.trails("test:units", { allowFailure: true });
    expect(output).toMatch("FooTest");
    expect(output).toMatch("BarHelperTest");
    expect(output).toMatch("BazUnitTest");
    expect(output).toMatch("3 runs, 0 failures");
  });

  it("run all takes options", async (t) => {
    await t.createTestFile("system", "foo");
    expect(await t.trails("test:all", "--verbose", { allowFailure: true })).toMatch("FooTest");
  });

  it("run system takes options", async (t) => {
    await t.createTestFile("system", "foo");
    expect(await t.trails("test:system", "--verbose", { allowFailure: true })).toMatch("FooTest");
  });

  it("run generators takes options", async (t) => {
    await t.createTestFile("lib/generators", "foo");
    expect(await t.trails("test:generators", "--verbose", { allowFailure: true })).toMatch(
      "FooTest",
    );
  });

  it("run channels", async (t) => {
    await t.createTestFile("channels", "foo_channel");
    await t.createTestFile("channels", "bar_channel");

    const output = await t.trails("test:channels", { allowFailure: true });
    expect(output).toMatch("FooChannelTest");
    expect(output).toMatch("BarChannelTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run mailboxes", async (t) => {
    await t.createTestFile("mailboxes", "foo_mailbox");
    await t.createTestFile("mailboxes", "bar_mailbox");
    await t.createTestFile("models", "foo");

    const output = await t.trails("test:mailboxes", { allowFailure: true });
    expect(output).toMatch("FooMailboxTest");
    expect(output).toMatch("BarMailboxTest");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("run functionals", async (t) => {
    await t.createTestFile("mailers", "foo_mailer");
    await t.createTestFile("controllers", "bar_controller");
    await t.createTestFile("functional", "baz_functional");
    await t.createTestFile("models", "foo");

    const output = await t.trails("test:functionals", { allowFailure: true });
    expect(output).toMatch("FooMailerTest");
    expect(output).toMatch("BarControllerTest");
    expect(output).toMatch("BazFunctionalTest");
    expect(output).toMatch("3 runs, 0 failures");
  });

  it("run named test", async (t) => {
    await t.appFile("test/unit/chu-2-koi.test.ts", chu2Koi);

    const output = await t.runTestCommand("-n test_rikka test/unit/chu-2-koi.test.ts");
    expect(output).toMatch("Rikka");
    expect(output).not.toMatch("Sanae");
  });

  it("run matched test", async (t) => {
    await t.appFile("test/unit/chu-2-koi.test.ts", chu2Koi);

    const output = await t.runTestCommand("-n /rikka/ test/unit/chu-2-koi.test.ts");
    expect(output).toMatch("Rikka");
    expect(output).not.toMatch("Sanae");
  });

  it("run in test environment by default", async (t) => {
    await createEnvTest(t);

    expect(await t.runTestCommand("test/unit/env.test.ts")).toMatch("Current Environment: test");
  });

  it("run different environment", async (t) => {
    await createEnvTest(t);

    expect(await t.runTestCommand("-e development test/unit/env.test.ts")).toMatch(
      "Current Environment: development",
    );
  });

  it("run multiple folders", async (t) => {
    await t.createTestFile("models", "account");
    await t.createTestFile("controllers", "accounts_controller");

    const output = await t.runTestCommand("test/models test/controllers");
    expect(output).toMatch("AccountTest");
    expect(output).toMatch("AccountsControllerTest");
    expect(output).toMatch("2 runs, 0 failures, 0 errors, 0 skips");
  });

  it("run multiple folders with absolute paths", async (t) => {
    await t.createTestFile("models", "account");
    await t.createTestFile("controllers", "accounts_controller");
    await t.createTestFile("helpers", "foo_helper");

    const appPath = await t.appPath();
    const output = await t.runTestCommand(`${appPath}/test/models ${appPath}/test/controllers`);
    expect(output).toMatch("AccountTest");
    expect(output).toMatch("AccountsControllerTest");
    expect(output).toMatch("2 runs, 0 failures, 0 errors, 0 skips");
  });

  it("run relative path with trailing slash", async (t) => {
    await t.createTestFile("models", "account");
    await t.createTestFile("controllers", "accounts_controller");

    const output = await t.runTestCommand("test/models/");
    expect(output).toMatch("AccountTest");
    expect(output).toMatch("1 runs, 0 failures, 0 errors, 0 skips");
  });

  it("run relative path with leading dot slash", async (t) => {
    await t.createTestFile("models", "account");
    await t.createTestFile("models", "post");

    const output = await t.runTestCommand("./test/models/account.test.ts");
    expect(output).toMatch("AccountTest");
    expect(output).toMatch("1 runs, 0 failures, 0 errors, 0 skips");
  });

  it("run windows style path", async (t) => {
    await t.createTestFile("models", "account");
    await t.createTestFile("controllers", "accounts_controller");

    const output = await t.runTestCommand("test\\\\models");
    expect(output).toMatch("AccountTest");
    expect(output).toMatch("1 runs, 0 failures, 0 errors, 0 skips");
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

  it("system tests are not run with the default test command", async (t) => {
    await t.appFile(
      "test/system/dummy.test.ts",
      `
        import "../application-system-test-case.ts";
        import { describe, it, expect } from "vitest";

        describe("DummyTest", () => {
          it("something", () => {
            expect(true).toBe(true);
          });
        });
`,
    );

    const output = await t.runTestCommand("");
    expect(output).toMatch("0 runs, 0 failures, 0 errors, 0 skips");
  });

  it("run does not load file from the fixture folder", async (t) => {
    await t.createTestFile("fixtures", "smoke_foo");

    expect(await t.runTestCommand("")).toMatch("0 runs, 0 failures, 0 errors, 0 skips");
  });

  it("can exclude files from being tested via default trails command by setting DEFAULT_TEST_EXCLUDE env var", async (t) => {
    await t.createTestFile("smoke", "smoke_foo");

    await t.switchEnv("DEFAULT_TEST_EXCLUDE", "test/smoke/**/*.test.ts", async () => {
      expect(await t.runTestCommand("")).toMatch("0 runs, 0 failures, 0 errors, 0 skips");
    });
  });
});
