import { describe, it, expect } from "vitest";
import {
  callOf,
  diffAgainstBaseline,
  flattenArtifact,
  keyOf,
  reseed,
  type ExcludeEntry,
} from "./lint-call-mismatches.js";

describe("callOf", () => {
  it("extracts the Ruby call name before the arrow", () => {
    expect(callOf("save → save")).toBe("save");
    expect(callOf("save! → saveBang")).toBe("save!");
    expect(callOf("clear_attribute_changes → clearAttributeChanges")).toBe(
      "clear_attribute_changes",
    );
  });
});

describe("flattenArtifact", () => {
  it("emits one key per missing call, splitting multi-call records", () => {
    const keys = flattenArtifact({
      mismatches: [
        { tsFile: "a.ts", rubyName: "foo", missing: ["save → save", "destroy → destroy"] },
        { tsFile: "b.ts", rubyName: "bar", missing: ["touch → touch"] },
      ],
    });
    expect(keys.map(keyOf)).toEqual(["a.ts foo save", "a.ts foo destroy", "b.ts bar touch"]);
  });
});

const baseline: ExcludeEntry[] = [
  { tsFile: "a.ts", rubyName: "foo", call: "save", reason: "known" },
  { tsFile: "b.ts", rubyName: "bar", call: "touch", reason: "known" },
];

describe("diffAgainstBaseline", () => {
  it("passes when current exactly equals the baseline", () => {
    const current = [
      { tsFile: "a.ts", rubyName: "foo", call: "save" },
      { tsFile: "b.ts", rubyName: "bar", call: "touch" },
    ];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("reports a NEW mismatch absent from the baseline (the ratchet)", () => {
    const current = [
      { tsFile: "a.ts", rubyName: "foo", call: "save" },
      { tsFile: "b.ts", rubyName: "bar", call: "touch" },
      { tsFile: "c.ts", rubyName: "baz", call: "update" },
    ];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added.map(keyOf)).toEqual(["c.ts baz update"]);
    expect(stale).toEqual([]);
  });

  it("reports a STALE baseline entry that no longer flags (only-shrink)", () => {
    const current = [{ tsFile: "a.ts", rubyName: "foo", call: "save" }];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added).toEqual([]);
    expect(stale.map(keyOf)).toEqual(["b.ts bar touch"]);
  });
});

describe("reseed", () => {
  it("preserves reasons for surviving entries and drops stale ones", () => {
    const current = [
      { tsFile: "a.ts", rubyName: "foo", call: "save" },
      { tsFile: "c.ts", rubyName: "baz", call: "update" },
    ];
    const next = reseed(current, baseline);
    expect(next).toEqual([
      { tsFile: "a.ts", rubyName: "foo", call: "save", reason: "known" },
      {
        tsFile: "c.ts",
        rubyName: "baz",
        call: "update",
        reason: expect.stringContaining("Baseline (RFC 0044)"),
      },
    ]);
  });
});
