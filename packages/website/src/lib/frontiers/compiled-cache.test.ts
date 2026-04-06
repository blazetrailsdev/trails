import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsAdapter } from "./sql-js-adapter.js";
import { CompiledCache } from "./compiled-cache.js";

describe("CompiledCache", () => {
  let adapter: SqlJsAdapter;
  let cache: CompiledCache;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    adapter = new SqlJsAdapter(db);
    cache = new CompiledCache(adapter);
  });

  it("returns null for missing entry", () => {
    expect(cache.get("app/models/user.ts")).toBeNull();
    expect(cache.getSourceHash("app/models/user.ts")).toBeNull();
  });

  it("stores and retrieves compiled JS", () => {
    cache.set("app/models/user.ts", "export class User {}", "abc123");
    expect(cache.get("app/models/user.ts")).toBe("export class User {}");
  });

  it("stores and retrieves source hash", () => {
    cache.set("app/models/user.ts", "export class User {}", "abc123");
    expect(cache.getSourceHash("app/models/user.ts")).toBe("abc123");
  });

  it("upserts on duplicate path", () => {
    cache.set("app/models/user.ts", "v1", "hash1");
    cache.set("app/models/user.ts", "v2", "hash2");
    expect(cache.get("app/models/user.ts")).toBe("v2");
    expect(cache.getSourceHash("app/models/user.ts")).toBe("hash2");
  });

  it("deletes an entry", () => {
    cache.set("app/models/user.ts", "code", "hash");
    cache.delete("app/models/user.ts");
    expect(cache.get("app/models/user.ts")).toBeNull();
  });

  it("handles single quotes in content", () => {
    cache.set("file.ts", "const x = 'hello'", "h");
    expect(cache.get("file.ts")).toBe("const x = 'hello'");
  });

  it("handles single quotes in path", () => {
    cache.set("it's-a-file.ts", "code", "h");
    expect(cache.get("it's-a-file.ts")).toBe("code");
  });
});
