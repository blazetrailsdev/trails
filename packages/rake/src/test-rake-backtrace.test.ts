import { describe, expect, it } from "vitest";
import { Backtrace } from "./backtrace.js";
import { useApplicationTestCase } from "./test-helpers/application.js";

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
    const paths = [" at x (/app/node:12)"];

    expect(Backtrace.collapse(paths)).toEqual(paths);
  });

  it("ruby array each suppressed", () => {
    const paths = ["at Array.forEach (<anonymous>)"];

    expect(Backtrace.collapse(paths)).toEqual([]);
  });
});
