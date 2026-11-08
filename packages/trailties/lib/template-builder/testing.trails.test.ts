import { describe, expect, it } from "vitest";
import { parseTs } from "./testing.js";

describe("parseTs", () => {
  it("reports no diagnostics for valid TypeScript", () => {
    expect(parseTs("export const x: number = 1;").diagnostics).toEqual([]);
  });

  it("reports TS1109 for syntactically-invalid TypeScript", () => {
    expect(parseTs("export const x: number = ;").diagnostics.map((d) => d.code)).toEqual([1109]);
  });

  it("reports TS1434 for Ruby source", () => {
    expect(parseTs("def foo\n  1\nend\n").diagnostics.map((d) => d.code)).toEqual([1434]);
  });
});
