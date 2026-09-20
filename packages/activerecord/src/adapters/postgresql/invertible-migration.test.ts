import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Migration } from "../../index.js";
import type { TableDefinitionOf } from "../../connection-adapters/abstract/schema-definitions.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.dropTable("enums", { ifExists: true }).catch(() => {});
    await adapter.dropTable("settings", { ifExists: true }).catch(() => {});
    await adapter.dropTable("bars", { ifExists: true }).catch(() => {});
    await adapter.dropTable("foos", { ifExists: true }).catch(() => {});
    await adapter.dropEnum("color", { ifExists: true }).catch(() => {});
    await adapter.disconnectBang();
  });

  class ExpressionIndexMigration extends Migration {
    async change() {
      await this.createTable("settings", (t) => {
        t.column("data", "jsonb");
      });

      await this.addIndex("settings", "(data->'foo')", {
        using: "gin",
        name: "index_settings_data_foo",
      });
    }
  }

  class CreateEnumMigration extends Migration {
    async change() {
      await this.createEnum("color", ["blue", "green"]);
      await this.createTable("enums", (t) => {
        (t as unknown as { enum: (...args: unknown[]) => unknown }).enum("bestColor", {
          enumType: "color",
          default: "blue",
          null: false,
        });
      });
    }
  }

  class DropEnumMigration extends Migration {
    async change() {
      await this.dropEnum("color", ["blue", "green"], { ifExists: true });
    }
  }

  class RenameEnumValueMigration extends Migration {
    async change() {
      await this.renameEnumValue("color", { from: "blue", to: "red" });
    }
  }

  class AddAndValidateCheckConstraint extends Migration {
    async change() {
      await this.addCheckConstraint("settings", "value >= 0", {
        name: "positive_value",
        validate: false,
      });
      await this.validateCheckConstraint("settings", { name: "positive_value" });
    }
  }

  class AddAndValidateForeignKey extends Migration {
    async change() {
      await this.addForeignKey("bars", "foos", { validate: false });
      await this.validateForeignKey("bars", "foos");
    }
  }

  describe("PostgresqlInvertibleMigrationTest", () => {
    it("migrate and revert", async () => {
      class CreateHorses extends Migration {
        async change() {
          await this.createTable("settings", (t) => {
            t.integer("value");
          });
        }
      }
      const m = new CreateHorses();
      await m.execMigration(adapter, "up");
      expect(await adapter.tableExists("settings")).toBe(true);
      await m.execMigration(adapter, "down");
      expect(await adapter.tableExists("settings")).toBe(false);
    });

    it("migrate revert add index with expression", async () => {
      await new ExpressionIndexMigration().execMigration(adapter, "up");

      expect(await adapter.tableExists("settings")).toBeTruthy();
      expect(
        await adapter.indexExists("settings", null, { name: "index_settings_data_foo" }),
      ).toBeTruthy();

      await new ExpressionIndexMigration().execMigration(adapter, "down");

      expect(await adapter.tableExists("settings")).toBeFalsy();
      expect(
        await adapter.indexExists("settings", null, { name: "index_settings_data_foo" }),
      ).toBeFalsy();
    });

    it("migrate revert create enum", async () => {
      await new CreateEnumMigration().execMigration(adapter, "up");

      expect(
        await adapter.columnExists("enums", "bestColor", null, { default: "blue", null: false }),
      ).toBeTruthy();
      expect(await adapter.enumTypes()).toEqual([["color", ["blue", "green"]]]);

      await new CreateEnumMigration().execMigration(adapter, "down");

      expect(await adapter.tableExists("enums")).toBeFalsy();
      expect(await adapter.enumTypes()).toEqual([]);
    });

    it("migrate revert drop enum", async () => {
      expect(await adapter.enumTypes()).toEqual([]);

      await expect(new DropEnumMigration().execMigration(adapter, "up")).resolves.not.toThrow();
      expect(await adapter.enumTypes()).toEqual([]);

      await new DropEnumMigration().execMigration(adapter, "down");
      expect(await adapter.enumTypes()).toEqual([["color", ["blue", "green"]]]);
    });

    it("migrate revert rename enum value", async () => {
      await new CreateEnumMigration().execMigration(adapter, "up");
      expect(await adapter.enumTypes()).toEqual([["color", ["blue", "green"]]]);

      await new RenameEnumValueMigration().execMigration(adapter, "up");
      expect(await adapter.enumTypes()).toEqual([["color", ["red", "green"]]]);

      await new RenameEnumValueMigration().execMigration(adapter, "down");
      expect(await adapter.enumTypes()).toEqual([["color", ["blue", "green"]]]);
    });

    it("migrate revert add and validate check constraint", async () => {
      await adapter.createTable("settings", (t: TableDefinitionOf<PostgreSQLAdapter>) => {
        t.integer("value");
      });

      await new AddAndValidateCheckConstraint().execMigration(adapter, "up");
      expect(
        await adapter.checkConstraintExists("settings", { name: "positive_value" }),
      ).toBeTruthy();
      await new AddAndValidateCheckConstraint().execMigration(adapter, "down");
      expect(
        await adapter.checkConstraintExists("settings", { name: "positive_value" }),
      ).toBeFalsy();
    });

    it("migrate revert add and validate foreign key", async () => {
      await adapter.createTable("foos");
      await adapter.createTable("bars", (t: TableDefinitionOf<PostgreSQLAdapter>) => {
        t.integer("foo_id");
      });

      await new AddAndValidateForeignKey().execMigration(adapter, "up");
      expect(await adapter.foreignKeyExists("bars", "foos")).toBeTruthy();
      await new AddAndValidateForeignKey().execMigration(adapter, "down");
      expect(await adapter.foreignKeyExists("bars", "foos")).toBeFalsy();
    });
  });
});
