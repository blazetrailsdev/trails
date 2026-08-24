import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { fixtures } from "../test-fixtures.js";
import { templateSchemaCache } from "./schema-cache-dump.js";

describe("templateSchemaCache", () => {
  fixtures({});

  it("carries the canonical schema globalSetup laid, so the per-file warm needs no reflection", () => {
    const cache = templateSchemaCache();
    expect(cache).not.toBeNull();
    expect(cache!.size).not.toBe(0);
    expect(cache!.getCachedColumnsHash("topics")).toHaveProperty("title");
    expect(cache!.getCachedPrimaryKeys("topics")).toBe("id");
  });

  it("is what the warm left in the pool's cache", () => {
    const live = Base.connection.internalSchemaCache;
    const dumped = templateSchemaCache()!;
    expect(Object.keys(live.getCachedColumnsHash("posts") ?? {})).toEqual(
      Object.keys(dumped.getCachedColumnsHash("posts") ?? {}),
    );
  });
});
