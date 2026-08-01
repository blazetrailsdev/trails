import { describe, it, expect } from "vitest";
import type { ResidueRow } from "./guard.js";
import {
  overlapFailureMessage,
  overlappingSignOffs,
  parseSignOffs,
  partitionSignedOff,
  serializeSignOffs,
  signOffKey,
  staleSignOffMessage,
  staleSignOffs,
  type SignOff,
} from "./signoff.js";

const row = (name: string, status: ResidueRow["status"] = "divergent"): ResidueRow => ({
  rubyFile: "active_record/persistence.rb",
  name,
  status,
});

const signOff = (name: string, reason = "reviewed: ivar spelling only"): SignOff => ({
  rubyFile: "active_record/persistence.rb",
  name,
  reason,
});

describe("prism-codegen convergence sign-off", () => {
  it("round-trips a manifest sorted by key", () => {
    const entries = [signOff("save"), signOff("becomes")];
    expect(parseSignOffs(serializeSignOffs(entries))).toEqual([
      signOff("becomes"),
      signOff("save"),
    ]);
  });

  it("rejects an entry with no reason rather than letting a row leave unreviewed", () => {
    expect(() => parseSignOffs('[{"rubyFile":"a.rb","name":"save"}]')).toThrow(/no reason/);
    expect(() => parseSignOffs('[{"rubyFile":"a.rb","name":"save","reason":"  "}]')).toThrow(
      /no reason/,
    );
    expect(() => parseSignOffs('[{"rubyFile":"a.rb"}]')).toThrow(/malformed/);
    expect(() => parseSignOffs('{"a":1}')).toThrow(/expected a JSON array/);
  });

  it("rejects a duplicate key", () => {
    const dup = serializeSignOffs([signOff("save"), { ...signOff("save"), reason: "other" }]);
    expect(() => parseSignOffs(dup)).toThrow(/duplicate entry/);
  });

  it("keys a row without its status", () => {
    expect(signOffKey(row("save"))).toBe("active_record/persistence.rb::save");
    expect(signOffKey(row("save", "missing"))).toBe(signOffKey(row("save")));
  });

  it("moves a signed-off row out of the residue and keeps its reason", () => {
    const { signedOff, residue } = partitionSignedOff(
      [row("save"), row("update"), row("becomes", "missing")],
      [signOff("save"), signOff("becomes", "reviewed: ported into a sibling file")],
    );
    expect(residue).toEqual([row("update")]);
    expect(signedOff).toEqual([
      { row: row("save"), reason: "reviewed: ivar spelling only" },
      { row: row("becomes", "missing"), reason: "reviewed: ported into a sibling file" },
    ]);
  });

  it("fails on a sign-off whose row no longer appears", () => {
    const stale = staleSignOffs([row("save")], [signOff("save"), signOff("update")]);
    expect(stale).toEqual([signOff("update")]);
    expect(staleSignOffMessage(stale)).toContain("persistence.rb :: update");
    expect(staleSignOffMessage([])).toBeUndefined();
  });

  it("treats a row the call catalog also explains as redundant, not stale", () => {
    const catalogued = [row("save")];
    expect(staleSignOffs(catalogued, [signOff("save")])).toEqual([]);
  });

  it("fails when a row sits in both the sign-off manifest and the baseline", () => {
    const overlap = overlappingSignOffs([row("save"), row("update")], [signOff("save")]);
    expect(overlap).toEqual([row("save")]);
    expect(overlapFailureMessage(overlap)).toContain("persistence.rb :: save");
    expect(overlapFailureMessage([])).toBeUndefined();
  });
});
