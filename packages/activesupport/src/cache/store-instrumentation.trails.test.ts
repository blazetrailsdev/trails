import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store.js";
import { WriteOptions, type StoreOptions } from "./store.js";
import { Notifications } from "../notifications.js";
import type { Event } from "../notifications/instrumenter.js";

describe("Cache::Store instrumentation", () => {
  let cache: MemoryStore;

  beforeEach(async () => {
    cache = new MemoryStore();
  });

  async function withInstrumentation(operation: string, block: () => unknown): Promise<Event[]> {
    const eventName = `cache_${operation}.active_support`;

    const events: Event[] = [];
    try {
      Notifications.subscribe(eventName, (event) => events.push(event));
      await block();
      return events;
    } finally {
      Notifications.unsubscribe(eventName);
    }
  }

  const normalizedKey = (key: string, options?: StoreOptions): string =>
    (
      cache as unknown as { normalizeKey(key: string, options?: StoreOptions): string }
    ).normalizeKey(key, options);

  it("fetchMulti extracts a trailing options hash before instrumenting", async () => {
    const events = await withInstrumentation("read_multi", async () => {
      await cache.fetchMulti("a", "b", { namespace: "foo" }, (key) => `${key}${key}`);
    });
    const opts = { namespace: "foo" };
    expect(events[0].payload.key).toEqual([normalizedKey("a", opts), normalizedKey("b", opts)]);
    expect(events[0].payload.namespace).toBe("foo");
    expect(await cache.read("a", opts)).toBe("aa");
    expect(await cache.read("[object Object]")).toBeNull();
  });

  it("fetch miss fires cache_read (super_operation fetch) then cache_generate", async () => {
    const read = await withInstrumentation("read", async () => {
      await cache.fetch("1", () => "aaaaaaaaaa");
    });
    expect(read[0].payload.super_operation).toBe("fetch");
    expect(read[0].payload.hit).toBe(false);

    const generate = await withInstrumentation("generate", async () => {
      await cache.fetch("2", () => "bbbbbbbbbb");
    });
    expect(generate.map((e) => e.name)).toEqual(["cache_generate.active_support"]);
    expect(generate[0].payload.key).toBe(normalizedKey("2"));
  });

  it("fetch hit fires cache_fetch_hit.active_support with the raw name", async () => {
    await cache.write("1", "aaaaaaaaaa");
    const events = await withInstrumentation("fetch_hit", async () => {
      await cache.fetch("1", () => "bbbbbbbbbb");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_fetch_hit.active_support"]);
    expect(events[0].payload.key).toBe("1");
  });

  it("exist? fires cache_exist?.active_support with the normalized key", async () => {
    await cache.write("1", "aaaaaaaaaa");
    const events = await withInstrumentation("exist?", async () => {
      await cache.exist("1");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_exist?.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey("1"));
  });

  it("fetch with block receiving write options", async () => {
    let capturedOpts: WriteOptions | undefined;
    await cache.fetch("foo", (_key, opts) => ((capturedOpts = opts), "v"));
    expect(capturedOpts).toBeInstanceOf(WriteOptions);
  });
});
