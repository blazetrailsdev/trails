import { describe, it, expect } from "vitest";
import { findJoinTableName, joinTableName } from "./join-table.js";

const host = {
  joinTableName(t1: string, t2: string) {
    return joinTableName.call(this, t1, t2);
  },
};

describe("JoinTable#joinTableName", () => {
  it("sorts table names alphabetically", () => {
    expect(joinTableName.call(host, "assemblies", "parts")).toBe("assemblies_parts");
    expect(joinTableName.call(host, "parts", "assemblies")).toBe("assemblies_parts");
  });

  it("deduplicates common prefix", () => {
    expect(joinTableName.call(host, "catalog_categories", "catalog_products")).toBe(
      "catalog_categories_products",
    );
  });

  it("handles plain names without common prefix", () => {
    expect(joinTableName.call(host, "users", "roles")).toBe("roles_users");
  });
});

describe("JoinTable#findJoinTableName", () => {
  it("uses options.tableName when provided", () => {
    expect(findJoinTableName.call(host, "assemblies", "parts", { tableName: "custom" })).toBe(
      "custom",
    );
  });

  it("falls back to joinTableName", () => {
    expect(findJoinTableName.call(host, "assemblies", "parts")).toBe("assemblies_parts");
  });
});
