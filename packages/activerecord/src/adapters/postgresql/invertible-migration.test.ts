/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/invertible_migration_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Migration } from "../../index.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS enums").catch(() => {});
    await adapter.execute("DROP TABLE IF EXISTS settings").catch(() => {});
    await adapter.execute("DROP TABLE IF EXISTS bars").catch(() => {});
    await adapter.execute("DROP TABLE IF EXISTS foos").catch(() => {});
    await adapter.dropEnum("color", { ifExists: true }).catch(() => {});
    await adapter.close();
  });

  describe("PostgresqlInvertibleMigrationTest", () => {
    it.skip("up", async () => {
      // BLOCKED: migration — Migrator infrastructure (schema_migration, Migrator.new) not yet wired for PG
    });
    it.skip("down", async () => {
      // BLOCKED: migration — Migrator infrastructure (schema_migration, Migrator.new) not yet wired for PG
    });
    it.skip("change", async () => {
      // BLOCKED: migration — Migrator infrastructure (schema_migration, Migrator.new) not yet wired for PG
    });
    it.skip("revert", async () => {
      // BLOCKED: migration — Migrator infrastructure (schema_migration, Migrator.new) not yet wired for PG
    });
    it.skip("revert whole migration", async () => {
      // BLOCKED: migration — Migrator infrastructure (schema_migration, Migrator.new) not yet wired for PG
    });
    it("migrate and revert", async () => {
      class CreateHorses extends Migration {
        async change() {
          await this.createTable("settings", (t) => {
            t.integer("value");
          });
        }
      }
      const m = new CreateHorses();
      await m.run(adapter, "up");
      expect(await adapter.tableExists("settings")).toBe(true);
      await m.run(adapter, "down");
      expect(await adapter.tableExists("settings")).toBe(false);
    });
    it.skip("migrate revert add index with expression", () => {
      // BLOCKED: migration — expression index reversal requires CommandRecorder inversion for non-name indexes
    });
    it("migrate revert create enum", async () => {
      class CreateEnumMig extends Migration {
        async change() {
          await this.createEnum("color", ["blue", "green"]);
          await this.createTable("enums");
        }
      }
      const m = new CreateEnumMig();
      await m.run(adapter, "up");
      // Add an actual enum-typed column so reversal must drop the table before
      // dropping the enum type (otherwise DROP TYPE fails with dependency error)
      await adapter.execute(
        `ALTER TABLE enums ADD COLUMN best_color color NOT NULL DEFAULT 'blue'`,
      );
      const enumsBefore = await adapter.enumTypes();
      expect(enumsBefore.some(([name]) => name === "color")).toBe(true);

      // Down: drops table first (containing enum column), then drops enum type
      await m.run(adapter, "down");
      const enumsAfter = await adapter.enumTypes();
      expect(enumsAfter.some(([name]) => name === "color")).toBe(false);
      expect(await adapter.tableExists("enums")).toBe(false);
    });
    it("migrate revert drop enum", async () => {
      await adapter.createEnum("color", ["blue", "green"]);

      class DropEnumMig extends Migration {
        async change() {
          await this.dropEnum("color", ["blue", "green"], { ifExists: true });
        }
      }
      const m = new DropEnumMig();
      await m.run(adapter, "up");
      const enumsAfterDrop = await adapter.enumTypes();
      expect(enumsAfterDrop.some(([name]) => name === "color")).toBe(false);

      await m.run(adapter, "down");
      const enumsRestored = await adapter.enumTypes();
      expect(enumsRestored.some(([name]) => name === "color")).toBe(true);
    });
    it("migrate revert rename enum value", async () => {
      await adapter.createEnum("color", ["blue", "green"]);

      class RenameEnumMig extends Migration {
        async change() {
          await this.renameEnumValue("color", { from: "blue", to: "red" });
        }
      }
      const m = new RenameEnumMig();
      await m.run(adapter, "up");
      const afterRename = await adapter.enumTypes();
      const colorValues = afterRename.find(([name]) => name === "color")?.[1] ?? [];
      expect(colorValues).toContain("red");
      expect(colorValues).not.toContain("blue");

      await m.run(adapter, "down");
      const afterRevert = await adapter.enumTypes();
      const revertedValues = afterRevert.find(([name]) => name === "color")?.[1] ?? [];
      expect(revertedValues).toContain("blue");
      expect(revertedValues).not.toContain("red");
    });
    it("migrate revert add and validate check constraint", async () => {
      await adapter.execute(`CREATE TABLE settings (id SERIAL PRIMARY KEY, value INTEGER)`);

      class AddAndValidateCheckMig extends Migration {
        async change() {
          await this.addCheckConstraint("settings", "value >= 0", {
            name: "positive_value",
            validate: false,
          });
          await this.validateCheckConstraint("settings", { name: "positive_value" });
        }
      }
      const m = new AddAndValidateCheckMig();
      await m.run(adapter, "up");
      const before = await adapter.checkConstraints("settings");
      expect(before.some((c: any) => c.name === "positive_value")).toBe(true);

      await m.run(adapter, "down");
      const after = await adapter.checkConstraints("settings");
      expect(after.some((c: any) => c.name === "positive_value")).toBe(false);
    });
    it("migrate revert add and validate foreign key", async () => {
      await adapter.execute(`CREATE TABLE foos (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE bars (id SERIAL PRIMARY KEY, foo_id INTEGER)`);

      class AddAndValidateFKMig extends Migration {
        async change() {
          await this.addForeignKey("bars", "foos", {
            column: "foo_id",
            name: "fk_bars_foos",
            validate: false,
          });
          await this.validateForeignKey("bars", "foos", { name: "fk_bars_foos" });
        }
      }
      const m = new AddAndValidateFKMig();
      await m.run(adapter, "up");
      expect(await adapter.foreignKeyExists("bars", "foos")).toBe(true);

      await m.run(adapter, "down");
      expect(await adapter.foreignKeyExists("bars", "foos")).toBe(false);
    });
  });
});
