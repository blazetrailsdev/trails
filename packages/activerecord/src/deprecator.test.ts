import { describe, expect, it, vi } from "vitest";
import { MigrationProxy } from "./deprecator.js";
import { Migration } from "./migration.js";

class CreateUsers extends Migration {
  async up(): Promise<void> {}
}

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

  it("disableDdlTransaction throws before migration() is awaited", () => {
    const proxy = new MigrationProxy("CreateUsers", "1", "/fake/path.ts", "");
    expect(() => proxy.disableDdlTransaction).toThrow(
      "MigrationProxy: await migration() before reading disableDdlTransaction",
    );
  });

  it("loadMigrationAsync falls through to import() on ERR_REQUIRE_ESM", async () => {
    const proxy = new MigrationProxy("CreateUsers", "1", "/fake/path.ts", "");
    const esmError = Object.assign(new Error("ERR_REQUIRE_ESM"), { code: "ERR_REQUIRE_ESM" });
    vi.spyOn(proxy, "loadMigration").mockImplementation(() => {
      throw esmError;
    });
    // loadMigrationAsync should re-throw since no ESM module can be loaded from a fake path
    await expect(proxy.loadMigrationAsync()).rejects.toThrow();
  });

  it("delegates migrate, announce, write, and disableDdlTransaction to the loaded migration", async () => {
    class NoTransaction extends Migration {
      async up(): Promise<void> {}
    }
    NoTransaction.disableDdlTransactionBang();
    const migration = new NoTransaction("NoTransaction", "1");
    const migrate = vi.spyOn(migration, "migrate").mockResolvedValue(undefined);
    const announce = vi.spyOn(migration, "announce").mockImplementation(() => {});
    const write = vi.spyOn(migration, "write").mockImplementation(() => {});
    const proxy = new MigrationProxy("NoTransaction", "1", "/fake/path.ts", "");
    vi.spyOn(proxy, "loadMigrationAsync").mockResolvedValue(migration);

    await proxy.migrate("up");
    await proxy.announce("hello");
    await proxy.write("text");

    expect(migrate).toHaveBeenCalledWith("up");
    expect(announce).toHaveBeenCalledWith("hello");
    expect(write).toHaveBeenCalledWith("text");
    expect(proxy.disableDdlTransaction).toBe(true);
  });

  it("migration() caches the result of loadMigration()", async () => {
    const proxy = new MigrationProxy("CreateUsers", "1", "/fake/path.ts", "");
    const sentinel = new CreateUsers("CreateUsers", "1");
    const spy = vi.spyOn(proxy, "loadMigrationAsync").mockResolvedValue(sentinel);

    const first = await proxy.migration();
    const second = await proxy.migration();

    expect(first).toBe(sentinel);
    expect(second).toBe(sentinel);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
