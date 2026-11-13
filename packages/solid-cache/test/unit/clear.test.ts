import { describe, expect, it } from "vitest";
import { Entry, Record, type Store } from "../../lib/index.js";
import { useSolidCache } from "../support/test-helper.js";

describe("ClearTest", () => {
  const host = useSolidCache();

  async function writeValues(cache: Store): Promise<void> {
    for (let i = 0; i < 20; i++) await cache.write(`key${i}`, `value${i}`);
  }

  async function uncachedEntryCount(): Promise<number> {
    let count = 0;
    await Record.eachShard(async () => {
      count += await Entry.uncached(() => Entry.count());
    });
    return count;
  }

  it("clear by truncation", async () => {
    const cache = host.lookupStore({ expiresIn: 60, clearWith: "truncate" });
    await writeValues(cache);

    await cache.clear();

    expect(cache.clearWith).toBe("truncate");
    expect(await uncachedEntryCount()).toBe(0);
  });

  it("clear by deletion", async () => {
    const cache = host.lookupStore({ expiresIn: 60, clearWith: "delete" });
    await writeValues(cache);

    await cache.clear();

    expect(cache.clearWith).toBe("delete");
    expect(await uncachedEntryCount()).toBe(0);
  });
});
