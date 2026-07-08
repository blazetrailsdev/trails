/**
 * Tests for AliasTracker.create's alias-length resolution.
 *
 * Mirrors: ActiveRecord::Associations::AliasTracker.create
 * (alias_tracker.rb:9-25 — `new(connection.table_alias_length, aliases)`).
 */
import { describe, it, expect } from "vitest";
import { AliasTracker } from "./alias-tracker.js";

describe("AliasTracker.create", () => {
  it("uses the connection's tableAliasLength method (MySQL would give 256)", () => {
    const connection = { tableAliasLength: () => 256 };
    const tracker = AliasTracker.create(connection, "posts", []);
    // 256-cap: a 200-char candidate is aliased without truncation.
    expect(tracker.aliasNameFor("a".repeat(200))).toBe("a".repeat(200));
  });

  it("falls back to the DatabaseLimits default (64) when no length is available", () => {
    const tracker = AliasTracker.create(null, "posts", []);
    expect(tracker.aliasNameFor("a".repeat(200))).toBe("a".repeat(64));
  });
});
