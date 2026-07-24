import { describe, expect, it } from "vitest";
import {
  type BodyHashRecord,
  type BodyPin,
  comparePinKeys,
  currentDigests,
  diffPins,
  findDuplicateKeys,
  keyOf,
  missingScope,
  pinPairs,
  prunePins,
} from "./body-pins.js";

function record(over: Partial<BodyHashRecord> = {}): BodyHashRecord {
  return {
    package: "activerecord",
    rubyFile: "persistence.rb",
    rubyName: "save",
    tsFile: "persistence.ts",
    tsName: "save",
    digest: "aaaa000000000000",
    ...over,
  };
}

function pin(over: Partial<BodyPin> = {}): BodyPin {
  return {
    package: "activerecord",
    rubyFile: "persistence.rb",
    rubyName: "save",
    digest: "aaaa000000000000",
    ...over,
  };
}

describe("keyOf", () => {
  it("keys on package + rubyFile + rubyName", () => {
    expect(keyOf(record())).toBe("activerecord persistence.rb save");
  });
});

describe("comparePinKeys", () => {
  it("orders by code unit, not ICU collation", () => {
    const bang = pin({ rubyName: "permit!" });
    const under = pin({ rubyName: "permit_any_in_array" });
    // "!" (0x21) < "_" (0x5f) by code unit; ICU demotes punctuation to a
    // secondary difference and can order these either way.
    expect(comparePinKeys(bang, under)).toBeLessThan(0);
    expect(comparePinKeys(under, bang)).toBeGreaterThan(0);
    expect(comparePinKeys(bang, bang)).toBe(0);
  });

  it("puts uppercase before lowercase, unlike ICU's case-insensitive primary strength", () => {
    const sorted = ["permit!", "permit_all", "permitted?", "Permit"]
      .map((rubyName) => pin({ rubyName }))
      .sort(comparePinKeys)
      .map((p) => p.rubyName);
    expect(sorted).toEqual(["Permit", "permit!", "permit_all", "permitted?"]);
  });
});

describe("currentDigests", () => {
  it("collapses multi-candidate records to the first digest", () => {
    const map = currentDigests([
      record({ tsName: "save", digest: "aaaa000000000000" }),
      record({ tsName: "saveBang", digest: "aaaa000000000000" }),
    ]);
    expect(map.size).toBe(1);
    expect(map.get("activerecord persistence.rb save")).toBe("aaaa000000000000");
  });
});

describe("diffPins", () => {
  it("reports no drift or stale when pins match current", () => {
    const { drift, stale } = diffPins([record()], [pin()]);
    expect(drift).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("detects drift when the current body digest differs", () => {
    const { drift, stale } = diffPins([record({ digest: "bbbb111111111111" })], [pin()]);
    expect(stale).toEqual([]);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      rubyName: "save",
      digest: "aaaa000000000000",
      currentDigest: "bbbb111111111111",
    });
  });

  it("detects a stale pin when the pair no longer resolves (removal/rename)", () => {
    // The pinned `save` is gone from the artifact (renamed to `store`).
    const { drift, stale } = diffPins([record({ rubyName: "store" })], [pin()]);
    expect(drift).toEqual([]);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.rubyName).toBe("save");
  });
});

describe("pinPairs", () => {
  it("pins every matched pair with --pin-all, preserving prior reasons", () => {
    const records = [
      record({ rubyName: "save", digest: "1111000000000000" }),
      record({ rubyFile: "querying.rb", rubyName: "find", digest: "2222000000000000" }),
    ];
    const existing = [pin({ rubyName: "save", digest: "old", reason: "verified in #123" })];
    const next = pinPairs(records, existing, { all: true });
    expect(next).toHaveLength(2);
    const saved = next.find((p) => p.rubyName === "save")!;
    expect(saved.digest).toBe("1111000000000000");
    expect(saved.reason).toBe("verified in #123");
    expect(next.find((p) => p.rubyName === "find")!.digest).toBe("2222000000000000");
  });

  it("only re-pins the selected Ruby file, leaving other pins untouched", () => {
    const records = [
      record({ rubyName: "save", digest: "new1" }),
      record({ rubyFile: "querying.rb", rubyName: "find", digest: "new2" }),
    ];
    const existing = [
      pin({ rubyName: "save", digest: "old1" }),
      pin({ rubyFile: "querying.rb", rubyName: "find", digest: "old2" }),
    ];
    const next = pinPairs(records, existing, { rubyFile: "persistence.rb" });
    expect(next.find((p) => p.rubyName === "save")!.digest).toBe("new1");
    // querying.rb was not selected → its pin stays at the old digest.
    expect(next.find((p) => p.rubyName === "find")!.digest).toBe("old2");
  });

  it("emits the same manifest order for any input order (no reseed churn)", () => {
    // The manifest is regenerated from whatever order the artifact lists
    // records in; a permuted artifact must not reorder committed pins.
    const names = ["permit!", "permit_all", "permitted?", "Permit", "save"];
    const records = names.map((rubyName, i) => record({ rubyName, digest: `${i}00000000000000` }));
    const forward = pinPairs(records, [], { all: true }).map(keyOf);
    const reversed = pinPairs([...records].reverse(), [], { all: true }).map(keyOf);
    expect(reversed).toEqual(forward);
    // Array#sort with no comparator is code-unit order — the emitted order
    // must match it exactly.
    expect(forward).toEqual([...forward].sort());
  });
});

describe("findDuplicateKeys", () => {
  it("flags two entries sharing one identity", () => {
    expect(findDuplicateKeys([pin(), pin({ digest: "other" })])).toEqual([
      "activerecord persistence.rb save",
    ]);
  });

  it("returns nothing for a clean 1:1 manifest", () => {
    expect(findDuplicateKeys([pin(), pin({ rubyName: "find" })])).toEqual([]);
  });
});

describe("missingScope", () => {
  it("flags packages absent from a partial-scope artifact", () => {
    const absent = missingScope({ packages: ["activerecord"], hashes: [] }, [
      "activerecord",
      "activemodel",
    ]);
    expect(absent).toEqual(["activemodel"]);
  });

  it("returns nothing when the artifact covers the expected set", () => {
    expect(missingScope({ packages: ["activerecord"], hashes: [] }, ["activerecord"])).toEqual([]);
  });
});

describe("prunePins", () => {
  it("drops pins whose pair no longer resolves and keeps the rest sorted", () => {
    const records = [record(), record({ rubyFile: "core.rb", rubyName: "init" })];
    const pins = [pin({ rubyFile: "core.rb", rubyName: "init" }), pin({ rubyName: "gone" }), pin()];
    expect(prunePins(records, pins).map(keyOf)).toEqual([
      "activerecord core.rb init",
      "activerecord persistence.rb save",
    ]);
  });

  it("preserves a pin that drifted rather than pruning it", () => {
    const pins = [pin({ digest: "bbbb111111111111", reason: "story-x" })];
    expect(prunePins([record()], pins)).toEqual(pins);
  });
});
