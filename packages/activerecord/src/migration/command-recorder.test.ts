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

    it("inverse of raise exception on unknown commands", async () => {
      await expect(recorder.inverseOf("execute", ["some sql"])).rejects.toThrow(
        IrreversibleMigration,
      );
    });

    it("irreversible commands raise exception", async () => {
      await expect(
        recorder.revert(async () => {
          await recorder.execute("some sql");
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("record", async () => {
      await recorder.record("createTable", ["system_settings"]);
      expect(recorder.commands.length).toBe(1);
    });

    it("inverted commands are reversed", async () => {
      await recorder.revert(async () => {
        await recorder.record("createTable", ["hello"]);
        await recorder.record("createTable", ["world"]);
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
        await recorder.record("createTable", ["system_settings"]);
      });
      const dropTable = recorder.commands[0];
      expect(dropTable).toEqual(["dropTable", ["system_settings"], undefined]);
    });

    it("invert create table with if not exists", async () => {
      await recorder.revert(async () => {
        await recorder.record("createTable", ["system_settings", { ifNotExists: true }]);
      });
      const dropTable = recorder.commands[0];
      expect(dropTable).toEqual(["dropTable", ["system_settings", {}], undefined]);
    });

    it("invert create table with options and block", async () => {
      const block = () => {};
      const dropTable = await recorder.inverseOf("createTable", [
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

    it("invert drop table", async () => {
      const block = () => {};
      const createTable = await recorder.inverseOf("dropTable", [
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

    it("invert drop table with if exists", async () => {
      const block = () => {};
      const createTable = await recorder.inverseOf("dropTable", [
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

    it("invert drop table without a block nor option", async () => {
      const inverseOf = () => recorder.inverseOf("dropTable", ["people_reminders"]);
      await expect(inverseOf()).rejects.toThrow(IrreversibleMigration);
      await expect(inverseOf()).rejects.toThrow(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    });

    it("invert drop table with multiple tables", async () => {
      const inverseOf = () => recorder.inverseOf("dropTable", ["musics", "artists"]);
      await expect(inverseOf()).rejects.toThrow(IrreversibleMigration);
      await expect(inverseOf()).rejects.toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert drop table with multiple tables and options", async () => {
      const inverseOf = () => recorder.inverseOf("dropTable", ["musics", "artists", { id: false }]);
      await expect(inverseOf()).rejects.toThrow(IrreversibleMigration);
      await expect(inverseOf()).rejects.toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert drop table with multiple tables and block", async () => {
      const block = () => {};
      const inverseOf = () => recorder.inverseOf("dropTable", ["musics", "artists", block]);
      await expect(inverseOf()).rejects.toThrow(IrreversibleMigration);
      await expect(inverseOf()).rejects.toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert create join table", async () => {
      const dropJoinTable = await recorder.inverseOf("createJoinTable", ["musics", "artists"]);
      expect(dropJoinTable).toEqual(["dropJoinTable", ["musics", "artists"], undefined]);
    });

    it("invert create join table with table name", async () => {
      const dropJoinTable = await recorder.inverseOf("createJoinTable", [
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

    it("invert drop join table", async () => {
      const block = () => {};
      const createJoinTable = await recorder.inverseOf("dropJoinTable", [
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

    it("invert rename table", async () => {
      const rename = await recorder.inverseOf("renameTable", ["old", "new"]);
      expect(rename).toEqual(["renameTable", ["new", "old"]]);
    });

    it("invert add column", async () => {
      const remove = await recorder.inverseOf("addColumn", ["table", "column", "type", {}]);
      expect(remove).toEqual(["removeColumn", ["table", "column", "type", {}], undefined]);
    });

    it("invert change column", async () => {
      await expect(
        recorder.inverseOf("changeColumn", ["table", "column", "type", {}]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert change column default", async () => {
      await expect(
        recorder.inverseOf("changeColumnDefault", ["table", "column", "default_value"]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert change column default with from and to", async () => {
      const change = await recorder.inverseOf("changeColumnDefault", [
        "table",
        "column",
        { from: "old_value", to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeColumnDefault",
        ["table", "column", { from: "new_value", to: "old_value" }],
      ]);
    });

    it("invert change column default with from and to with boolean", async () => {
      const change = await recorder.inverseOf("changeColumnDefault", [
        "table",
        "column",
        { from: true, to: false },
      ]);
      expect(change).toEqual([
        "changeColumnDefault",
        ["table", "column", { from: false, to: true }],
      ]);
    });

    itIfSupports("comments", "invert change column comment", async () => {
      await expect(
        recorder.inverseOf("changeColumnComment", ["table", "column", "comment"]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    itIfSupports("comments", "invert change column comment with from and to", async () => {
      const change = await recorder.inverseOf("changeColumnComment", [
        "table",
        "column",
        { from: "old_value", to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeColumnComment",
        ["table", "column", { from: "new_value", to: "old_value" }],
      ]);
    });

    itIfSupports("comments", "invert change column comment with from and to with nil", async () => {
      const change = await recorder.inverseOf("changeColumnComment", [
        "table",
        "column",
        { from: undefined, to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeColumnComment",
        ["table", "column", { from: "new_value", to: undefined }],
      ]);
    });

    itIfSupports("comments", "invert change table comment", async () => {
      await expect(
        recorder.inverseOf("changeColumnComment", ["table", "column", "comment"]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    itIfSupports("comments", "invert change table comment with from and to", async () => {
      const change = await recorder.inverseOf("changeTableComment", [
        "table",
        { from: "old_value", to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeTableComment",
        ["table", { from: "new_value", to: "old_value" }],
      ]);
    });

    itIfSupports("comments", "invert change table comment with from and to with nil", async () => {
      const change = await recorder.inverseOf("changeTableComment", [
        "table",
        { from: undefined, to: "new_value" },
      ]);
      expect(change).toEqual([
        "changeTableComment",
        ["table", { from: "new_value", to: undefined }],
      ]);
    });

    it("invert change column null", async () => {
      const add = await recorder.inverseOf("changeColumnNull", ["table", "column", true]);
      expect(add).toEqual(["changeColumnNull", ["table", "column", false]]);
    });

    it("invert remove column", async () => {
      const add = await recorder.inverseOf("removeColumn", ["table", "column", "type", {}]);
      expect(add).toEqual(["addColumn", ["table", "column", "type", {}], undefined]);
    });

    it("invert remove column without type", async () => {
      await expect(recorder.inverseOf("removeColumn", ["table", "column"])).rejects.toThrow(
        IrreversibleMigration,
      );
    });

    it("invert rename column", async () => {
      const rename = await recorder.inverseOf("renameColumn", ["table", "old", "new"]);
      expect(rename).toEqual(["renameColumn", ["table", "new", "old"]]);
    });

    it("invert add index", async () => {
      const remove = await recorder.inverseOf("addIndex", ["table", ["one", "two"]]);
      expect(remove).toEqual(["removeIndex", ["table", ["one", "two"]], undefined]);
    });

    it("invert add index with name", async () => {
      const remove = await recorder.inverseOf("addIndex", [
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

    it("invert add index with algorithm option", async () => {
      const remove = await recorder.inverseOf("addIndex", [
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

    it("invert remove index", async () => {
      const add = await recorder.inverseOf("removeIndex", ["table", "one"]);
      expect(add).toEqual(["addIndex", ["table", "one"]]);
    });

    it("invert remove index with positional column", async () => {
      const add = await recorder.inverseOf("removeIndex", [
        "table",
        ["one", "two"],
        { options: true },
      ]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"], { options: true }]]);
    });

    it("invert remove index with column", async () => {
      const add = await recorder.inverseOf("removeIndex", [
        "table",
        { column: ["one", "two"], options: true },
      ]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"], { options: true }]]);
    });

    it("invert remove index with name", async () => {
      const add = await recorder.inverseOf("removeIndex", [
        "table",
        { column: ["one", "two"], name: "new_index" },
      ]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"], { name: "new_index" }]]);
    });

    it("invert remove index with no special options", async () => {
      const add = await recorder.inverseOf("removeIndex", ["table", { column: ["one", "two"] }]);
      expect(add).toEqual(["addIndex", ["table", ["one", "two"]]]);
    });

    it("invert remove index with no column", async () => {
      await expect(
        recorder.inverseOf("removeIndex", ["table", { name: "new_index" }]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert rename index", async () => {
      const rename = await recorder.inverseOf("renameIndex", ["table", "old", "new"]);
      expect(rename).toEqual(["renameIndex", ["table", "new", "old"]]);
    });

    it("invert add timestamps", async () => {
      const remove = await recorder.inverseOf("addTimestamps", ["table"]);
      expect(remove).toEqual(["removeTimestamps", ["table"], undefined]);
    });

    it("invert remove timestamps", async () => {
      const add = await recorder.inverseOf("removeTimestamps", ["table", { null: true }]);
      expect(add).toEqual(["addTimestamps", ["table", { null: true }], undefined]);
    });

    it("invert add reference", async () => {
      const remove = await recorder.inverseOf("addReference", [
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

    it("invert add belongs to alias", async () => {
      const remove = await recorder.inverseOf("addBelongsTo", ["table", "user"]);
      expect(remove).toEqual(["removeReference", ["table", "user"], undefined]);
    });

    it("invert remove reference", async () => {
      const add = await recorder.inverseOf("removeReference", [
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

    it("invert remove reference with index and foreign key", async () => {
      const add = await recorder.inverseOf("removeReference", [
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

    it("invert remove belongs to alias", async () => {
      const add = await recorder.inverseOf("removeBelongsTo", ["table", "user"]);
      expect(add).toEqual(["addReference", ["table", "user"], undefined]);
    });

    it("invert enable extension", async () => {
      const disable = await recorder.inverseOf("enableExtension", ["uuid-ossp"]);
      expect(disable).toEqual(["disableExtension", ["uuid-ossp"], undefined]);
    });

    it("invert disable extension", async () => {
      const enable = await recorder.inverseOf("disableExtension", ["uuid-ossp"]);
      expect(enable).toEqual(["enableExtension", ["uuid-ossp"], undefined]);
    });

    it("invert create schema", async () => {
      const disable = await recorder.inverseOf("createSchema", ["myschema"]);
      expect(disable).toEqual(["dropSchema", ["myschema"], undefined]);
    });

    it("invert drop schema", async () => {
      const enable = await recorder.inverseOf("dropSchema", ["myschema"]);
      expect(enable).toEqual(["createSchema", ["myschema"], undefined]);
    });

    it("invert add foreign key", async () => {
      const enable = await recorder.inverseOf("addForeignKey", ["dogs", "people"]);
      expect(enable).toEqual(["removeForeignKey", ["dogs", "people"], undefined]);
    });

    it("invert remove foreign key", async () => {
      const enable = await recorder.inverseOf("removeForeignKey", ["dogs", "people"]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people"]]);
    });

    it("invert add foreign key with column", async () => {
      const enable = await recorder.inverseOf("addForeignKey", [
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

    it("invert remove foreign key with column", async () => {
      const enable = await recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { column: "owner_id" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { column: "owner_id" }]]);
    });

    it("invert add foreign key with column and name", async () => {
      const enable = await recorder.inverseOf("addForeignKey", [
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

    it("invert remove foreign key with column and name", async () => {
      const enable = await recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { column: "owner_id", name: "fk" },
      ]);
      expect(enable).toEqual([
        "addForeignKey",
        ["dogs", "people", { column: "owner_id", name: "fk" }],
      ]);
    });

    it("invert remove foreign key with primary key", async () => {
      const enable = await recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { primaryKey: "person_id" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { primaryKey: "person_id" }]]);
    });

    it("invert remove foreign key with primary key and to table in options", async () => {
      const enable = await recorder.inverseOf("removeForeignKey", [
        "dogs",
        { toTable: "people", primaryKey: "uuid" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { primaryKey: "uuid" }]]);
    });

    it("invert remove foreign key with on delete on update", async () => {
      const enable = await recorder.inverseOf("removeForeignKey", [
        "dogs",
        "people",
        { onDelete: "nullify", onUpdate: "cascade" },
      ]);
      expect(enable).toEqual([
        "addForeignKey",
        ["dogs", "people", { onDelete: "nullify", onUpdate: "cascade" }],
      ]);
    });

    it("invert remove foreign key with to table in options", async () => {
      let enable = await recorder.inverseOf("removeForeignKey", ["dogs", { toTable: "people" }]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people"]]);

      enable = await recorder.inverseOf("removeForeignKey", [
        "dogs",
        { toTable: "people", column: "owner_id" },
      ]);
      expect(enable).toEqual(["addForeignKey", ["dogs", "people", { column: "owner_id" }]]);
    });

    it("invert remove foreign key is irreversible without to table", async () => {
      await expect(
        recorder.inverseOf("removeForeignKey", ["dogs", { column: "owner_id" }]),
      ).rejects.toThrow(IrreversibleMigration);

      await expect(
        recorder.inverseOf("removeForeignKey", ["dogs", { name: "fk" }]),
      ).rejects.toThrow(IrreversibleMigration);

      await expect(recorder.inverseOf("removeForeignKey", ["dogs"])).rejects.toThrow(
        IrreversibleMigration,
      );
    });

    it("invert transaction with irreversible inside is irreversible", async () => {
      await expect(
        recorder.revert(async () => {
          await recorder.transaction(async () => {
            await recorder.execute("some sql");
          });
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert add check constraint", async () => {
      const enable = await recorder.inverseOf("addCheckConstraint", [
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

    it("invert add check constraint if not exists", async () => {
      const enable = await recorder.inverseOf("addCheckConstraint", [
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

    it("invert remove check constraint", async () => {
      const enable = await recorder.inverseOf("removeCheckConstraint", [
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

    it("invert remove check constraint without expression", async () => {
      await expect(recorder.inverseOf("removeCheckConstraint", ["dogs"])).rejects.toThrow(
        IrreversibleMigration,
      );
    });

    it("invert remove check constraint if exists", async () => {
      const enable = await recorder.inverseOf("removeCheckConstraint", [
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

    it("invert add unique constraint constraint with using index", async () => {
      await expect(
        recorder.inverseOf("addUniqueConstraint", ["dogs", { usingIndex: "unique_index" }]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert remove unique constraint constraint", async () => {
      const enable = await recorder.inverseOf("removeUniqueConstraint", [
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

    it("invert remove unique constraint constraint without options", async () => {
      const enable = await recorder.inverseOf("removeUniqueConstraint", ["dogs", ["speed"]]);
      expect(enable).toEqual(["addUniqueConstraint", ["dogs", ["speed"]], undefined]);
    });

    it("invert remove unique constraint constraint without columns", async () => {
      await expect(
        recorder.inverseOf("removeUniqueConstraint", ["dogs", { name: "uniq_speed" }]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert create enum", async () => {
      const drop = await recorder.inverseOf("createEnum", ["color", ["blue", "green"]]);
      expect(drop).toEqual(["dropEnum", ["color", ["blue", "green"]], undefined]);
    });

    it("invert drop enum", async () => {
      const create = await recorder.inverseOf("dropEnum", ["color", ["blue", "green"]]);
      expect(create).toEqual(["createEnum", ["color", ["blue", "green"]], undefined]);
    });

    it("invert drop enum without values", async () => {
      await expect(recorder.inverseOf("dropEnum", ["color"])).rejects.toThrow(
        IrreversibleMigration,
      );

      await expect(recorder.inverseOf("dropEnum", ["color", { ifExists: true }])).rejects.toThrow(
        IrreversibleMigration,
      );
    });

    it("invert rename enum", async () => {
      const enumCmd = await recorder.inverseOf("renameEnum", ["dog_breed", "breed"]);
      expect(enumCmd).toEqual(["renameEnum", ["breed", "dog_breed"]]);
    });

    it("invert rename enum with to option", async () => {
      const enumCmd = await recorder.inverseOf("renameEnum", ["dog_breed", { to: "breed" }]);
      expect(enumCmd).toEqual(["renameEnum", ["breed", "dog_breed"]]);
    });

    it("invert add enum value", async () => {
      await expect(recorder.inverseOf("addEnumValue", ["dog_breed", "beagle"])).rejects.toThrow(
        IrreversibleMigration,
      );
    });

    it("invert rename enum value", async () => {
      const enumValue = await recorder.inverseOf("renameEnumValue", [
        "dog_breed",
        { from: "retriever", to: "beagle" },
      ]);
      expect(enumValue).toEqual([
        "renameEnumValue",
        ["dog_breed", { from: "beagle", to: "retriever" }],
      ]);
    });

    it("invert rename enum value without from", async () => {
      await expect(
        recorder.inverseOf("renameEnumValue", ["dog_breed", { to: "retriever" }]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert rename enum value without to", async () => {
      await expect(
        recorder.inverseOf("renameEnumValue", ["dog_breed", { from: "beagle" }]),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert create virtual table", async () => {
      const drop = await recorder.inverseOf("createVirtualTable", [
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

    it("invert drop virtual table", async () => {
      const create = await recorder.inverseOf("dropVirtualTable", [
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

    it("invert drop virtual table without options", async () => {
      await expect(recorder.inverseOf("dropVirtualTable", ["searchables"])).rejects.toThrow(
        IrreversibleMigration,
      );
    });
  });
});
