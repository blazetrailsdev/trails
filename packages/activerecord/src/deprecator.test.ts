import { describe, expect, it, vi } from "vitest";
import { MigrationProxy } from "./deprecator.js";

describe("MigrationProxy", () => {
  it("stores name, version, filename, scope", () => {
    const proxy = new MigrationProxy(
      "CreateUsers",
      "20240101000000",
      "/db/migrate/20240101000000_create_users.ts",
      "",
    );
    expect(proxy.name).toBe("CreateUsers");
    expect(proxy.version).toBe("20240101000000");
    expect(proxy.filename).toBe("/db/migrate/20240101000000_create_users.ts");
    expect(proxy.scope).toBe("");
  });

  it("basename returns the filename basename", () => {
    const proxy = new MigrationProxy(
      "CreateUsers",
      "1",
      "/db/migrate/20240101000000_create_users.ts",
      "",
    );
    expect(proxy.basename()).toBe("20240101000000_create_users.ts");
  });

  it("migration() caches the result of loadMigration()", () => {
    const proxy = new MigrationProxy("CreateUsers", "1", "/fake/path.ts", "");
    const sentinel = {};
    const spy = vi.spyOn(proxy, "loadMigration").mockReturnValue(sentinel);

    const first = proxy.migration();
    const second = proxy.migration();

    expect(first).toBe(sentinel);
    expect(second).toBe(sentinel);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
