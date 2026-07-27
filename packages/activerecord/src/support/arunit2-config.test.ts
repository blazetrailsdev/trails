import { describe, expect, it } from "vitest";
import { arunitDatabaseNames } from "./arunit2-config.js";

describe("arunit2-config", () => {
  it("arunitDatabaseNames suffixes the primary database name", () => {
    expect(arunitDatabaseNames("activerecord_unittest")).toEqual({
      arunit: "activerecord_unittest_arunit",
      arunit2: "activerecord_unittest_arunit2",
    });
  });

  it("carries the worker isolation slot into the arunit2 database name", () => {
    expect(arunitDatabaseNames("activerecord_unittest_3").arunit2).toBe("activerecord_unittest_3_arunit2");
  });
});
