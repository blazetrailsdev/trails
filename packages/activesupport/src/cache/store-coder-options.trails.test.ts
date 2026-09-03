import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store.js";
import { Entry } from "./entry.js";

describe("Store coder options", () => {
  it("keeps an explicit compress_threshold of 0", () => {
    const store = new MemoryStore({ compress: true, compressThreshold: 0 });
    expect(store.options.compressThreshold).toBe(0);
  });

  it("installs the passthrough serializer for an explicit nil coder", () => {
    const store = new MemoryStore({ coder: null });
    store.write("foo", { a: 1 });
    const data = (store as unknown as { data: Map<string, Entry> }).data;
    expect(data.get("foo")).toBeInstanceOf(Entry);
    expect(store.read("foo")).toEqual({ a: 1 });
  });
});
