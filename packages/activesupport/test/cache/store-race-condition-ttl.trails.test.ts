import { beforeEach, describe, expect, it } from "vitest";
import { Duration } from "../../lib/duration.js";
import { MemoryStore } from "../../lib/cache/memory-store.js";

describe("Store#handle_expired_entry reads race_condition_ttl with to_i", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  async function staleSeenDuringRegen(raceConditionTtl: unknown): Promise<unknown> {
    await store.write("foo", "stale", { expiresIn: 0.02 });
    await new Promise((r) => setTimeout(r, 30));
    let seen: unknown;
    await store.fetch("foo", { raceConditionTtl }, async () => {
      seen = await store.read("foo");
      return "fresh";
    });
    return seen;
  }

  it("coerces a Duration through Duration#to_i", async () => {
    expect(await staleSeenDuringRegen(Duration.seconds(10))).toBe("stale");
  });

  it("truncates a Float below one second to zero", async () => {
    expect(await staleSeenDuringRegen(0.5)).toBeNull();
  });

  it("reads an absent option as nil.to_i", async () => {
    expect(await staleSeenDuringRegen(undefined)).toBeNull();
  });
});
