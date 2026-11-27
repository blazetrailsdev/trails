import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { include } from "@blazetrails/ruby-compat/include";
import { Process } from "@blazetrails/ruby-compat/process";
import { env as ENV, setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { Shellwords } from "@blazetrails/ruby-compat/shellwords";
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
      `import "${"../".repeat(path.split("/").length)}test-helper.ts"; import { describe, it, expect } from "vitest";

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

const lineFilterFiles = {
  mix: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("test_post", () => {
    console.log("PostTest");
    expect(true).toBe(true);
  });

  it("test_line_filter_does_not_run_this", () => {
    expect(true).toBe(true);
  });
});
`,
  macro: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("first filter", () => {
    console.log("PostTest:FirstFilter");
    expect(true).toBe(true);
  });

  it("line filter does not run this", () => {
    expect(true).toBe(true);
  });

  it("second filter", () => {
    console.log("PostTest:SecondFilter");
    expect(true).toBe(true);
  });
});
`,
  range: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("first", () => {
    console.log("PostTest:FirstFilter");
    expect(true).toBe(true);
  });

  it("second", () => {
    console.log("PostTest:Second");
    expect(true).toBe(true);
  });

  it("third", () => {
    console.log("PostTest:Third");
    expect(true).toBe(true);
  });

  it("fourth", () => {
    console.log("PostTest:Fourth");
    expect(true).toBe(true);
  });
});
`,
  method: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("test_first_filter", () => {
    console.log("PostTest:FirstFilter");
    expect(true).toBe(true);
  });

  it("test_second_filter", () => {
    console.log("PostTest:SecondFilter");
    expect(true).toBe(true);
  });

  it("test_line_filter_does_not_run_this", () => {
    expect(true).toBe(true);
  });
});
`,
  account: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("AccountTest", () => {
  it("first filter", () => {
    console.log("AccountTest:FirstFilter");
    expect(true).toBe(true);
  });

  it("second filter", () => {
    console.log("AccountTest:SecondFilter");
    expect(true).toBe(true);
  });

  it("line filter does not run this", () => {
    expect(true).toBe(true);
  });
});
`,
  post: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("first filter", () => {
    console.log("PostTest:FirstFilter");
    expect(true).toBe(true);
  });

  it("second filter", () => {
    console.log("PostTest:SecondFilter");
    expect(true).toBe(true);
  });

  it("line filter does not run this", () => {
    expect(true).toBe(true);
  });
});
`,
  minitest: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("test_by_line", () => {
    console.log("by line");
    expect(true).toBe(true);
  });

  it("test_by_name", () => {
    console.log("by name");
    expect(true).toBe(true);
  });
});
`,
  same: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("AccountTest", () => {
  it("first", () => { console.log("first"); }); it("test_second", () => { console.log("second"); });
  it("third", () => {
    console.log("third");
    expect(false).toBe(true);
  });
});
`,
  runnable: `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("truth", () => {
    expect(true).toBe(true);
  });
});

describe("SecondPostTest", () => {
  it("truth", () => {
    expect(false, "ran second runnable").toBe(true);
  });
});
`,
};

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

it.skip = (name: string, _block: (t: Host) => Promise<void>): void => {
  test.skip(name, () => {});
};

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

  // BLOCKED: trailties-tests-broken-while-shards-ran-zero
  it.skip("declarative style string filter", async (t) => {
    await t.appFile(
      "test/models/post.test.ts",
      `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("foo", () => {
    console.log("hello foo");
    expect(true).toBe(true);
  });

  it("foo +  + again", () => {
    console.log("hello again");
    expect(true).toBe(true);
  });

  it("foo no more", () => {
    expect(false).toBe(true);
  });
});
`,
    );

    let output = await t.runTestCommand("test/models/post.test.ts -n 'foo'");
    expect(output).toMatch("hello foo");
    expect(output).toMatch("1 runs, 0 failures");

    output = await t.runTestCommand("test/models/post.test.ts -n 'foo +  + again'");
    expect(output).toMatch("hello again");
    expect(output).toMatch("1 runs, 0 failures");
  });

  it("declarative style regexp filter", async (t) => {
    await t.appFile(
      "test/models/post.test.ts",
      `import "../test-helper.ts"; import { describe, it, expect } from "vitest";

