import { describe, expect, it } from "vitest";
import { constGet } from "@blazetrails/ruby-compat";
import { Store, lookupStore } from "./cache.js";

describe("ActiveSupport::Cache seat", () => {
  it("walks ActiveSupport::Cache::Store from the top level", () => {
    expect(constGet(Object, "ActiveSupport::Cache::Store")).toBe(Store);
    expect((constGet(Object, "ActiveSupport::Cache") as { lookupStore: unknown }).lookupStore).toBe(
      lookupStore,
    );
  });
});
