import { describe, expect, test } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Process, env as ENV, include, setEnv } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

type Host = Generation & TestTest;

class TestTest extends TestCase {
  async assertUnsuccessfulRun(this: Host, name: string, message: string): Promise<string> {
    const result = await this.runTestFile(name);
    expect(Process.lastStatus!.exitstatus()).not.toBe(0);
    expect(result).toContain(message);
    return result;
  }

  async assertSuccessfulTestRun(this: Host, name: string): Promise<string> {
    const result = await this.runTestFile(name);
    expect(Process.lastStatus!.exitstatus(), result).toBe(0);
    return result;
  }

  async runTestFile(this: Host, name: string): Promise<string> {
    return this.trails("test", `${await this.appPath()}/test/${name}`, { allowFailure: true });
  }
}
include(TestTest, Isolation);
registerSpecType(/^TestTest$/, TestTest);

function it(name: string, block: (t: Host) => Promise<void>): void {
  test(name, async () => {
    const old = ENV["PARALLEL_WORKERS"];
    setEnv("PARALLEL_WORKERS", "0");
    const t = new TestTest(name) as Host;
    await t.buildApp();
    try {
      await block(t);
    } finally {
      setEnv("PARALLEL_WORKERS", old);
      await t.teardownApp();
    }
  });
}

describe("TestTest", { timeout: 600_000 }, () => {
  it("simple successful test", async (t) => {
    await t.appFile(
      "test/unit/foo.test.ts",
      `
        import "../test-helper.ts";
        import { describe, it, expect } from "vitest";

        describe("FooTest", () => {
          it("truth", () => {
            expect(true).toBe(true);
          });
        });
`,
    );

    await t.assertSuccessfulTestRun("unit/foo.test.ts");
  });

  it("simple failed test", async (t) => {
    await t.appFile(
      "test/unit/foo.test.ts",
      `
        import "../test-helper.ts";
        import { describe, it, expect } from "vitest";

        describe("FooTest", () => {
          it("truth", () => {
            expect(false).toBe(true);
          });
        });
`,
    );

    await t.assertUnsuccessfulRun("unit/foo.test.ts", "Failure:\nFooTest#truth");
  });

  it("enable full backtraces on test failures", async (t) => {
    await t.appFile(
      "test/unit/failing.test.ts",
      `import "../test-helper.ts";
import { describe, it } from "vitest";
describe("FailingTest", () => {
  it("failure", () => {
    throw new Error("fail");
  });
});
`,
    );

    const output = await t.runTestFile("unit/failing.test.ts");
    expect(output).toMatch(/test\/unit\/failing\.test\.ts/);
    expect(output).toMatch(/test\/unit\/failing\.test\.ts:4/);
  });
});
