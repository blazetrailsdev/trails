import { describe, it, expect } from "vitest";
import {
  type CallArgArtifact,
  type CallArgExcludeEntry,
  type CallArgKey,
  diffAgainstBaseline,
  findDuplicateKeys,
  gatedRows,
  keyOf,
  reseed,
  sortKeys,
} from "./call-args-baseline.js";

function key(over: Partial<CallArgKey> = {}): CallArgKey {
  return {
    package: "arel",
    tsFile: "visitors/to-sql.ts",
    rubyName: "inject_join",
    call: "visit",
    rubyArgs: ["ref:o", "ref:collector"],
    ...over,
  };
}

function entry(over: Partial<CallArgExcludeEntry> = {}): CallArgExcludeEntry {
  return { ...key(), reason: "reviewed", ...over };
}

describe("keyOf", () => {
  it("includes the Ruby argument list", () => {
    expect(keyOf(key())).toBe("arel visitors/to-sql.ts inject_join visit ref:o,ref:collector");
  });

  it("separates two sites of the same call passing different arguments", () => {
    expect(keyOf(key())).not.toBe(keyOf(key({ rubyArgs: ["ref:o"] })));
  });
});

describe("gatedRows", () => {
  const artifact = {
    compared: 9,
    mismatches: [
      { ...key(), class: "shape" },
      { ...key({ call: "quote" }), class: "naming" },
    ],
  } as unknown as CallArgArtifact;

  it("gates shape rows", () => {
    expect(gatedRows(artifact).map((r) => r.call)).toEqual(["visit"]);
  });

  it("leaves naming rows out of the gated population", () => {
    expect(gatedRows(artifact).some((r) => r.class === "naming")).toBe(false);
  });
});

describe("diffAgainstBaseline", () => {
  it("reports a row absent from the baseline as added", () => {
    const { added, stale } = diffAgainstBaseline([key()], []);
    expect(added).toHaveLength(1);
    expect(stale).toHaveLength(0);
  });

  it("reports a baseline entry that no longer flags as stale", () => {
    const { added, stale } = diffAgainstBaseline([], [entry()]);
    expect(added).toHaveLength(0);
    expect(stale).toHaveLength(1);
  });

  it("matches a baselined row on its argument list", () => {
    expect(diffAgainstBaseline([key()], [entry()]).added).toHaveLength(0);
    expect(diffAgainstBaseline([key({ rubyArgs: ["ref:o"] })], [entry()]).added).toHaveLength(1);
  });
});

describe("reseed", () => {
  it("preserves the reason of a row that still flags", () => {
    expect(reseed([key()], [entry()], "SEED")[0].reason).toBe("reviewed");
  });

  it("seeds a new row with the default reason", () => {
    expect(reseed([key({ call: "quote" })], [entry()], "SEED")[0].reason).toBe("SEED");
  });

  it("drops a baseline entry that no longer flags", () => {
    expect(reseed([], [entry()], "SEED")).toEqual([]);
  });

  it("collapses duplicate keys into one entry", () => {
    expect(reseed([key(), key()], [], "SEED")).toHaveLength(1);
  });
});

describe("sortKeys", () => {
  it("orders by code unit, not locale collation", () => {
    const sorted = sortKeys([key({ call: "permit_any" }), key({ call: "permit!" })]);
    expect(sorted.map((k) => k.call)).toEqual(["permit!", "permit_any"]);
  });
});

describe("findDuplicateKeys", () => {
  it("reports a key recorded twice", () => {
    expect(findDuplicateKeys([entry(), entry({ reason: "other" })])).toEqual([keyOf(key())]);
  });

  it("accepts a 1:1 baseline", () => {
    expect(findDuplicateKeys([entry(), entry({ call: "quote" })])).toEqual([]);
  });
});
