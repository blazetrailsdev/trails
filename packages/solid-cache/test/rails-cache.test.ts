import { lookupStore } from "@blazetrails/activesupport/cache";
import { TopLevel } from "@blazetrails/activesupport";
import { beforeAll, describe, expect, it } from "vitest";
import type { Store } from "../lib/index.js";
import { useSolidCache } from "./support/test-helper.js";

describe("RailsCacheTest", () => {
  useSolidCache();

  beforeAll(() => {
    TopLevel.Trails!.cache = lookupStore(":solid_cache_store");
  });

  it("reads cache yml config", () => {
    expect((TopLevel.Trails!.cache as Store).maxAge).toBe(3600);
  });
});
