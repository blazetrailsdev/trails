import { describe, it, expect } from "vitest";
import { inventedArmsIn, TAG } from "./invented-arm-tags.js";
import { compareArms, staleArmReceipts, type SkeletonRow } from "./report-arms.js";

const block = (body: string): string => `/**\n * ${body}\n */`;

function row(ruby: string[], ts: string[], inventedArms?: string[]): SkeletonRow {
  return {
    package: "activemodel",
    rubyFile: "attribute_methods.rb",
    rubyName: "define_call",
    tsFile: "attribute-methods.ts",
    tsName: "defineCall",
    ruby,
    ts,
    ...(inventedArms ? { inventedArms } : {}),
  };
}

describe("inventedArmsIn", () => {
  it("returns the receipted tokens", () => {
    const comment = `/**\n * ${TAG} if — PERMANENT\n * ${TAG} rbObjRespondTo — CONVERGEABLE some-story\n */`;
    expect(inventedArmsIn(comment)).toEqual(["if", "rbObjRespondTo"]);
  });

  it("rejects a receipt with no permanence token", () => {
    expect(() => inventedArmsIn(block(`${TAG} if — readers are properties`))).toThrow(
      /@inventedArm needs a permanence claim/,
    );
  });
});

describe("an @inventedArm receipt on a skeleton row", () => {
  const ruby = ["ref:define_cached_method", "if"];
  const ts = ["ref:rbObjRespondTo", "if", "ref:defineCachedMethod", "if"];

  it("discharges a receipted invented arm", () => {
    expect(compareArms(row(ruby, ts))?.invented).toEqual(["if"]);
    expect(compareArms(row(ruby, ts, ["if"]))).toBeUndefined();
  });

  it("keeps a missing arm the receipt does not speak for", () => {
    const verdict = compareArms(row([...ruby, "throw"], ts, ["if"]))!;
    expect(verdict.missing).toEqual(["throw"]);
    expect(verdict.invented).toEqual([]);
  });

  it("holds a receipt for an invented arm and an extra call as live", () => {
    expect(staleArmReceipts(row(ruby, ts, ["if", "rbObjRespondTo"]))).toEqual([]);
  });

  it("reports a receipt for an arm the body no longer invents", () => {
    expect(staleArmReceipts(row(ruby, ruby, ["if"]))).toEqual(["if"]);
  });

  it("reports a receipt for a call the body does not make", () => {
    expect(staleArmReceipts(row(ruby, ts, ["rbFSend"]))).toEqual(["rbFSend"]);
  });
});
