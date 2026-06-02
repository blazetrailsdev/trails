import { describe, expect, it } from "vitest";
import { adapterType } from "../test-adapter.js";
import { adapterSupports, describeIfSupports, itIfSupports } from "./supports.js";

// Assertions are computed from `adapterType` so they hold on every CI lane
// (sqlite / postgres / mariadb), not just the default sqlite run.
describe("adapterSupports", () => {
  it("is true for capabilities available on every backend", () => {
    expect(adapterSupports("json")).toBe(true);
    expect(adapterSupports("savepoints")).toBe(true);
  });

  it("reflects the active adapter for backend-specific capabilities", () => {
    expect(adapterSupports("comments")).toBe(adapterType !== "sqlite");
    expect(adapterSupports("insert_conflict_target")).toBe(adapterType !== "mysql");
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

itIfSupports("json", "json gate runs on every backend", () => {
  expect(adapterSupports("json")).toBe(true);
});