describe("PostTest", () => {
  it("greets foo", () => {
    console.log("hello foo");
    expect(true).toBe(true);
  });

  it("greets foo again", () => {
    console.log("hello again foo");
    expect(true).toBe(true);
  });

  it("greets +  + bar", () => {
    console.log("hello bar");
    expect(true).toBe(true);
  });

  it("greets no one", () => {
    expect(false).toBe(true);
  });
});
`,
    );

    const output = await t.runTestCommand(
      "test/models/post.test.ts -n '/greets foo|greets .  .\\ bar/'",
    );
    expect(output).toMatch("hello foo");
    expect(output).toMatch("hello again foo");
    expect(output).toMatch("hello bar");
    expect(output).toMatch("3 runs, 0 failures");
  });

  it("only inline failure output", async (t) => {
    await t.createTestFile("models", "post", { pass: false });

    const output = await t.runTestCommand("test/models/post.test.ts");
    expect(output).toMatch(/Finished in.*1 runs/s);
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

  // BLOCKED: trailties-tests-broken-while-shards-ran-zero
  it.skip("run multiple folders with absolute paths", async (t) => {
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

  it("mix files and line filters", async (t) => {
    await t.createTestFile("models", "account");
    await t.appFile("test/models/post.test.ts", lineFilterFiles.mix);

    const output = await t.runTestCommand("test/models/account.test.ts test/models/post.test.ts:4");
    expect(output).toMatch("AccountTest");
    expect(output).toMatch("PostTest");
    expect(output).toMatch("2 runs");
  });

  it("more than one line filter macro syntax", async (t) => {
    await t.appFile("test/models/post.test.ts", lineFilterFiles.macro);

    const posCases = {
      "first line of each test": "test/models/post.test.ts:4:13",
      "interior of tests": "test/models/post.test.ts:5:14",
      "last line of each test": "test/models/post.test.ts:7:16",
    };

    for (const [name, cmd] of Object.entries(posCases)) {
      const output = await t.runTestCommand(cmd);
      expect(output, `for ${cmd} (${name})`).toMatch("PostTest:FirstFilter");
      expect(output, `for ${cmd} (${name})`).toMatch("PostTest:SecondFilter");
      expect(output, `for ${cmd} (${name})`).toMatch("2 runs");
    }

    expect(await t.runTestCommand("test/models/post.test.ts:8:17")).toMatch("0 runs");
  });

  it("line range filter syntax", async (t) => {
    await t.appFile("test/models/post.test.ts", lineFilterFiles.range);

    let output = await t.runTestCommand("test/models/post.test.ts:4-14");
    expect(output).toMatch("PostTest:First");
    expect(output).toMatch("PostTest:Second");
    expect(output).toMatch("PostTest:Third");
    expect(output).toMatch("3 runs");

    output = await t.runTestCommand("test/models/post.test.ts:4-9:19");
    expect(output).toMatch("PostTest:First");
    expect(output).toMatch("PostTest:Second");
    expect(output).toMatch("PostTest:Fourth");
    expect(output).toMatch("3 runs");

    output = await t.runTestCommand("test/models/post.test.ts:4-9:14-19");
    expect(output).toMatch("PostTest:First");
    expect(output).toMatch("PostTest:Second");
    expect(output).toMatch("PostTest:Third");
    expect(output).toMatch("PostTest:Fourth");
    expect(output).toMatch("4 runs");
  });

  it("more than one line filter test method syntax", async (t) => {
    await t.appFile("test/models/post.test.ts", lineFilterFiles.method);

    const posCases = {
      "first line of each test": "test/models/post.test.ts:4:9",
      "interior of tests": "test/models/post.test.ts:5:10",
      "last line of each test": "test/models/post.test.ts:7:12",
    };

    for (const [name, cmd] of Object.entries(posCases)) {
      const output = await t.runTestCommand(cmd);
      expect(output, `for ${cmd} (${name})`).toMatch("PostTest:FirstFilter");
      expect(output, `for ${cmd} (${name})`).toMatch("PostTest:SecondFilter");
      expect(output, `for ${cmd} (${name})`).toMatch("2 runs");
    }

    expect(await t.runTestCommand("test/models/post.test.ts:8:13")).toMatch("0 runs");
  });

  it("multiple tests on same line", async (t) => {
    await t.appFile("test/models/account.test.ts", lineFilterFiles.same);

    const output = await t.runTestCommand("test/models/account.test.ts:4");
    expect(output).toMatch("first");
    expect(output).toMatch("second");
    expect(output).not.toMatch("third");
    expect(output).toMatch("2 runs, 0 failures");
  });

  it("more than one line filter with multiple files", async (t) => {
    await t.appFile("test/models/account.test.ts", lineFilterFiles.account);
    await t.appFile("test/models/post.test.ts", lineFilterFiles.post);

    const output = await t.runTestCommand(
      "test/models/account.test.ts:4:9 test/models/post.test.ts:4:9",
    );
    expect(output).toMatch("AccountTest:FirstFilter");
    expect(output).toMatch("AccountTest:SecondFilter");
    expect(output).toMatch("PostTest:FirstFilter");
    expect(output).toMatch("PostTest:SecondFilter");
    expect(output).toMatch("4 runs");
  });

  it("multiple line filters", async (t) => {
    await t.createTestFile("models", "account");
    await t.createTestFile("models", "post");

    const output = await t.runTestCommand(
      "test/models/account.test.ts:4 test/models/post.test.ts:4",
    );
    expect(output).toMatch("AccountTest");
    expect(output).toMatch("PostTest");
  });

  it("line filters trigger only one runnable", async (t) => {
    await t.appFile("test/models/post.test.ts", lineFilterFiles.runnable);

    const output = await t.runTestCommand("test/models/post.test.ts:4 --seed 30410");
    expect(output).not.toMatch("ran second runnable");
    expect(output).toMatch("1 runs");
  });

  it("line filter with minitest string filter", async (t) => {
    await t.appFile("test/models/post.test.ts", lineFilterFiles.minitest);

    const output = await t.runTestCommand("test/models/post.test.ts:4 -n test_by_name");
    expect(output).toMatch("by line");
    expect(output).toMatch("by name");
    expect(output).toMatch("2 runs");
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
