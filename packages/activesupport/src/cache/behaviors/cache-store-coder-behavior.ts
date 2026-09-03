import { expect, it } from "vitest";
import { Entry } from "../entry.js";
import { coder } from "../coder.js";
import type { Store, StoreOptions } from "../store.js";
import { assertSame } from "../../testing/assertions.js";

class SpyCoder {
  dumpedEntries: Entry[] = [];
  loadedEntries: Entry[] = [];
  dumpCompressedEntries: Entry[] = [];

  dump(entry: Entry): string {
    this.dumpedEntries.push(entry);
    return coder.dump(entry.pack());
  }

  load(payload: string): Entry {
    const entry = Entry.unpack(coder.load(payload) as unknown[]);
    this.loadedEntries.push(entry);
    return entry;
  }

  dumpCompressed(entry: Entry, threshold: number): string {
    if (threshold === 0) {
      this.dumpCompressedEntries.push(entry);
      return coder.dump(entry.pack());
    } else {
      return this.dump(entry);
    }
  }
}

function serializeEntry(store: Store, entry: Entry): unknown {
  return (store as unknown as { serializeEntry(entry: Entry): unknown }).serializeEntry(entry);
}

/** @internal */
export interface CacheStoreCoderBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function cacheStoreCoderBehavior(host: CacheStoreCoderBehaviorHost): void {
  it("coder receive the entry on write", () => {
    const coder = new SpyCoder();
    const store = host.lookupStore({ coder });
    store.write("foo", "bar");
    expect(coder.dumpedEntries.length).toBe(1);
    const entry = coder.dumpedEntries[0];
    expect(entry).toBeInstanceOf(Entry);
    expect(entry.value).toBe("bar");
  });

  it("coder receive the entry on read", () => {
    const coder = new SpyCoder();
    const store = host.lookupStore({ coder });
    store.write("foo", "bar");
    store.read("foo");
    expect(coder.loadedEntries.length).toBe(1);
    const entry = coder.loadedEntries[0];
    expect(entry).toBeInstanceOf(Entry);
    expect(entry.value).toBe("bar");
  });

  it("coder receive the entry on read multi", () => {
    const coder = new SpyCoder();
    const store = host.lookupStore({ coder });
    store.writeMulti({ foo: "bar", egg: "spam" });
    store.readMulti("foo", "egg");
    expect(coder.loadedEntries.length).toBe(2);
    let entry = coder.loadedEntries[0];
    expect(entry).toBeInstanceOf(Entry);
    expect(entry.value).toBe("bar");

    entry = coder.loadedEntries[1];
    expect(entry).toBeInstanceOf(Entry);
    expect(entry.value).toBe("spam");
  });

  it("coder receive the entry on write multi", () => {
    const coder = new SpyCoder();
    const store = host.lookupStore({ coder });
    store.writeMulti({ foo: "bar", egg: "spam" });
    expect(coder.dumpedEntries.length).toBe(2);
    let entry = coder.dumpedEntries[0];
    expect(entry).toBeInstanceOf(Entry);
    expect(entry.value).toBe("bar");

    entry = coder.dumpedEntries[1];
    expect(entry).toBeInstanceOf(Entry);
    expect(entry.value).toBe("spam");
  });

  it("coder does not receive the entry on read miss", () => {
    const coder = new SpyCoder();
    const store = host.lookupStore({ coder });
    store.read("foo");
    expect(coder.loadedEntries.length).toBe(0);
  });

  it("nil coder bypasses serialization", () => {
    const store = host.lookupStore({ coder: null });
    const entry = new Entry("value");
    assertSame(entry, serializeEntry(store, entry));
  });

  it("coder is used during handle expired entry when expired", async () => {
    const coder = new SpyCoder();
    const store = host.lookupStore({ coder });
    store.write("foo", "bar", { expiresIn: 0.05 });
    expect(coder.loadedEntries.length).toBe(0);
    expect(coder.dumpedEntries.length).toBe(1);

    await new Promise((r) => setTimeout(r, 100));

    const val = store.fetch(
      "foo",
      { raceConditionTtl: 5, compress: true, compressThreshold: 0 },
      () => "baz",
    );
    expect(val).toBe("baz");
    expect(coder.loadedEntries.length).toBe(1);
    expect(coder.loadedEntries[0].value).toBe("bar");
    expect(coder.dumpedEntries.length).toBe(1);
    expect(coder.dumpCompressedEntries.length).toBe(2);
    expect(coder.dumpCompressedEntries[0].value).toBe("bar");
    expect(coder.dumpCompressedEntries[coder.dumpCompressedEntries.length - 1].value).toBe("baz");
  });
}
