import { describe, it, expect } from "vitest";
import { lookupStore } from "../../lib/cache.js";
import { ActiveSupport } from "../../lib/namespaces.js";
import { MemoryStore } from "../../lib/cache/memory-store.js";
import { NullStore } from "../../lib/cache/null-store.js";
import { FileStore } from "../../lib/cache/file-store.js";

describe("cache store lookup (trails-only)", () => {
  it("resolves the stores this package ships", () => {
    expect(lookupStore(":memory_store")).toBeInstanceOf(MemoryStore);
    expect(lookupStore(":null_store")).toBeInstanceOf(NullStore);
    expect(lookupStore(":file_store", "tmp/cache")).toBeInstanceOf(FileStore);
  });

  it("resolves a store seated on ActiveSupport.Cache from outside this package", () => {
    class MyOwnStore extends NullStore {}
    (ActiveSupport.Cache as Record<string, unknown>).MyOwnStore = MyOwnStore;

    expect(lookupStore(":my_own_store")).toBeInstanceOf(MyOwnStore);
  });

  it("raises Ruby's rescued LoadError message for an unregistered store", () => {
    expect(() => lookupStore(":no_such_store")).toThrow(
      "Could not find cache store adapter for no_such_store " +
        "(cannot load such file -- active_support/cache/no_such_store)",
    );
  });
});
