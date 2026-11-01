import { Formatter } from "@blazetrails/did-you-mean";
import {
  Dir,
  File,
  LoadError,
  STDOUT,
  StringIO,
  env,
  getFs,
  setEnv,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestUnitReporter } from "./reporter.js";
import { CompositeFilter, Filter, InvalidTestError, Runner } from "./runner.js";

const internals = Runner as unknown as {
  testLocations(tests: string[], name: RegExp | null): Promise<string[]>;
  nameFilter(argv: string[]): RegExp | null;
};

describe("Runner", () => {
  const runnable = {
    isMethodDefined: (method: string) => method === "test_a",
    instanceMethod: () => ({
      sourceLocation: () => [File.expandPath("test/a.test.ts"), 3] as [string, number],
    }),
  };

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
    expect(await internals.testLocations(tests, null)).toEqual([
      "test/models/user.test.ts:2",
      "test/models/user.test.ts:6",
    ]);
  });

  it("reads -n in each spelling", () => {
    expect(internals.nameFilter(["-n", "/a.b/"])).toEqual(/a.b/);
    expect(internals.nameFilter(["--name", "a.b"])).toEqual(/a\.b/);
    expect(internals.nameFilter(["-nfoo"])).toEqual(/foo/);
    expect(internals.nameFilter(["--name=foo"])).toEqual(/foo/);
    expect(internals.nameFilter(["test/a.test.ts"])).toBeNull();
  });

  it("a name filter unions with a line filter", async () => {
    await app();
    const tests = await Runner.loadTests(["test/models/user.test.ts:3"]);
    expect(await internals.testLocations(tests, / b$/)).toEqual([
      "test/models/user.test.ts:2",
      "test/models/user.test.ts:6",
    ]);
  });

  it("a line filter leaves other listed files unselected", async () => {
    await app();
    const tests = await Runner.loadTests(["test/system", "test/models/user.test.ts:3"]);
    expect(await internals.testLocations(tests, null)).toEqual(["test/models/user.test.ts:2"]);
  });

  it("keeps a line match whose title spans lines or has a comma", async () => {
    await app();
    const file = "test/models/wrapped.test.ts";
    await getFs().writeFile!(
      file,
      'it.each([1])("x", () => {\n});\nit(\n  "a, b",\n  () => {},\n);\n',
    );
    await Runner.loadTests([`${file}:1`]);
    expect(await internals.testLocations([file], /b$/)).toEqual([`${file}:1`, `${file}:3`]);
  });

  it("testLocations matches an it.each title under its full name", async () => {
    await app();
    const file = "test/models/each.test.ts";
    await getFs().writeFile!(
      file,
      'describe("Post", () => {\n  it.each([1])("saves", () => {});\n});\nit("other", () => {});\n',
    );
    await Runner.loadTests([`${file}:4`]);
    expect(await internals.testLocations([file], /^Post saves$/)).toEqual([
      `${file}:2`,
      `${file}:4`,
    ]);
  });

  it("relativePathFor strips the application root", () => {
    TestUnitReporter.appRoot = "/app";
    try {
      const reporter = new TestUnitReporter(new StringIO());
      expect(reporter.relativePathFor("/app/test/a.test.ts")).toBe("test/a.test.ts");
    } finally {
      TestUnitReporter.appRoot = undefined;
    }
  });

  it("run rejects an unknown option", async () => {
    const puts = vi.spyOn(STDOUT, "puts").mockImplementation(() => null);
    await expect(Runner.run(["-b"])).rejects.toThrow("process.exit");
    expect(puts.mock.calls[1]).toEqual(["invalid option: -b"]);
    expect(puts.mock.calls[3][0]).toContain("Usage:");
    puts.mockRestore();
  });

  it("run does not start Vitest with no tests", async () => {
    await app();
    await getFs().mkdir!("test/empty", { recursive: true });
    await expect(Runner.run(["test/empty"])).resolves.toBeUndefined();
  });

  it("Filter answers false for a line with no definition", () => {
    const location = () => [import.meta.filename, 1] as [string, number];
    const filter = new Filter(
      { ...runnable, instanceMethod: () => ({ sourceLocation: location }) },
      import.meta.filename,
      "1",
    );
    expect(filter.caseEquals("test_a")).toBe(false);
  });

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
