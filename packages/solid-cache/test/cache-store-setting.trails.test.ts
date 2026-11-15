import { describe, expect, it } from "vitest";
import { lookupStore } from "@blazetrails/activesupport/cache";
import { Store } from "../lib/index.js";
import { useSolidCache, waitForBackgroundTasks } from "./support/test-helper.js";

describe("CacheStoreSettingTest", () => {
  useSolidCache();

  it("solid cache store", async () => {
    const store = lookupStore(":solid_cache_store", { namespace: "lookup" });
    expect(store).toBeInstanceOf(Store);
    await waitForBackgroundTasks(store as Store);
  });
});
