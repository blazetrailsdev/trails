import { describe, it, expect } from "vitest";
import { resolveStore } from "./resolve-store.js";
import { CookieStore } from "./cookie-store.js";
import { CacheStore } from "./cache-store.js";
import { MemCacheStore } from "./mem-cache-store.js";
import { AbstractStore } from "./abstract-store.js";

describe("ActionDispatch::Session.resolve_store", () => {
  it("resolves the autoloaded session store constants", () => {
    expect(resolveStore(":cookie_store")).toBe(CookieStore);
    expect(resolveStore(":cache_store")).toBe(CacheStore);
    expect(resolveStore(":mem_cache_store")).toBe(MemCacheStore);
    expect(resolveStore(":abstract_store")).toBe(AbstractStore);
  });

  it("raises a NameError-shaped message for an undefined store", () => {
    expect(() => resolveStore(":nonexistent_store")).toThrow(
      /Unable to resolve session store :nonexistent_store/,
    );
    expect(() => resolveStore(":nonexistent_store")).toThrow(
      /resolves to ActionDispatch::Session::NonexistentStore/,
    );
  });
});
