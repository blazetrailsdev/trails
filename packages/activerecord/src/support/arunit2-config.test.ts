import { describe, expect, it } from "vitest";
import { arunitDatabaseNames } from "./arunit2-config.js";

describe("arunit2-config", () => {
  it("arunitDatabaseNames suffixes the primary database name", () => {
    // At slot 1 the arunit2 name is `expand_config`'s own literal
    // (`test/support/config.rb:28`).
    expect(arunitDatabaseNames("activerecord_unittest")).toEqual({
      arunit: "activerecord_unittest_arunit",
      arunit2: "activerecord_unittest2",
    });
  });

  it("carries the worker isolation slot into the arunit2 database name", () => {
    // The `2` lands before the slot, so this is not slot 32's database.
    expect(arunitDatabaseNames("activerecord_unittest_3")).toEqual({
      arunit: "activerecord_unittest_3_arunit",
      arunit2: "activerecord_unittest2_3",
    });
    expect(arunitDatabaseNames("activerecord_unittest_32").arunit2).toBe(
      "activerecord_unittest2_32",
    );
  });
});
