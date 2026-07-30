import { describe, expect, it } from "vitest";
import { arunitDatabaseNames } from "./arunit2-config.js";

describe("arunit2-config", () => {
  it("arunitDatabaseNames spells the two databases as expand_config does", () => {
    expect(arunitDatabaseNames("activerecord_unittest")).toEqual({
      arunit: "activerecord_unittest",
      arunit2: "activerecord_unittest2",
    });
  });

  it("carries the worker isolation slot into the arunit2 database name", () => {
    expect(arunitDatabaseNames("activerecord_unittest_3")).toEqual({
      arunit: "activerecord_unittest_3",
      arunit2: "activerecord_unittest2_3",
    });
    expect(arunitDatabaseNames("activerecord_unittest_32").arunit2).toBe(
      "activerecord_unittest2_32",
    );
  });
});
