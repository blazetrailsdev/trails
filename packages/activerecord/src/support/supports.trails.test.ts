import { describe, expect, it } from "vitest";
import { adapterType } from "../test-adapter.js";
import { adapterSupports, describeIfSupports, itIfSupports } from "./supports.js";

const mysqlProbe =
  adapterType === "mysql"
    ? await import("./mysql-server-version.js")
    : { supportsExpressionIndex: false, supportsJson: false };

describe("adapterSupports", () => {
  it("is true for capabilities available on every backend", () => {
    expect(adapterSupports("savepoints")).toBe(true);
    expect(adapterSupports("foreign_keys")).toBe(true);
  });

  it("reflects the active adapter for backend-specific capabilities", () => {
    expect(adapterSupports("comments")).toBe(adapterType !== "sqlite");
    expect(adapterSupports("insert_conflict_target")).toBe(adapterType !== "mysql");
    expect(adapterSupports("json")).toBe(adapterType !== "mysql" || mysqlProbe.supportsJson);
    expect(adapterSupports("expression_index")).toBe(
      adapterType !== "mysql" || mysqlProbe.supportsExpressionIndex,
    );
    expect(adapterSupports("advisory_locks")).toBe(adapterType !== "sqlite");
    expect(adapterSupports("exclusion_constraints")).toBe(adapterType === "postgres");
    expect(adapterSupports("unique_constraints")).toBe(adapterType === "postgres");
  });

  it("throws on an unknown feature key (catches typos)", () => {
    expect(() => adapterSupports("not_a_real_feature")).toThrow(/unknown feature/);
  });

  it("treats a comma-joined key as a conjunction (all features must hold)", () => {
    expect(adapterSupports("insert_conflict_target,insert_on_duplicate_update")).toBe(
      adapterType !== "mysql",
    );
    expect(adapterSupports("json,exclusion_constraints")).toBe(adapterType === "postgres");
  });

  it("throws when a member of a comma-joined key is unknown", () => {
    expect(() => adapterSupports("json,not_a_real_feature")).toThrow(/unknown feature/);
  });
});

describeIfSupports("comments", "comments-gated suite", () => {
  it("runs only where comments are supported", () => {
    expect(adapterSupports("comments")).toBe(true);
  });
});

itIfSupports("json", "json gate runs where json is supported", () => {
  expect(adapterSupports("json")).toBe(true);
});
