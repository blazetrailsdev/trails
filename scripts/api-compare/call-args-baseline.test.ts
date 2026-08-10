import { describe, it, expect } from "vitest";
import { shardKeyOf as keyOf } from "./call-mismatch-baseline.js";
import {
  type CallArgArtifact,
  type CallArgExcludeEntry,
  type CallArgKey,
  diffAgainstBaseline,
  findDuplicateKeys,
  gatedRows,
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
    kind: "args",
  };
}

function entry(over: Partial<CallArgExcludeEntry> = {}): CallArgExcludeEntry {
  return { ...key(), reason: "reviewed", ...over };
}

it("keyOf includes the Ruby argument list, separating two sites of one call", () => {
  expect(keyOf(key())).toBe("arel visitors/to-sql.ts inject_join visit args ref:o,ref:collector");
  expect(keyOf(key())).not.toBe(keyOf(key({ rubyArgs: ["ref:o"] })));
});

describe("gatedRows", () => {
  const artifact = {
    compared: 9,
    mismatches: [
      { ...key(), class: "shape" },
      { ...key({ call: "quote" }), class: "naming" },
    ],
  } as unknown as CallArgArtifact;

  it("gates shape rows, leaving naming ones out and stamping kind", () => {
    expect(gatedRows(artifact)).toEqual([key()]);
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

  it("seeds a new row with the default reason, dropping the entry that no longer flags", () => {
    expect(reseed([key({ call: "quote" })], [entry()], "SEED")).toEqual([
      { ...key({ call: "quote" }), reason: "SEED" },
    ]);
  });

  it("collapses duplicate keys into one entry", () => {
    expect(reseed([key(), key()], [], "SEED")).toHaveLength(1);
  });
});

it("sortKeys orders by code unit, not locale collation", () => {
  const sorted = sortKeys([key({ call: "permit_any" }), key({ call: "permit!" })]);
  expect(sorted.map((k) => k.call)).toEqual(["permit!", "permit_any"]);
});

describe("findDuplicateKeys", () => {
  it("reports a key recorded twice", () => {
    expect(findDuplicateKeys([entry(), entry({ reason: "other" })])).toEqual([keyOf(key())]);
  });
});
