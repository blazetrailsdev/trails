import { describe, expect, it, beforeEach } from "vitest";
import { RailsMetaStore } from "../../../lib/action-dispatch/http/rack-cache.js";

class ReadWriteHash {
  [key: string]: unknown;

  read(key: string): unknown {
    return Object.hasOwn(this, key) ? this[key] : null;
  }

  write(key: string, value: unknown): unknown {
    return (this[key] = value);
  }
}

describe("RackCacheMetaStoreTest", () => {
  let store: {
    read(key: string): Promise<Record<string, string>>;
    write(key: string, value: unknown): Promise<unknown>;
  };

  beforeEach(() => {
    store = new RailsMetaStore(new ReadWriteHash()) as unknown as typeof store;
  });

  it("stuff is deep duped", async () => {
    await store.write("foo", { bar: "original" });
    let hash = await store.read("foo");
    hash.bar = "changed";
    hash = await store.read("foo");
    expect(hash.bar).toBe("original");
  });
});
