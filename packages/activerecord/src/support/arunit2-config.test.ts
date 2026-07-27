import { describe, expect, it } from "vitest";
import { arunitDatabaseNames } from "./arunit2-config.js";

describe("arunit2-config", () => {
  it("arunitDatabaseNames suffixes the primary database name", () => {
    expect(arunitDatabaseNames("rails_js_test")).toEqual({
      arunit: "rails_js_test_arunit",
      arunit2: "rails_js_test_arunit2",
    });
  });

  it("carries the worker isolation slot into the arunit2 database name", () => {
    expect(arunitDatabaseNames("rails_js_test_3").arunit2).toBe("rails_js_test_3_arunit2");
  });
});
