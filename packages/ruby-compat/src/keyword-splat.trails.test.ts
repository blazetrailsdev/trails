import { describe, expect, it } from "vitest";
import { keywordSplat } from "./keyword-splat.js";

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
