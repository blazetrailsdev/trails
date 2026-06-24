import { describe, it, expect } from "vitest";
import {
  callOf,
  diffAgainstBaseline,
  findDuplicateKeys,
  flattenArtifact,
  keyOf,
  loadBaseline,
  missingScope,
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
        {
          package: "ar",
          tsFile: "a.ts",
          rubyName: "foo",
          missing: ["save → save", "destroy → destroy"],
        },
        { package: "ar", tsFile: "b.ts", rubyName: "bar", missing: ["touch → touch"] },
      ],
    });
    expect(keys.map(keyOf)).toEqual([
      "ar a.ts foo save",
      "ar a.ts foo destroy",
      "ar b.ts bar touch",
    ]);
  });

  it("keeps same tsFile+rubyName+call distinct across packages (package is in the key)", () => {
    const keys = flattenArtifact({
      mismatches: [
        { package: "ar", tsFile: "a.ts", rubyName: "foo", missing: ["save → save"] },
        { package: "am", tsFile: "a.ts", rubyName: "foo", missing: ["save → save"] },
      ],
    });
    expect(new Set(keys.map(keyOf)).size).toBe(2);
  });
});

const baseline: ExcludeEntry[] = [
  { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "known" },
  { package: "ar", tsFile: "b.ts", rubyName: "bar", call: "touch", reason: "known" },
];

describe("diffAgainstBaseline", () => {
  it("passes when current exactly equals the baseline", () => {
    const current = [
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" },
      { package: "ar", tsFile: "b.ts", rubyName: "bar", call: "touch" },
    ];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("reports a NEW mismatch absent from the baseline (the ratchet)", () => {
    const current = [
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" },
      { package: "ar", tsFile: "b.ts", rubyName: "bar", call: "touch" },
      { package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update" },
    ];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added.map(keyOf)).toEqual(["ar c.ts baz update"]);
    expect(stale).toEqual([]);
  });

  it("reports a STALE baseline entry that no longer flags (only-shrink)", () => {
    const current = [{ package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" }];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added).toEqual([]);
    expect(stale.map(keyOf)).toEqual(["ar b.ts bar touch"]);
  });
});

describe("findDuplicateKeys", () => {
  it("returns nothing for a clean baseline", () => {
    expect(findDuplicateKeys(baseline)).toEqual([]);
  });

  it("flags a (package, tsFile, rubyName, call) repeated across rows", () => {
    expect(
      findDuplicateKeys([
        ...baseline,
        { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "dup" },
      ]),
    ).toEqual(["ar a.ts foo save"]);
  });
});

describe("committed baseline", () => {
  it("is well-formed: no duplicate keys, every entry has a package and reason", async () => {
    const committed = await loadBaseline();
    expect(findDuplicateKeys(committed)).toEqual([]);
    for (const e of committed) {
      expect(e.package.trim().length).toBeGreaterThan(0);
      expect(e.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("reseed", () => {
  it("preserves reasons for surviving entries and drops stale ones", () => {
    const current = [
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" },
      { package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update" },
    ];
    const next = reseed(current, baseline);
    expect(next).toEqual([
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "known" },
      {
        package: "ar",
        tsFile: "c.ts",
        rubyName: "baz",
        call: "update",
        reason: expect.stringContaining("Baseline (RFC 0044)"),
      },
    ]);
  });

  it("honors a custom default reason for new entries (wide RFC 0047 seed)", () => {
    const current = [{ package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update" }];
    const next = reseed(current, [], "wide seed");
    expect(next).toEqual([
      { package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update", reason: "wide seed" },
    ]);
  });

  it("collapses artifact rows that share a key into one baseline entry", () => {
    // The wide population emits the same Ruby call mapped to two TS candidates
    // as two `missing` rows → duplicate keys; reseed must produce a 1:1 baseline.
    const current = flattenArtifact({
      mismatches: [
        {
          package: "ar",
          tsFile: "a.ts",
          rubyName: "foo",
          missing: ["save → saveA", "save → saveB"],
        },
      ],
    });
    const next = reseed(current, [], "wide seed");
    expect(next).toEqual([
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "wide seed" },
    ]);
    expect(findDuplicateKeys(next)).toEqual([]);
  });
});

describe("missingScope", () => {
  const expected = ["activerecord", "activesupport", "rack"];

  it("returns nothing when the artifact covers every expected package", () => {
    expect(
      missingScope(
        { packages: ["rack", "activerecord", "activesupport"], mismatches: [] },
        expected,
      ),
    ).toEqual([]);
  });

  it("flags packages the artifact never compared (partial-scope/stale-cache run)", () => {
    expect(missingScope({ packages: ["activerecord"], mismatches: [] }, expected)).toEqual([
      "activesupport",
      "rack",
    ]);
  });

  it("treats a missing `packages` field (pre-field artifact) as full partial-scope", () => {
    expect(missingScope({ mismatches: [] }, expected)).toEqual([
      "activerecord",
      "activesupport",
      "rack",
    ]);
  });

  it("ignores extra packages the artifact compared beyond the expected set", () => {
    expect(missingScope({ packages: [...expected, "arel"], mismatches: [] }, expected)).toEqual([]);
  });
});
