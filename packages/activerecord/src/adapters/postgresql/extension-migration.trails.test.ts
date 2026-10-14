import { StringIO } from "@blazetrails/ruby-compat";
import { it, expect, beforeEach, afterEach } from "vitest";
import { Migration } from "../../index.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresqlExtensionMigrationTest (trails)", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    await adapter.disableExtension("citext", { force: "cascade" });
  });
  afterEach(async () => {
    await adapter.disableExtension("citext", { force: "cascade" }).catch(() => {});
    await adapter.disconnectBang();
  });

  it("enable extension idempotent", async () => {
    class EnableCitext extends Migration.Current {
      async change() {
        await this.enableExtension("citext");
      }
    }
    const m = new EnableCitext();
    await m.execMigration(adapter, "up");
    await expect(m.execMigration(adapter, "up")).resolves.toBeUndefined();
    expect(await adapter.extensionEnabled("citext")).toBe(true);
  });

  it("disable extension idempotent", async () => {
    class DisableCitext extends Migration.Current {
      async change() {
        await this.disableExtension("citext", { force: "cascade" });
      }
    }
    const m = new DisableCitext();
    await m.execMigration(adapter, "up");
    await expect(m.execMigration(adapter, "up")).resolves.toBeUndefined();
    expect(await adapter.extensionEnabled("citext")).toBe(false);
  });

  it("extension schema dump", async () => {
    class EnableCitext extends Migration.Current {
      async change() {
        await this.enableExtension("citext");
      }
    }
    await new EnableCitext().execMigration(adapter, "up");
    expect(await adapter.extensionEnabled("citext")).toBe(true);
    const dump = (await adapter.createSchemaDumper({}).dump(new StringIO())).string();
    expect(dump).toContain(`await ctx.enableExtension("citext");`);
  }, 60000);
});
