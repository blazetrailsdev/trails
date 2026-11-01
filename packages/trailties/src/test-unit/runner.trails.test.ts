import { Formatter } from "@blazetrails/did-you-mean";
import { Dir, File, LoadError, env, getFs, setEnv } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompositeFilter, Filter, InvalidTestError, Runner } from "./runner.js";

const internals = Runner as unknown as {
  testLocations(tests: string[]): Promise<string[]>;
  nameFilter(argv: string[]): string[];
};

describe("Runner", () => {
  const originalEnv = env.TRAILS_ENV;
  const originalCwd = Dir.pwd();

  beforeEach(() => {
    Runner.filters.length = 0;
  });
  afterEach(() => {
    setEnv("TRAILS_ENV", originalEnv);
    Dir.chdir(originalCwd);
    Runner.filters.length = 0;
  });

  it("parseOptions removes the environment and warnings flags", () => {
    const argv = ["test/a.test.ts", "-e", " staging ", "-w"];
    Runner.parseOptions(argv);
    expect(env.TRAILS_ENV).toBe("staging");
    expect(argv).toEqual(["test/a.test.ts"]);
    Runner.parseOptions([]);
    expect(env.TRAILS_ENV).toBe("test");
  });

  async function app(): Promise<void> {
    const root = Dir.mktmpdir("runner-");
    await getFs().mkdir!(`${root}/test/models`, { recursive: true });
    await getFs().mkdir!(`${root}/test/system`, { recursive: true });
    await getFs().writeFile!(
      `${root}/test/models/user.test.ts`,
      'describe("User", () => {\n  it("a", () => {\n    expect(1).toBe(1);\n  });\n\n  it("b", () => {});\n});\n',
    );
    await getFs().writeFile!(`${root}/test/system/visit.test.ts`, "");
    Dir.chdir(root);
  }

  it("loadTests lists the default glob without system tests", async () => {
    await app();
    expect(await Runner.loadTests([])).toEqual(["test/models/user.test.ts"]);
  });

  it("loadTests expands a directory and skips -n values", async () => {
    await app();
    expect(await Runner.loadTests(["test/system", "-n", "/a/"])).toEqual([
      "test/system/visit.test.ts",
    ]);
  });

  it("loadTests suggests a correction for a mistyped path", async () => {
    await app();
    const error = await Runner.loadTests(["test/models/usr.test.ts"]).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidTestError);
    expect(error.message).toBe(
      `Could not load test file: test/models/usr.test.ts.\n${Formatter.messageFor(["test/models/user.test.ts"])}`.trimEnd(),
    );
    expect(error.backtrace()).toEqual([]);
  });

  it("loadTests raises LoadError with nothing to suggest", async () => {
    await app();
    await expect(Runner.loadTests(["./zzzzzzzzzzzzzzzzzzzzzzzz/q.ts"])).rejects.toBeInstanceOf(
      LoadError,
    );
  });

  it("selects every test a line range overlaps", async () => {
    await app();
    const tests = await Runner.loadTests(["test/models/user.test.ts:3-6"]);
    expect(await internals.testLocations(tests)).toEqual([
      "test/models/user.test.ts:2",
      "test/models/user.test.ts:6",
    ]);
  });

  it("hands -n to Vitest as a regexp", () => {
    expect(internals.nameFilter(["-n", "/a.b/"])).toEqual(["-t", "a.b"]);
    expect(internals.nameFilter(["--name", "a.b"])).toEqual(["-t", "a\\.b"]);
    expect(internals.nameFilter(["test/a.test.ts"])).toEqual([]);
  });

  const runnable = {
    isMethodDefined: (method: string) => method === "test_a",
    instanceMethod: () => ({
      sourceLocation: () => [File.expandPath("test/a.test.ts"), 3] as [string, number],
    }),
  };

  it("composeFilter normalizes a declarative name", () => {
    expect(Runner.composeFilter(runnable, "some test")).toBe("test_some_test");
    expect(Runner.composeFilter(runnable, "/some test/")).toBe("/some_test|some test/");
    expect(Runner.composeFilter(runnable, "test_x")).toBe("test_x");
  });

  it("composeFilter composes once a line filter is set", () => {
    Runner.filters.push(["test/a.test.ts", []], ["test/b.test.ts", ["1"]]);
    const filter = Runner.composeFilter(runnable, "/x/") as CompositeFilter;
    expect(filter).toBeInstanceOf(CompositeFilter);
    expect(filter.caseEquals("test_a")).toBe(true);
    expect(filter.caseEquals("test_x_y")).toBe(true);
    expect(filter.caseEquals("nope")).toBe(false);
  });

  it("Filter matches on the method's file", () => {
    expect(new Filter(runnable, "test/a.test.ts", null).caseEquals("test_a")).toBe(true);
    expect(new Filter(runnable, "test/b.test.ts", null).caseEquals("test_a")).toBe(false);
    expect(new Filter(runnable, "test/a.test.ts", null).caseEquals("missing")).toBe(false);
  });
});
