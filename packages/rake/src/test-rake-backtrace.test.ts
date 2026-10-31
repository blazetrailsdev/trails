import { Dir, regexpEscape } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Backtrace } from "./backtrace.js";
import { useApplicationTestCase } from "./test-helpers/application.js";
import { rakefile } from "./test-helpers/rakefile-definitions.js";
import { rake, runner, useRubyRunner } from "./test-helpers/ruby-runner.js";

describe("TestBacktraceSuppression", () => {
  useApplicationTestCase();

  it("bin rake suppressed", () => {
    const paths = ["something/bin/rake:12"];

    expect(Backtrace.collapse(paths)).toEqual([]);
  });

  it("system dir suppressed", () => {
    const paths = ["at Module.load (node:internal/modules/cjs/loader:12:3)"];

    expect(Backtrace.collapse(paths)).toEqual([]);
  });

  it("near system dir isnt suppressed", () => {
    const paths = [
      " at x (/app/node:12)",
      "at Object.<anonymous> (/x/Rakefile:1:1)",
      "/x/node:internal/y:1",
    ];

    expect(Backtrace.collapse(paths)).toEqual(paths);
  });

  it("ruby array each suppressed", () => {
    const paths = ["at Array.forEach (<anonymous>)"];

    expect(Backtrace.collapse(paths)).toEqual([]);
  });
});

describe("TestRakeBacktrace", () => {
  useApplicationTestCase();
  useRubyRunner();

  beforeEach((ctx) => {
    if (Backtrace.SUPPRESS_PATTERN.test(Dir.pwd())) ctx.skip();
  });

  async function invoke(...args: string[]): Promise<string> {
    await rake(...args);
    return runner.err;
  }

  function assertSomethingMatches(pattern: RegExp, lines: string[]): void {
    expect(lines.find((ln) => pattern.test(ln))).toMatch(pattern);
  }

  function rakefileFrame(line: number): RegExp {
    return new RegExp(`^at .*${regexpEscape(Dir.pwd())}/Rakefile\\.ts\\?\\d+:${line}:`, "i");
  }

  it("single collapse", async () => {
    await rakefile(`
      task("foo", block(() => {
        throw new RuntimeError("foooo!");
      }));
    `);
    const lines = (await invoke("foo")).split("\n");
    expect(lines[0]).toBe("rake aborted!");
    expect(lines[1]).toBe("foooo!");
    assertSomethingMatches(rakefileFrame(3), lines);
    assertSomethingMatches(/^Tasks:/, lines);
  });

  it("multi collapse", async () => {
    await rakefile(`
      task("foo", block(async () => {
        await Rake.application.invokeTask("bar");
      }));
      task("bar", block(() => {
        throw new RuntimeError("barrr!");
      }));
    `);
    const lines = (await invoke("foo")).split("\n");
    expect(lines[0]).toBe("rake aborted!");
    expect(lines[1]).toBe("barrr!");
    assertSomethingMatches(rakefileFrame(6), lines);
    assertSomethingMatches(rakefileFrame(3), lines);
    assertSomethingMatches(/^Tasks:/, lines);
  });

  it("suppress option", async () => {
    await rakefile(`
      task("baz", block(() => {
        throw new RuntimeError("bazzz!");
      }));
    `);
    let lines = (await invoke("baz")).split("\n");
    expect(lines[0]).toBe("rake aborted!");
    expect(lines[1]).toBe("bazzz!");
    assertSomethingMatches(/Rakefile/i, lines);
    lines = (await invoke("--suppress-backtrace", ".ak.file", "baz")).split("\n");
    expect(lines[0]).toBe("rake aborted!");
    expect(lines[1]).toBe("bazzz!");
    expect(lines[2]).not.toMatch(/Rakefile/i);
  });
});
