import { StandardError } from "@blazetrails/ruby-compat";
import { assertRaises } from "@blazetrails/activesupport";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Migration } from "../../index.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    await adapter.disableExtension("citext", { force: "cascade" });
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS test_citext_tbl").catch(() => {});
    await adapter.disableExtension("citext", { force: "cascade" }).catch(() => {});
    await adapter.disconnectBang();
  });

  describe("PostgresqlExtensionMigrationTest", () => {
    it("enable extension migration ignores prefix and suffix", async () => {
      class EnableCitext extends Migration.Current {
        async change() {
          await this.enableExtension("citext");
        }
      }
      await new EnableCitext().execMigration(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBeTruthy();
    });
    it("enable extension migration with schema", async () => {
      class EnableCitext extends Migration.Current {
        async change() {
          await this.enableExtension("public.citext");
        }
      }
      await new EnableCitext().execMigration(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBeTruthy();
    });
    it("disable extension migration ignores prefix and suffix", async () => {
      await adapter.enableExtension("citext");
      class DisableCitext extends Migration.Current {
        async change() {
          await this.disableExtension("citext", { force: "cascade" });
        }
      }
      await new DisableCitext().execMigration(adapter, "up");
      expect(await adapter.extensionEnabled("citext")).toBeFalsy();
    });
    it("disable extension raises when dependent objects exist", async () => {
      await adapter.enableExtension("citext");
      await adapter.execute(`CREATE TABLE test_citext_tbl (id SERIAL PRIMARY KEY, data CITEXT)`);
      const error = await assertRaises([StandardError], {}, async () => {
        await adapter.disableExtension("citext");
      });
      expect(error.message).toMatch(
        /cannot drop extension citext because other objects depend on it/i,
      );
      await adapter.execute("DROP TABLE test_citext_tbl");
    });
    it("disable extension drops extension when cascading", async () => {
      await adapter.enableExtension("citext");
      await adapter.execute(`CREATE TABLE test_citext_tbl (id SERIAL PRIMARY KEY, data CITEXT)`);
      await adapter.disableExtension("citext", { force: "cascade" });
      expect(await adapter.extensionEnabled("citext")).toBeFalsy();
    });
  });
});
