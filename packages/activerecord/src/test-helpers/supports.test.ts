import { describe, expect, it } from "vitest";
import { adapterType } from "../test-adapter.js";
import { adapterSupports, describeIfSupports, itIfSupports } from "./supports.js";

// Assertions are computed from `adapterType` so they hold on every CI lane
// (sqlite / postgres / mysql:8), not just the default sqlite run.
describe("adapterSupports", () => {
  it("is true for capabilities available on every backend", () => {
    expect(adapterSupports("savepoints")).toBe(true);
    expect(adapterSupports("foreign_keys")).toBe(true);
    // json: `!mariadb? && >= 5.7.8` — MySQL 8 is not MariaDB → true on all CI lanes.
    expect(adapterSupports("json")).toBe(true);
  });

  it("reflects the active adapter for backend-specific capabilities", () => {
    expect(adapterSupports("comments")).toBe(adapterType !== "sqlite");
    expect(adapterSupports("insert_conflict_target")).toBe(adapterType !== "mysql");
    // expression_index: PG + SQLite; MySQL 8 qualifies at the server level but our
    // schema-dump DDL generator doesn't yet emit correct MySQL 8 syntax (P-9 family).
    expect(adapterSupports("expression_index")).toBe(adapterType !== "mysql");
    // advisory_locks: PG + MySQL, not SQLite (mirrors the old skipIf(=== sqlite)).
    expect(adapterSupports("advisory_locks")).toBe(adapterType !== "sqlite");
    // exclusion/unique constraints: PG only (mirrors skipIf(!== postgres)).
    expect(adapterSupports("exclusion_constraints")).toBe(adapterType === "postgres");
    expect(adapterSupports("unique_constraints")).toBe(adapterType === "postgres");
  });

  it("throws on an unknown feature key (catches typos)", () => {
    expect(() => adapterSupports("not_a_real_feature")).toThrow(/unknown feature/);
  });
});

// Smoke: the gate wrappers register without throwing and skip when unsupported.
// `comments` is unsupported on the sqlite lane (suite skipped there); on
// PG/MySQL these execute as real assertions.
describeIfSupports("comments", "comments-gated suite", () => {
  it("runs only where comments are supported", () => {
    expect(adapterSupports("comments")).toBe(true);
  });
});

itIfSupports("json", "json gate runs where json is supported", () => {
  expect(adapterSupports("json")).toBe(true);
});
