import { describe, it, expect } from "vitest";
import { suppressedArgCallsIn, TAG } from "./missing-rails-args-tags.js";

const block = (body: string): string => `/**\n * ${body}\n */`;

describe("suppressedArgCallsIn", () => {
  it("returns the tagged calls", () => {
    expect(
      suppressedArgCallsIn(block(`${TAG} new — PERMANENT: a JS Map takes no capacity.`)),
    ).toEqual(["new"]);
  });

  it("returns nothing for an untagged comment", () => {
    expect(suppressedArgCallsIn(block("Just prose."))).toEqual([]);
  });

  it("ignores a call-set tag", () => {
    expect(suppressedArgCallsIn(block("@missingRailsCall new — the caller does it."))).toEqual([]);
  });

  it("rejects a tag with no reason", () => {
    expect(() => suppressedArgCallsIn(block(`${TAG} new`))).toThrow(/needs a reason/);
  });

  it("rejects a tag with no call", () => {
    expect(() => suppressedArgCallsIn(block(TAG))).toThrow(/needs a call/);
  });

  it("rejects a reason making no permanence claim", () => {
    expect(() => suppressedArgCallsIn(block(`${TAG} new — a JS Map takes no capacity.`))).toThrow(
      /needs a permanence claim/,
    );
  });

  it("accepts a CONVERGEABLE claim", () => {
    expect(
      suppressedArgCallsIn(block(`${TAG} where — CONVERGEABLE: pending the scope port.`)),
    ).toEqual(["where"]);
  });
});
