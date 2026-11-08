import { describe, expect, it } from "vitest";

import { Dir, env, setEnv } from "@blazetrails/ruby-compat";
import { BacktraceFilter, Minitest, UnexpectedError } from "./assertions.js";

describe("UnexpectedErrorTest", () => {
  it("message reads the wrapped error when called", () => {
    const raised = new TypeError("boom");
    const wrapped = new UnexpectedError(raised);
    expect(wrapped.message).toMatch(/^TypeError: boom\n/);

    raised.message = "louder";
    expect(wrapped.message).toMatch(/^TypeError: louder\n/);
  });

  it("message renders the wrapped error's class", () => {
    class DomainFailure extends Error {}
    const wrapped = new UnexpectedError(new DomainFailure("boom"));
    expect(wrapped.message).toMatch(/^DomainFailure: boom\n/);
  });

  it("stack reads the wrapped error when called", () => {
    const raised = new RangeError("nope");
    const wrapped = new UnexpectedError(raised);
    expect(wrapped.stack).toBe(raised.stack);

    raised.stack = "RangeError: nope\n    at somewhere";
    expect(wrapped.stack).toBe("RangeError: nope\n    at somewhere");
  });

  it("the rendered backtrace is filtered and cwd-relative", () => {
    const raised = new Error("boom");
    raised.stack = [
      "Error: boom",
      `    at doThing (${Dir.pwd()}/packages/activesupport/src/thing.ts:1:1)`,
      "    at runTest (/somewhere/node_modules/vitest/dist/runner.js:2:2)",
      `    at afterFramework (${Dir.pwd()}/packages/activesupport/src/other.ts:3:3)`,
    ].join("\n");

    expect(new UnexpectedError(raised).message).toBe(
      "Error: boom\n    at doThing (packages/activesupport/src/thing.ts:1:1)",
    );
  });

  it("filter returns the whole trace under MT_DEBUG", () => {
    const bt = [
      "at doThing (thing.ts:1:1)",
      "at runTest (/node_modules/vitest/dist/runner.js:2:2)",
    ];
    const filter = new BacktraceFilter();
    expect(filter.filter(bt)).toEqual(["at doThing (thing.ts:1:1)"]);

    const original = env.MT_DEBUG;
    setEnv("MT_DEBUG", "1");
    try {
      expect(filter.filter(bt)).toEqual(bt);
    } finally {
      setEnv("MT_DEBUG", original);
    }
  });

  it("the rendered backtrace follows a swapped Minitest.backtraceFilter", () => {
    const raised = new Error("boom");
    raised.stack = [
      "Error: boom",
      `    at doThing (${Dir.pwd()}/packages/activesupport/src/thing.ts:1:1)`,
      `    at inThePlugin (${Dir.pwd()}/packages/activesupport/src/plugin.ts:2:2)`,
    ].join("\n");

    const original = Minitest.backtraceFilter;
    Minitest.backtraceFilter = new BacktraceFilter(/plugin\.ts/);
    try {
      expect(new UnexpectedError(raised).message).toBe(
        "Error: boom\n    at doThing (packages/activesupport/src/thing.ts:1:1)",
      );
    } finally {
      Minitest.backtraceFilter = original;
    }
  });
});
