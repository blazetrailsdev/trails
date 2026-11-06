import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { keywordSplat, rbGetKwargs, rbScanArgs } from "./keyword-splat.js";

describe("keywordSplat", () => {
  it("contributes no argument for an empty hash", () => {
    const args: unknown[] = ["delete_me", ...keywordSplat({})];
    expect(args).toEqual(["delete_me"]);
  });

  it("contributes the hash itself when it has keys", () => {
    const options = { unique: true };
    const args: unknown[] = ["delete_me", ...keywordSplat(options)];
    expect(args).toEqual(["delete_me", options]);
    expect(args[1]).toBe(options);
  });
});

describe("rbGetKwargs", () => {
  it("accepts declared and absent keywords", () => {
    expect(() =>
      rbGetKwargs({ isolation: "serializable", nested: undefined }, ["isolation"]),
    ).not.toThrow();
  });

  it("raises ArgumentError naming one unknown keyword", () => {
    expect(() => rbGetKwargs({ nested: true }, ["isolation"])).toThrow(
      new ArgumentError("unknown keyword: :nested"),
    );
  });

  it("raises ArgumentError naming several unknown keywords", () => {
    expect(() => rbGetKwargs({ nested: true, isolation: 1, other: 2 }, ["isolation"])).toThrow(
      new ArgumentError("unknown keywords: :nested, :other"),
    );
  });
});

describe("rbScanArgs", () => {
  it("pops a trailing Hash as the keywords", () => {
    const keywords = { retryable: true };
    const [rest, kw] = rbScanArgs([1, "two", keywords]);
    expect(rest).toEqual([1, "two"]);
    expect(kw).toEqual(keywords);
    expect(kw).not.toBe(keywords);
  });

  it("leaves a non-Hash last argument in the splat", () => {
    expect(rbScanArgs([1, [2], new Date(0)])).toEqual([[1, [2], new Date(0)], {}]);
    expect(rbScanArgs([null])).toEqual([[null], {}]);
    expect(rbScanArgs([])).toEqual([[], {}]);
  });
});
