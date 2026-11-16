import { NotImplementedError, SecureRandom } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import type { Store } from "../lib/index.js";
import { useSolidCache } from "./support/test-helper.js";

describe("DeleteMatchedTest", () => {
  const host = useSolidCache();
  let cache: Store;

  beforeEach(() => {
    cache = host.lookupStore({ expiresIn: 60 });
  });

  it("delete matched raises a NotImplementedError", async () => {
    const prefix = SecureRandom.hex();
    await expect(cache.deleteMatched(`${prefix}%`)).rejects.toThrow(NotImplementedError);
  });
});
