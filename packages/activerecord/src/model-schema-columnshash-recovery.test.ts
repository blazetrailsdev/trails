/**
 * Regression: a fresh same-table model's first sync `columnsHash()` returns the
 * table's real columns sourced from the persistent warm schema cache (RFC 0031
 * R1/R2) — no sibling borrow. The hard case the old `borrowSameTableColumns`
 * recovery could not handle is a same-table sibling that declares its own
 * `ignoredColumns`: borrow skipped such a sibling (its schema-sourced defs were
 * already filtered) and fell back to an empty hash, un-qualifying projections.
 * With the cache always warm the fresh model reads the unfiltered column set
 * directly and applies only its own `ignoredColumns`.
 *
 * Tracked: RFC 0031 r3-remove-sibling-borrow-and-recovery (supersedes RFC 0030
 * columnshash-empty-after-aliased-hash-select).
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Developer, SpecialDeveloper } from "./test-helpers/models/developer.js";

describe("columnsHash warm-cache same-table read", () => {
  fixtures(["developers"], { schema: canonicalSchema });

  it("reads real columns for a fresh sibling of an ignoredColumns model", () => {
    // Warm the cache via the sibling that DECLARES `ignoredColumns`
    // (first_name): this is the case the old sibling-borrow could not recover
    // from, since its filtered defs would have hidden first_name.
    Developer.columnsHash();
    expect(Object.keys(Developer.columnsHash())).not.toContain("first_name");

    // The fresh same-table sibling reads the unfiltered column set from the
    // persistent warm cache — first_name is present and projections qualify.
    const columns = SpecialDeveloper.columnsHash();
    expect(Object.keys(columns)).toContain("first_name");
    expect(Object.keys(columns)).toContain("name");
    expect(SpecialDeveloper.select("name").toSql()).toBe(
      Developer.unscoped().select("name").toSql(),
    );
  });
});
