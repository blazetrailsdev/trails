import { describe, it, expect } from "vitest";
import { lookupStore } from "../../lib/cache.js";
import { registerStoreClass } from "../../lib/cache/store-registry.js";
import { MemoryStore } from "../../lib/cache/memory-store.js";
import { NullStore } from "../../lib/cache/null-store.js";
import { FileStore } from "../../lib/cache/file-store.js";

describe("cache store registry (trails-only)", () => {
  it("resolves the stores this package ships", () => {
    expect(lookupStore(":memory_store")).toBeInstanceOf(MemoryStore);
    expect(lookupStore(":null_store")).toBeInstanceOf(NullStore);
    expect(lookupStore(":file_store", "tmp/cache")).toBeInstanceOf(FileStore);
  });

  it("resolves a store registered from outside this package", () => {
    class MyOwnStore extends NullStore {}
    registerStoreClass(":my_own_store", MyOwnStore);

    expect(lookupStore(":my_own_store")).toBeInstanceOf(MyOwnStore);
  });

  it("raises Ruby's rescued LoadError message for an unregistered store", () => {
    expect(() => lookupStore(":no_such_store")).toThrow(
      "Could not find cache store adapter for no_such_store " +
        "(cannot load such file -- active_support/cache/no_such_store)",
    );
  });
});
