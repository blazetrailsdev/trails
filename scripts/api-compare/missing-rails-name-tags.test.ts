import { describe, it, expect } from "vitest";
import { suppressedNamesIn, TAG } from "./missing-rails-name-tags.js";

const block = (body: string): string => `/**\n * ${body}\n */`;

describe("suppressedNamesIn", () => {
  it("returns the receipted Ruby identifiers", () => {
    expect(suppressedNamesIn(block(`${TAG} default — PERMANENT`))).toEqual(["default"]);
  });

  it("accepts a CONVERGEABLE receipt naming its story", () => {
    expect(suppressedNamesIn(block(`${TAG} inject — CONVERGEABLE some-story`))).toEqual(["inject"]);
  });

  it("ignores an args tag", () => {
    expect(suppressedNamesIn(block("@missingRailsArgs new — PERMANENT"))).toEqual([]);
  });

  it("rejects a receipt with no permanence token", () => {
    expect(() => suppressedNamesIn(block(`${TAG} default — reserved word`))).toThrow(
      /needs a permanence claim/,
    );
  });

  it("rejects a bare CONVERGEABLE", () => {
    expect(() => suppressedNamesIn(block(`${TAG} default — CONVERGEABLE`))).toThrow(
      /needs a story id/,
    );
  });

  it("rejects a tag with no reason", () => {
    expect(() => suppressedNamesIn(block(`${TAG} default`))).toThrow(/needs a reason/);
  });
});
