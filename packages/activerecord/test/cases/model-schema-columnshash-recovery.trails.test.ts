import { describe, it, expect } from "vitest";
import "../../lib/index.js";
import { fixtures } from "../support/use-fixtures.js";
import { Developer, SpecialDeveloper } from "../models/developer.js";

describe("columnsHash warm-cache same-table read", () => {
  fixtures(["developers"]);

  it("reads real columns for a fresh sibling of an ignoredColumns model", () => {
    Developer.columnsHash();
    expect(Object.keys(Developer.columnsHash())).not.toContain("first_name");

    const columns = SpecialDeveloper.columnsHash();
    expect(Object.keys(columns)).toContain("first_name");
    expect(Object.keys(columns)).toContain("name");
    expect(SpecialDeveloper.select("name").toSql()).toBe(
      Developer.unscoped().select("name").toSql(),
    );
  });
});
