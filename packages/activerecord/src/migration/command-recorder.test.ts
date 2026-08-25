import { beforeEach, describe, it, expect } from "vitest";
import { CommandRecorder } from "./command-recorder.js";
import { IrreversibleMigration } from "../migration.js";
import { Table } from "../connection-adapters/abstract/schema-definitions.js";
import { adapterSupports, itIfSupports } from "../support/supports.js";

const abstractDelegate = {
  updateTableDefinition: (tableName: string, base: unknown) => new Table(tableName, base as never),
  supportsBulkAlter: () => adapterSupports("bulk_alter"),
};

describe("Migration", () => {
  describe("CommandRecorderTest", () => {
    let recorder: CommandRecorder & {
      createTable(...args: unknown[]): void;
      execute(sql: string): void;
      transaction(fn: () => Promise<void>): void;
      nonExistingMethod(name: string): void;
    };

    beforeEach(() => {
      recorder = new CommandRecorder(abstractDelegate) as typeof recorder;
    });

    it("respond to delegates", () => {
      const recorder = new CommandRecorder({ america() {} }) as unknown as {
        america: unknown;
      };
      expect(typeof recorder.america).toBe("function");
    });

    it("send calls super", () => {
      expect(() => recorder.nonExistingMethod("horses")).toThrow(
        expect.objectContaining({
          name: "NoMethodError",
          message: expect.stringContaining("undefined method 'nonExistingMethod'"),
        }) as unknown as Error,
      );
    });

    it("send delegates to record", () => {
      const recorder = new CommandRecorder({ createTable(_name: string) {} });
      // The recorder only records the command — no DDL runs, so there is no table to tear down.
      // eslint-disable-next-line blazetrails/require-table-teardown
      (recorder as unknown as { createTable(name: string): void }).createTable("horses");
      expect(recorder.commands).toEqual([["createTable", ["horses"], undefined]]);
    });

    it("unknown commands delegate", () => {
      const recorder = new CommandRecorder({
        foo(kw: string) {
          return kw;
        },
      }) as unknown as { foo(kw: string): string };
      expect(recorder.foo("bar")).toBe("bar");
    });

    it("inverse of raise exception on unknown commands", () => {
      expect(() => recorder.inverseOf("execute", ["some sql"])).toThrow(IrreversibleMigration);
    });

    it("irreversible commands raise exception", async () => {
      await expect(
        recorder.revert(async () => {
          recorder.execute("some sql");
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("record", () => {
      recorder.record("createTable", ["system_settings"]);
      expect(recorder.commands.length).toBe(1);
    });

    it("inverted commands are reversed", async () => {
      await recorder.revert(async () => {
        recorder.record("createTable", ["hello"]);
        recorder.record("createTable", ["world"]);
      });
      const tables = recorder.commands.map(([, args]) => args);
      expect(tables).toEqual([["world"], ["hello"]]);
    });

    it("revert order", async () => {
      const block = (t: Table) => t.string("name");
      /* eslint-disable blazetrails/require-table-teardown */
      recorder.createTable("apples", block);
      await recorder.revert(async () => {
        recorder.createTable("bananas", block);
        await recorder.revert(async () => {
          recorder.createTable("clementines", block);
          recorder.createTable("dates");
        });
        recorder.createTable("elderberries");
      });
      await recorder.revert(async () => {
        recorder.createTable("figs", block);
        recorder.createTable("grapes");
      });
      /* eslint-enable blazetrails/require-table-teardown */
      expect(recorder.commands).toEqual([
        ["createTable", ["apples", block], undefined],
        ["dropTable", ["elderberries"], undefined],
        ["createTable", ["clementines", block], undefined],
        ["createTable", ["dates"], undefined],
        ["dropTable", ["bananas", block], undefined],
        ["dropTable", ["grapes"], undefined],
        ["dropTable", ["figs", block], undefined],
      ]);
    });

    it("invert change table", async () => {
      await recorder.revert(async () => {
        await recorder.changeTable("fruits", async (t) => {
          await t.string("name");
          await t.rename("kind", "cultivar");
        });
      });

      expect(recorder.commands).toEqual([
        ["renameColumn", ["fruits", "cultivar", "kind"]],
        ["removeColumn", ["fruits", "name", "string"], undefined],
      ]);

      await expect(
        recorder.revert(async () => {
          await recorder.changeTable("fruits", async (t) => {
            await t.remove("kind");
          });
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    itIfSupports("bulk_alter", "bulk invert change table", async () => {
      const block = async (t: Table) => {
        await t.string("name");
        await t.rename("kind", "cultivar");
      };

      await recorder.revert(async () => {
        await recorder.changeTable("fruits", { bulk: true }, block);
      });

      await recorder.revert(async () => {
        await recorder.revert(async () => {
          await recorder.changeTable("fruits", { bulk: true }, block);
        });
      });

      expect(recorder.commands.map((command) => command.slice(0, -1))).toEqual([
        ["changeTable", ["fruits"]],
        ["changeTable", ["fruits"]],
      ]);
    });

    it("invert create table", async () => {
      await recorder.revert(async () => {
        recorder.record("createTable", ["system_settings"]);
      });
      const dropTable = recorder.commands[0];
      expect(dropTable).toEqual(["dropTable", ["system_settings"], undefined]);
    });

    it("invert create table with if not exists", async () => {
      await recorder.revert(async () => {
        recorder.record("createTable", ["system_settings", { ifNotExists: true }]);
      });
      const dropTable = recorder.commands[0];
      expect(dropTable).toEqual(["dropTable", ["system_settings", {}], undefined]);
    });

    it("invert create table with options and block", () => {
      const block = () => {};
      const dropTable = recorder.inverseOf("createTable", [
        "people_reminders",
        { id: false },
        block,
      ]);
      expect(dropTable).toEqual([
        "dropTable",
        ["people_reminders", { id: false }, block],
        undefined,
      ]);
    });

    it("invert drop table", () => {
      const block = () => {};
      const createTable = recorder.inverseOf("dropTable", [
        "people_reminders",
        { id: false },
        block,
      ]);
      expect(createTable).toEqual([
        "createTable",
        ["people_reminders", { id: false }, block],
        undefined,
      ]);
    });

    it("invert drop table with if exists", () => {
      const block = () => {};
      const createTable = recorder.inverseOf("dropTable", [
        "people_reminders",
        { id: false, ifExists: true },
        block,
      ]);
      expect(createTable).toEqual([
        "createTable",
        ["people_reminders", { id: false }, block],
        undefined,
      ]);
    });

    it("invert drop table without a block nor option", () => {
      const inverseOf = () => recorder.inverseOf("dropTable", ["people_reminders"]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    });

    it("invert drop table with multiple tables", () => {
      const inverseOf = () => recorder.inverseOf("dropTable", ["musics", "artists"]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert drop table with multiple tables and options", () => {
      const inverseOf = () => recorder.inverseOf("dropTable", ["musics", "artists", { id: false }]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert drop table with multiple tables and block", () => {
      const block = () => {};
      const inverseOf = () => recorder.inverseOf("dropTable", ["musics", "artists", block]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert create join table", () => {
      const dropJoinTable = recorder.inverseOf("createJoinTable", ["musics", "artists"]);
      expect(dropJoinTable).toEqual(["dropJoinTable", ["musics", "artists"], undefined]);
    });

    it("invert create join table with table name", () => {
      const dropJoinTable = recorder.inverseOf("createJoinTable", [
        "musics",
        "artists",
        { tableName: "catalog" },
      ]);
      expect(dropJoinTable).toEqual([
        "dropJoinTable",
        ["musics", "artists", { tableName: "catalog" }],
        undefined,
      ]);
    });

    it("invert drop join table", () => {
      const block = () => {};
      const createJoinTable = recorder.inverseOf("dropJoinTable", [
        "musics",
        "artists",
        { tableName: "catalog" },
        block,
      ]);
      expect(createJoinTable).toEqual([
        "createJoinTable",
        ["musics", "artists", { tableName: "catalog" }, block],
        undefined,
      ]);
    });

    it("invert rename table", () => {
      const rename = recorder.inverseOf("renameTable", ["old", "new"]);
      expect(rename).toEqual(["renameTable", ["new", "old"]]);
    });

    it("invert add column", () => {
      const remove = recorder.inverseOf("addColumn", ["table", "column", "type", {}]);
      expect(remove).toEqual(["removeColumn", ["table", "column", "type", {}], undefined]);
    });

    it("invert change column", () => {
      expect(() => recorder.inverseOf("changeColumn", ["table", "column", "type", {}])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invert change column default", () => {
      expect(() =>
        recorder.inverseOf("changeColumnDefault", ["table", "column", "default_value"]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert change column default with from and to", () => {
      const change = recorder.inverseOf("changeColumnDefault", [
        "table",
        "column",
        { from: "old_value", to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeColumnDefault",
        ["table", "column", { from: "new_value", to: "old_value" }],
      ]);
    });

    it("invert change column default with from and to with boolean", () => {
      const change = recorder.inverseOf("changeColumnDefault", [
        "table",
        "column",
        { from: true, to: false },
      ]);
      expect(change).toEqual([
        "changeColumnDefault",
        ["table", "column", { from: false, to: true }],
      ]);
    });

    itIfSupports("comments", "invert change column comment", () => {
      expect(() =>
        recorder.inverseOf("changeColumnComment", ["table", "column", "comment"]),
      ).toThrow(IrreversibleMigration);
    });

    itIfSupports("comments", "invert change column comment with from and to", () => {
      const change = recorder.inverseOf("changeColumnComment", [
        "table",
        "column",
        { from: "old_value", to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeColumnComment",
        ["table", "column", { from: "new_value", to: "old_value" }],
      ]);
    });

    itIfSupports("comments", "invert change column comment with from and to with nil", () => {
      const change = recorder.inverseOf("changeColumnComment", [
        "table",
        "column",
        { from: undefined, to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeColumnComment",
        ["table", "column", { from: "new_value", to: undefined }],
      ]);
    });

    itIfSupports("comments", "invert change table comment", () => {
      expect(() =>
        recorder.inverseOf("changeColumnComment", ["table", "column", "comment"]),
      ).toThrow(IrreversibleMigration);
    });

    itIfSupports("comments", "invert change table comment with from and to", () => {
      const change = recorder.inverseOf("changeTableComment", [
        "table",
        { from: "old_value", to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeTableComment",
        ["table", { from: "new_value", to: "old_value" }],
      ]);
    });

    itIfSupports("comments", "invert change table comment with from and to with nil", () => {
      const change = recorder.inverseOf("changeTableComment", [
        "table",
        { from: undefined, to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeTableComment",
        ["table", { from: "new_value", to: undefined }],
      ]);
    });

    it("invert change column null", () => {
      const add = recorder.inverseOf("changeColumnNull", ["table", "column", true]);
      expect(add).toEqual(["changeColumnNull", ["table", "column", false]]);
    });

    it("invert remove column", () => {
      const add = recorder.inverseOf("removeColumn", ["table", "column", "type", {}]);
      expect(add).toEqual(["addColumn", ["table", "column", "type", {}], undefined]);
    });

    it("invert remove column without type", () => {
      expect(() => recorder.inverseOf("removeColumn", ["table", "column"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invert rename column", () => {
      const rename = recorder.inverseOf("renameColumn", ["table", "old", "new"]);
      expect(rename).toEqual(["renameColumn", ["table", "new", "old"]]);
    });

    it("invert add index", () => {
      const remove = recorder.inverseOf("addIndex", ["table", ["one", "two"]]);
      expect(remove).toEqual(["removeIndex", ["table", ["one", "two"]], undefined]);
    });

    it("invert add index with name", () => {
      const remove = recorder.inverseOf("addIndex", [
        "table",
        ["one", "two"],
        { name: "new_index" },
      ]);
      expect(remove).toEqual([
        "removeIndex",
        ["table", ["one", "two"], { name: "new_index" }],
        undefined,
      ]);
    });

    it("invert add index with algorithm option", () => {
      const remove = recorder.inverseOf("addIndex", [
        "table",
        "one",
        { algorithm: "concurrently" },
      ]);
      expect(remove).toEqual([
        "removeIndex",
        ["table", "one", { algorithm: "concurrently" }],
        undefined,
      ]);
    });

    it("invert remove index", () => {
      const add = recorder.inverseOf("removeIndex", ["table", "one"]);
      expect(add).toEqual(["addIndex", ["table", "one"]]);
    });

    it("invert remove index with positional column", () => {
      const add = recorder.inverseOf("removeIndex", ["table", ["one", "two"], { options: true }]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"], { options: true }]]);
    });

    it("invert remove index with column", () => {
      const add = recorder.inverseOf("removeIndex", [
        "table",
        { column: ["one", "two"], options: true },
      ]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"], { options: true }]]);
    });

    it("invert remove index with name", () => {
      const add = recorder.inverseOf("removeIndex", [
        "table",
        { column: ["one", "two"], name: "new_index" },
      ]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"], { name: "new_index" }]]);
    });

    it("invert remove index with no special options", () => {
      const add = recorder.inverseOf("removeIndex", ["table", { column: ["one", "two"] }]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"]]]);
    });

    it("invert remove index with no column", () => {
      expect(() => recorder.inverseOf("removeIndex", ["table", { name: "new_index" }])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invert rename index", () => {
      const rename = recorder.inverseOf("renameIndex", ["table", "old", "new"]);
      expect(rename).toEqual(["renameIndex", ["table", "new", "old"]]);
    });

    it("invert add timestamps", () => {
      const remove = recorder.inverseOf("addTimestamps", ["table"]);
      expect(remove).toEqual(["removeTimestamps", ["table"], undefined]);
    });

    it("invert remove timestamps", () => {
      const add = recorder.inverseOf("removeTimestamps", ["table", { null: true }]);
      expect(add).toEqual(["addTimestamps", ["table", { null: true }], undefined]);
    });

    it("invert add reference", () => {
      const remove = recorder.inverseOf("addReference", [
        "table",
        "taggable",
        { polymorphic: true },
      ]);
      expect(remove).toEqual([
        "removeReference",
        ["table", "taggable", { polymorphic: true }],
        undefined,
      ]);
    });

    it("invert add belongs to alias", () => {
      const remove = recorder.inverseOf("addBelongsTo", ["table", "user"]);
      expect(remove).toEqual(["removeReference", ["table", "user"], undefined]);
    });

    it("invert remove reference", () => {
      const add = recorder.inverseOf("removeReference", [
        "table",
        "taggable",
        { polymorphic: true },
      ]);
      expect(add).toEqual([
        "addReference",
        ["table", "taggable", { polymorphic: true }],
        undefined,
      ]);
    });

    it("invert remove reference with index and foreign key", () => {
      const add = recorder.inverseOf("removeReference", [
        "table",
        "taggable",
        { index: true, foreignKey: true },
      ]);
      expect(add).toEqual([
        "addReference",
        ["table", "taggable", { index: true, foreignKey: true }],
        undefined,
      ]);
    });

    it("invert remove belongs to alias", () => {
      const add = recorder.inverseOf("removeBelongsTo", ["table", "user"]);
      expect(add).toEqual(["addReference", ["table", "user"], undefined]);
    });

    it("invert enable extension", () => {
      const disable = recorder.inverseOf("enableExtension", ["uuid-ossp"]);
      expect(disable).toEqual(["disableExtension", ["uuid-ossp"], undefined]);
    });

    it("invert disable extension", () => {
      const enable = recorder.inverseOf("disableExtension", ["uuid-ossp"]);
      expect(enable).toEqual(["enableExtension", ["uuid-ossp"], undefined]);
    });

    it("invert create schema", () => {
      const disable = recorder.inverseOf("createSchema", ["myschema"]);
      expect(disable).toEqual(["dropSchema", ["myschema"], undefined]);
    });

    it("invert drop schema", () => {
      const enable = recorder.inverseOf("dropSchema", ["myschema"]);
      expect(enable).toEqual(["createSchema", ["myschema"], undefined]);
    });

    it("invert add foreign key", () => {
      const enable = recorder.inverseOf("addForeignKey", ["dogs", "people"]);
      expect(enable).toEqual(["removeForeignKey", ["dogs", "people"], undefined]);
    });

    it("invert remove foreign key", () => {
      const enable = recorder.inverseOf("removeForeignKey", ["dogs", "people"]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people"]]);
    });

    it("invert add foreign key with column", () => {
      const enable = recorder.inverseOf("addForeignKey", [
        "dogs",
        "people",
        { column: "owner_id" },
      ]);
      expect(enable).toEqual([
        "removeForeignKey",
        ["dogs", "people", { column: "owner_id" }],
        undefined,
      ]);
    });

    it("invert remove foreign key with column", () => {
      const enable = recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { column: "owner_id" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { column: "owner_id" }]]);
    });

    it("invert add foreign key with column and name", () => {
      const enable = recorder.inverseOf("addForeignKey", [
        "dogs",
        "people",
        { column: "owner_id", name: "fk" },
      ]);
      expect(enable).toEqual([
        "removeForeignKey",
        ["dogs", "people", { column: "owner_id", name: "fk" }],
        undefined,
      ]);
    });

    it("invert remove foreign key with column and name", () => {
      const enable = recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { column: "owner_id", name: "fk" },
      ]);
      expect(enable).toEqual([
        "addForeignKey",
        ["dogs", "people", { column: "owner_id", name: "fk" }],
      ]);
    });

    it("invert remove foreign key with primary key", () => {
      const enable = recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { primaryKey: "person_id" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { primaryKey: "person_id" }]]);
    });

    it("invert remove foreign key with primary key and to table in options", () => {
      const enable = recorder.inverseOf("removeForeignKey", [
        "dogs",
        { toTable: "people", primaryKey: "uuid" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { primaryKey: "uuid" }]]);
    });

    it("invert remove foreign key with on delete on update", () => {
      const enable = recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { onDelete: "nullify", onUpdate: "cascade" },
      ]);
      expect(enable).toEqual([
        "addForeignKey",
        ["dogs", "people", { onDelete: "nullify", onUpdate: "cascade" }],
      ]);
    });

    it("invert remove foreign key with to table in options", () => {
      let enable = recorder.inverseOf("removeForeignKey", ["dogs", { toTable: "people" }]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people"]]);

      enable = recorder.inverseOf("removeForeignKey", [
        "dogs",
        { toTable: "people", column: "owner_id" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { column: "owner_id" }]]);
    });

    it("invert remove foreign key is irreversible without to table", () => {
      expect(() =>
        recorder.inverseOf("removeForeignKey", ["dogs", { column: "owner_id" }]),
      ).toThrow(IrreversibleMigration);

      expect(() => recorder.inverseOf("removeForeignKey", ["dogs", { name: "fk" }])).toThrow(
        IrreversibleMigration,
      );

      expect(() => recorder.inverseOf("removeForeignKey", ["dogs"])).toThrow(IrreversibleMigration);
    });

    it("invert transaction with irreversible inside is irreversible", async () => {
      await expect(
        recorder.revert(async () => {
          await recorder.transaction(async () => {
            recorder.execute("some sql");
          });
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert add check constraint", () => {
      const enable = recorder.inverseOf("addCheckConstraint", [
        "dogs",
        "speed > 0",
        { name: "speed_check" },
      ]);
      expect(enable).toEqual([
        "removeCheckConstraint",
        ["dogs", "speed > 0", { name: "speed_check" }],
        undefined,
      ]);
    });

    it("invert add check constraint if not exists", () => {
      const enable = recorder.inverseOf("addCheckConstraint", [
        "dogs",
        "speed > 0",
        { name: "speed_check", ifNotExists: true },
      ]);
      expect(enable).toEqual([
        "removeCheckConstraint",
        ["dogs", "speed > 0", { name: "speed_check", ifExists: true }],
        undefined,
      ]);
    });

    it("invert remove check constraint", () => {
      const enable = recorder.inverseOf("removeCheckConstraint", [
        "dogs",
        "speed > 0",
        { name: "speed_check" },
      ]);
      expect(enable).toEqual([
        "addCheckConstraint",
        ["dogs", "speed > 0", { name: "speed_check" }],
        undefined,
      ]);
    });

    it("invert remove check constraint without expression", () => {
      expect(() => recorder.inverseOf("removeCheckConstraint", ["dogs"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invert remove check constraint if exists", () => {
      const enable = recorder.inverseOf("removeCheckConstraint", [
        "dogs",
        "speed > 0",
        { name: "speed_check", ifExists: true },
      ]);
      expect(enable).toEqual([
        "addCheckConstraint",
        ["dogs", "speed > 0", { name: "speed_check", ifNotExists: true }],
        undefined,
      ]);
    });

    it("invert add unique constraint constraint with using index", () => {
      expect(() =>
        recorder.inverseOf("addUniqueConstraint", ["dogs", { usingIndex: "unique_index" }]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert remove unique constraint constraint", () => {
      const enable = recorder.inverseOf("removeUniqueConstraint", [
        "dogs",
        ["speed"],
        { deferrable: "deferred", name: "uniq_speed" },
      ]);
      expect(enable).toEqual([
        "addUniqueConstraint",
        ["dogs", ["speed"], { deferrable: "deferred", name: "uniq_speed" }],
        undefined,
      ]);
    });

    it("invert remove unique constraint constraint without options", () => {
      const enable = recorder.inverseOf("removeUniqueConstraint", ["dogs", ["speed"]]);
      expect(enable).toEqual(["addUniqueConstraint", ["dogs", ["speed"]], undefined]);
    });

    it("invert remove unique constraint constraint without columns", () => {
      expect(() =>
        recorder.inverseOf("removeUniqueConstraint", ["dogs", { name: "uniq_speed" }]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert create enum", () => {
      const drop = recorder.inverseOf("createEnum", ["color", ["blue", "green"]]);
      expect(drop).toEqual(["dropEnum", ["color", ["blue", "green"]], undefined]);
    });

    it("invert drop enum", () => {
      const create = recorder.inverseOf("dropEnum", ["color", ["blue", "green"]]);
      expect(create).toEqual(["createEnum", ["color", ["blue", "green"]], undefined]);
    });

    it("invert drop enum without values", () => {
      expect(() => recorder.inverseOf("dropEnum", ["color"])).toThrow(IrreversibleMigration);

      expect(() => recorder.inverseOf("dropEnum", ["color", { ifExists: true }])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invert rename enum", () => {
      const enumCmd = recorder.inverseOf("renameEnum", ["dog_breed", "breed"]);
      expect(enumCmd).toEqual(["renameEnum", ["breed", "dog_breed"]]);
    });

    it("invert rename enum with to option", () => {
      const enumCmd = recorder.inverseOf("renameEnum", ["dog_breed", { to: "breed" }]);
      expect(enumCmd).toEqual(["renameEnum", ["breed", "dog_breed"]]);
    });

    it("invert add enum value", () => {
      expect(() => recorder.inverseOf("addEnumValue", ["dog_breed", "beagle"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invert rename enum value", () => {
      const enumValue = recorder.inverseOf("renameEnumValue", [
        "dog_breed",
        { from: "retriever", to: "beagle" },
      ]);
      expect(enumValue).toEqual([
        "renameEnumValue",
        ["dog_breed", { from: "beagle", to: "retriever" }],
      ]);
    });

    it("invert rename enum value without from", () => {
      expect(() =>
        recorder.inverseOf("renameEnumValue", ["dog_breed", { to: "retriever" }]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert rename enum value without to", () => {
      expect(() =>
        recorder.inverseOf("renameEnumValue", ["dog_breed", { from: "beagle" }]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert create virtual table", () => {
      const drop = recorder.inverseOf("createVirtualTable", [
        "searchables",
        "fts5",
        ["content", "meta UNINDEXED", "tokenize='porter ascii'"],
      ]);
      expect(drop).toEqual([
        "dropVirtualTable",
        ["searchables", "fts5", ["content", "meta UNINDEXED", "tokenize='porter ascii'"]],
        undefined,
      ]);
    });

    it("invert drop virtual table", () => {
      const create = recorder.inverseOf("dropVirtualTable", [
        "searchables",
        "fts5",
        ["title", "content"],
      ]);
      expect(create).toEqual([
        "createVirtualTable",
        ["searchables", "fts5", ["title", "content"]],
        undefined,
      ]);
    });

    it("invert drop virtual table without options", () => {
      expect(() => recorder.inverseOf("dropVirtualTable", ["searchables"])).toThrow(
        IrreversibleMigration,
      );
    });
  });
});
