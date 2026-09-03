import { describe, expect, it, vi } from "vitest";
import { NameError } from "@blazetrails/activesupport";
import { Migration, MigrationProxy } from "./migration.js";

class CreateUsers extends Migration {
  async up(): Promise<void> {}
}

describe("MigrationProxy", () => {
  it("stores name, version, filename, scope", () => {
    const proxy = new MigrationProxy(
      "CreateUsers",
      20240101000000,
      "/db/migrate/20240101000000_create_users.ts",
      "",
    );
    expect(proxy.name).toBe("CreateUsers");
    expect(proxy.version).toBe(20240101000000);
    expect(proxy.filename).toBe("/db/migrate/20240101000000_create_users.ts");
    expect(proxy.scope).toBe("");
  });

  it("basename returns the filename basename", () => {
    const proxy = new MigrationProxy(
      "CreateUsers",
      1,
      "/db/migrate/20240101000000_create_users.ts",
      "",
    );
    expect(proxy.basename()).toBe("20240101000000_create_users.ts");
  });

  it("delegates migrate, announce, write, and disableDdlTransaction to the loaded migration", async () => {
    class NoTransaction extends Migration {
      async up(): Promise<void> {}
    }
    NoTransaction.disableDdlTransactionBang();
    const migration = new NoTransaction("NoTransaction", 1);
    const migrate = vi.spyOn(migration, "migrate").mockResolvedValue(undefined);
    const announce = vi.spyOn(migration, "announce").mockImplementation(() => {});
    const write = vi.spyOn(migration, "write").mockImplementation(() => {});
    const proxy = new MigrationProxy("NoTransaction", 1, "/fake/path.ts", "");
    vi.spyOn(proxy, "loadMigration").mockResolvedValue(migration);

    await proxy.migrate("up");
    await proxy.announce("hello");
    await proxy.write("text");

    expect(migrate).toHaveBeenCalledWith("up");
    expect(announce).toHaveBeenCalledWith("hello");
    expect(write).toHaveBeenCalledWith("text");
    await expect(proxy.disableDdlTransaction()).resolves.toBe(true);
  });

  it("migration() caches the result of loadMigration()", async () => {
    const proxy = new MigrationProxy("CreateUsers", 1, "/fake/path.ts", "");
    const sentinel = new CreateUsers("CreateUsers", 1);
    const spy = vi.spyOn(proxy, "loadMigration").mockResolvedValue(sentinel);

    const first = await proxy.migration();
    const second = await proxy.migration();

    expect(first).toBe(sentinel);
    expect(second).toBe(sentinel);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("loadMigration raises NameError when the file has no export named after the migration", async () => {
    const filename = new URL(
      "./test-helpers/migrations/valid/1_valid_people_have_last_names.ts",
      import.meta.url,
    ).pathname;
    const proxy = new MigrationProxy("NoSuchMigration", 1, filename, "");
    await expect(proxy.loadMigration()).rejects.toThrow(NameError);
    await expect(proxy.loadMigration()).rejects.toThrow("uninitialized constant NoSuchMigration");
  });

  it("loadMigration instantiates the export named after the migration", async () => {
    const filename = new URL(
      "./test-helpers/migrations/valid/1_valid_people_have_last_names.ts",
      import.meta.url,
    ).pathname;
    const proxy = new MigrationProxy("ValidPeopleHaveLastNames", 1, filename, "");
    const migration = await proxy.loadMigration();
    expect(migration.name).toBe("ValidPeopleHaveLastNames");
    expect(migration.version).toBe(1);
  });
});
