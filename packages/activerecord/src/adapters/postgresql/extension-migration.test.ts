/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/extension_migration_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Migration } from "../../index.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.disableExtension("citext", { force: "cascade" });
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS test_citext_tbl").catch(() => {});
    await adapter.disableExtension("citext", { force: "cascade" }).catch(() => {});
    await adapter.close();
  });

  describe("PostgresqlExtensionMigrationTest", () => {
    it("enable extension", async () => {
      class EnableCitext extends Migration {
        async change() {
          await this.enableExtension("citext");
        }
      }
      await new EnableCitext().run(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBe(true);
    });
    it("disable extension", async () => {
      await adapter.enableExtension("citext");
      class DisableCitext extends Migration {
        async change() {
          await this.disableExtension("citext", { force: "cascade" });
        }
      }
      await new DisableCitext().run(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBe(false);
    });
    it("enable extension idempotent", async () => {
      class EnableCitext extends Migration {
        async change() {
          await this.enableExtension("citext");
        }
      }
      const m = new EnableCitext();
      await m.run(adapter, "up");
      await expect(m.run(adapter, "up")).resolves.toBeUndefined();
      expect(await adapter.extensionEnabled("citext")).toBe(true);
    });
    it("disable extension idempotent", async () => {
      class DisableCitext extends Migration {
        async change() {
          await this.disableExtension("citext", { force: "cascade" });
        }
      }
      const m = new DisableCitext();
      await m.run(adapter, "up");
      await expect(m.run(adapter, "up")).resolves.toBeUndefined();
      expect(await adapter.extensionEnabled("citext")).toBe(false);
    });
    it("extension schema dump", async () => {
      class EnableCitext extends Migration {
        async change() {
          await this.enableExtension("citext");
        }
      }
      await new EnableCitext().run(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBe(true);
      const dump = await adapter.createSchemaDumper({}).dump();
      expect(dump).toContain(`enable_extension "citext"`);
    });
    it("enable extension migration ignores prefix and suffix", async () => {
      // Rails: table_name_prefix/suffix don't affect extension names
      // TS: same — extension names pass through unmodified
      class EnableCitext extends Migration {
        async change() {
          await this.enableExtension("citext");
        }
      }
      await new EnableCitext().run(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBe(true);
    });
    it("enable extension migration with schema", async () => {
      // Rails: enable_extension "other_schema.hstore" creates it in that schema
      // Our adapter parses schema-qualified names: "public.citext" → SCHEMA public
      class EnableCitext extends Migration {
        async change() {
          await this.enableExtension("public.citext");
        }
      }
      const m = new EnableCitext();
      await m.run(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBe(true);
      // Down must strip schema and call DROP EXTENSION IF EXISTS "citext" (not "public.citext")
      await m.run(adapter, "down");
      expect(await adapter.extensionEnabled("citext")).toBe(false);
    });
    it("disable extension migration ignores prefix and suffix", async () => {
      await adapter.enableExtension("citext");
      class DisableCitext extends Migration {
        async change() {
          await this.disableExtension("citext", { force: "cascade" });
        }
      }
      await new DisableCitext().run(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBe(false);
    });
    it("disable extension raises when dependent objects exist", async () => {
      await adapter.enableExtension("citext");
      await adapter.execute(`CREATE TABLE test_citext_tbl (id SERIAL PRIMARY KEY, data CITEXT)`);
      await expect(adapter.disableExtension("citext")).rejects.toThrow();
      await adapter.execute("DROP TABLE test_citext_tbl");
    });
    it("disable extension drops extension when cascading", async () => {
      await adapter.enableExtension("citext");
      await adapter.execute(`CREATE TABLE test_citext_tbl (id SERIAL PRIMARY KEY, data CITEXT)`);
      await adapter.disableExtension("citext", { force: "cascade" });
      expect(await adapter.extensionEnabled("citext")).toBe(false);
    });
  });
});
