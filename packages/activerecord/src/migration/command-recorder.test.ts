import { describe, it, expect } from "vitest";
import { CommandRecorder } from "./command-recorder.js";
import { IrreversibleMigration } from "../migration.js";
import { Table } from "../connection-adapters/abstract/schema-definitions.js";
import { Table as PgTable } from "../connection-adapters/postgresql/schema-definitions.js";
import { Table as MysqlTable } from "../connection-adapters/mysql/schema-definitions.js";

const abstractDelegate = {
  updateTableDefinition: (tableName: string, base: unknown) => new Table(tableName, base as never),
};
const pgDelegate = {
  updateTableDefinition: (tableName: string, base: unknown) =>
    new PgTable(tableName, base as never),
};
const mysqlDelegate = {
  updateTableDefinition: (tableName: string, base: unknown) =>
    new MysqlTable(tableName, base as never),
};

describe("CommandRecorder", () => {
  describe("invertAddTimestamps / invertRemoveTimestamps", () => {
    it("invertAddTimestamps returns removeTimestamps", () => {
      const [cmd] = new CommandRecorder().invertAddTimestamps(["users"]);
      expect(cmd).toBe("removeTimestamps");
    });

    it("invertRemoveTimestamps returns addTimestamps", () => {
      const [cmd] = new CommandRecorder().invertRemoveTimestamps(["users"]);
      expect(cmd).toBe("addTimestamps");
    });
  });

  describe("invertAddReference / invertRemoveReference", () => {
    it("invertAddReference returns removeReference", () => {
      const [cmd] = new CommandRecorder().invertAddReference(["posts", "user"]);
      expect(cmd).toBe("removeReference");
    });

    it("invertRemoveReference returns addReference", () => {
      const [cmd] = new CommandRecorder().invertRemoveReference(["posts", "user"]);
      expect(cmd).toBe("addReference");
    });

    it("invert_add_belongs_to_alias", () => {
      const { cmd, args } = new CommandRecorder().inverseOf("addBelongsTo", ["table", "user"]);
      expect(cmd).toBe("removeReference");
      expect(args).toEqual(["table", "user"]);
    });

    it("invert_remove_belongs_to_alias", () => {
      const { cmd, args } = new CommandRecorder().inverseOf("removeBelongsTo", ["table", "user"]);
      expect(cmd).toBe("addReference");
      expect(args).toEqual(["table", "user"]);
    });
  });

  describe("invertAddForeignKey / invertRemoveForeignKey", () => {
    it("invertAddForeignKey strips validate and returns removeForeignKey", () => {
      const [cmd, args] = new CommandRecorder().invertAddForeignKey([
        "posts",
        "users",
        { validate: false },
      ]);
      expect(cmd).toBe("removeForeignKey");
      expect((args[2] as Record<string, unknown>)["validate"]).toBeUndefined();
    });

    it("invertRemoveForeignKey throws without second table", () => {
      expect(() => new CommandRecorder().invertRemoveForeignKey(["posts"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invertRemoveForeignKey returns addForeignKey with toTable option", () => {
      const [cmd, args] = new CommandRecorder().invertRemoveForeignKey([
        "posts",
        { toTable: "users" },
      ]);
      expect(cmd).toBe("addForeignKey");
      expect(args[1]).toBe("users");
    });
  });

  describe("invertAddCheckConstraint / invertRemoveCheckConstraint", () => {
    it("invertAddCheckConstraint strips validate and returns removeCheckConstraint", () => {
      const [cmd, args] = new CommandRecorder().invertAddCheckConstraint([
        "users",
        "age > 0",
        { validate: true, ifNotExists: true },
      ]);
      expect(cmd).toBe("removeCheckConstraint");
      const opts = args[2] as Record<string, unknown>;
      expect(opts["validate"]).toBeUndefined();
      expect(opts["ifExists"]).toBe(true);
    });

    it("invertRemoveCheckConstraint throws without expression", () => {
      expect(() => new CommandRecorder().invertRemoveCheckConstraint(["users"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invertRemoveCheckConstraint returns addCheckConstraint", () => {
      const [cmd] = new CommandRecorder().invertRemoveCheckConstraint(["users", "age > 0"]);
      expect(cmd).toBe("addCheckConstraint");
    });
  });

  describe("invertAddExclusionConstraint / invertRemoveExclusionConstraint", () => {
    it("invertAddExclusionConstraint returns removeExclusionConstraint", () => {
      const [cmd] = new CommandRecorder().invertAddExclusionConstraint(["rooms", "during WITH &&"]);
      expect(cmd).toBe("removeExclusionConstraint");
    });

    it("invertRemoveExclusionConstraint throws without expression", () => {
      expect(() => new CommandRecorder().invertRemoveExclusionConstraint(["rooms"])).toThrow(
        IrreversibleMigration,
      );
    });
  });

  describe("invertAddUniqueConstraint / invertRemoveUniqueConstraint", () => {
    it("invertAddUniqueConstraint throws when usingIndex given", () => {
      expect(() =>
        new CommandRecorder().invertAddUniqueConstraint(["users", { usingIndex: "idx" }]),
      ).toThrow(IrreversibleMigration);
    });

    it("invertAddUniqueConstraint returns removeUniqueConstraint", () => {
      const [cmd] = new CommandRecorder().invertAddUniqueConstraint(["users", "email"]);
      expect(cmd).toBe("removeUniqueConstraint");
    });

    it("invertRemoveUniqueConstraint throws without column", () => {
      expect(() => new CommandRecorder().invertRemoveUniqueConstraint(["users"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("invertRemoveUniqueConstraint returns addUniqueConstraint", () => {
      const [cmd] = new CommandRecorder().invertRemoveUniqueConstraint(["users", "email"]);
      expect(cmd).toBe("addUniqueConstraint");
    });

    it("invertRemoveUniqueConstraint handles array column names without mistaking array for options", () => {
      const [cmd] = new CommandRecorder().invertRemoveUniqueConstraint([
        "users",
        ["email", "name"],
      ]);
      expect(cmd).toBe("addUniqueConstraint");
    });
  });

  describe("invertRemoveColumns", () => {
    it("throws without type option", () => {
      expect(() => new CommandRecorder().invertRemoveColumns(["users", "name", "age"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("returns addColumns when type given", () => {
      const [cmd] = new CommandRecorder().invertRemoveColumns([
        "users",
        "name",
        { type: "string" },
      ]);
      expect(cmd).toBe("addColumns");
    });
  });

  describe("invertRenameEnum", () => {
    it("swaps name and new_name", () => {
      const [cmd, args] = new CommandRecorder().invertRenameEnum(["status", "state"]);
      expect(cmd).toBe("renameEnum");
      expect(args).toEqual(["state", "status"]);
    });

    it("handles { to: newName } hash form", () => {
      const [cmd, args] = new CommandRecorder().invertRenameEnum(["status", { to: "state" }]);
      expect(cmd).toBe("renameEnum");
      expect(args).toEqual(["state", "status"]);
    });
  });

  describe("invertRenameEnumValue", () => {
    it("swaps from/to values", () => {
      const [cmd, args] = new CommandRecorder().invertRenameEnumValue([
        "status",
        { from: "active", to: "enabled" },
      ]);
      expect(cmd).toBe("renameEnumValue");
      expect(args[1]).toEqual({ from: "enabled", to: "active" });
    });

    it("throws without from/to options", () => {
      expect(() =>
        new CommandRecorder().invertRenameEnumValue(["status", { value: "active" }]),
      ).toThrow(IrreversibleMigration);
    });
  });

  describe("invertDropEnum", () => {
    it("throws without values arg", () => {
      expect(() => new CommandRecorder().invertDropEnum(["my_enum"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("throws when only options hash given (no values)", () => {
      expect(() => new CommandRecorder().invertDropEnum(["my_enum", { schema: "public" }])).toThrow(
        IrreversibleMigration,
      );
    });

    it("returns createEnum when values array given", () => {
      const [cmd] = new CommandRecorder().invertDropEnum(["my_enum", ["val1", "val2"]]);
      expect(cmd).toBe("createEnum");
    });
  });

  describe("invertDropVirtualTable", () => {
    it("throws without type arg", () => {
      expect(() => new CommandRecorder().invertDropVirtualTable(["my_table"])).toThrow(
        IrreversibleMigration,
      );
    });

    it("returns createVirtualTable when type given", () => {
      const [cmd] = new CommandRecorder().invertDropVirtualTable(["my_table", "fts5"]);
      expect(cmd).toBe("createVirtualTable");
    });
  });

  describe("joinTableName / findJoinTableName", () => {
    it("joinTableName returns sorted joined name", () => {
      expect(new CommandRecorder().joinTableName("cats", "dogs")).toBe("cats_dogs");
      expect(new CommandRecorder().joinTableName("dogs", "cats")).toBe("cats_dogs");
    });

    it("findJoinTableName uses tableName option when given", () => {
      expect(new CommandRecorder().findJoinTableName("cats", "dogs", { tableName: "pets" })).toBe(
        "pets",
      );
    });
  });

  describe("invertAddColumns", () => {
    it("returns removeColumns", () => {
      const [cmd] = new CommandRecorder().invertAddColumns(["users", "name", "age"]);
      expect(cmd).toBe("removeColumns");
    });
  });

  describe("invert change table (non-bulk)", () => {
    it("accepts (tableName, fn) without explicit options", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      // short form: no options argument
      await recorder.changeTable("fruits", async (t) => {
        await t.string("name");
      });
      expect(recorder.commands[0].cmd).toBe("addColumn");
    });

    it("remove with multiple columns records a single removeColumns", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.changeTable("fruits", async (t) => {
        await t.remove("name", "kind", { type: "string" });
      });
      expect(recorder.commands).toEqual([
        { cmd: "removeColumns", args: ["fruits", "name", "kind", { type: "string" }] },
      ]);
    });

    it("removeIndex with an options hash records a nil column, not the hash", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.changeTable("fruits", async (t) => {
        await t.removeIndex({ name: "index_fruits_on_kind" });
      });
      expect(recorder.commands).toEqual([
        { cmd: "removeIndex", args: ["fruits", undefined, { name: "index_fruits_on_kind" }] },
      ]);
    });

    it("removeIndex with an explicit nil column keeps the second-argument options", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.changeTable("fruits", async (t) => {
        await t.removeIndex(undefined, { name: "index_fruits_on_kind" });
      });
      expect(recorder.commands).toEqual([
        { cmd: "removeIndex", args: ["fruits", undefined, { name: "index_fruits_on_kind" }] },
      ]);
    });

    it("removeIndex with a column inverts back to addIndex", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.revert(async () => {
        await recorder.changeTable("fruits", async (t) => {
          await t.removeIndex("kind");
        });
      });
      expect(recorder.commands).toEqual([{ cmd: "addIndex", args: ["fruits", "kind"] }]);
    });

    it("raises IrreversibleMigration when removeIndex lacks a column", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await expect(
        recorder.revert(async () => {
          await recorder.changeTable("fruits", async (t) => {
            await t.removeIndex({ name: "index_fruits_on_kind" });
          });
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("raises IrreversibleMigration when remove lacks type", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await expect(
        recorder.revert(async () => {
          await recorder.changeTable("fruits", async (t) => {
            await t.remove("kind"); // no type → not reversible
          });
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });
  });

  describe("change_table surfaces adapter ColumnMethods shorthands (serial/bigserial)", () => {
    // Mirrors Rails: the PG `ColumnMethods` mixin exposes `t.serial` /
    // `t.bigserial` (SERIAL/BIGSERIAL) inside change_table — shorthands the
    // adapter advertises via _columnMethodNames() beyond NATIVE_DATABASE_TYPES.
    const pgLike = pgDelegate;

    it("records addColumn for t.serial and t.bigserial (up adds)", async () => {
      const recorder = new CommandRecorder(pgLike);
      await recorder.changeTable("fruits", async (t) => {
        await (t as any).serial("seq");
        await (t as any).bigserial("big_seq");
      });
      expect(recorder.commands).toEqual([
        { cmd: "addColumn", args: ["fruits", "seq", "serial"] },
        { cmd: "addColumn", args: ["fruits", "big_seq", "bigserial"] },
      ]);
    });

    it("reverts t.serial / t.bigserial to removeColumn (down removes)", async () => {
      const recorder = new CommandRecorder(pgLike);
      await recorder.revert(async () => {
        await recorder.changeTable("fruits", async (t) => {
          await (t as any).serial("seq");
          await (t as any).bigserial("big_seq");
        });
      });
      expect(recorder.commands).toEqual([
        { cmd: "removeColumn", args: ["fruits", "big_seq", "bigserial"] },
        { cmd: "removeColumn", args: ["fruits", "seq", "serial"] },
      ]);
    });

    it("never exposes primary_key as a generic column shorthand", async () => {
      const recorder = new CommandRecorder(pgDelegate);
      await recorder.changeTable("fruits", async (t) => {
        expect((t as unknown as Record<string, unknown>)["primary_key"]).toBeUndefined();
        await t.primaryKey("token", "uuid");
      });
      expect(recorder.commands).toEqual([
        { cmd: "addColumn", args: ["fruits", "token", "uuid", { primaryKey: true }] },
      ]);
    });

    it("records the snake_case type for PG bitVarying (multi-word shorthand)", async () => {
      const recorder = new CommandRecorder(pgDelegate);
      await recorder.changeTable("fruits", async (t) => {
        await (t as any).bitVarying("mask");
      });
      expect(recorder.commands).toEqual([
        { cmd: "addColumn", args: ["fruits", "mask", "bit_varying"] },
      ]);
    });
  });

  describe("change_table surfaces adapter ColumnMethods shorthands (MySQL unsigned/blob)", () => {
    // Mirrors Rails: the MySQL `ColumnMethods` mixin exposes `t.unsignedInteger`,
    // `t.mediumtext`, `t.longblob`, ... inside change_table — shorthands the
    // adapter advertises via _columnMethodNames() beyond NATIVE_DATABASE_TYPES.
    //
    // The proxy normalizes the camelCase method name back to the snake symbol
    // Rails' `define_column_methods` records (`unsignedInteger` ->
    // `unsigned_integer`); single-token shorthands (mediumtext, longblob) are
    // unchanged.
    const mysqlLike = mysqlDelegate;

    it("records addColumn for MySQL shorthands (up adds)", async () => {
      const recorder = new CommandRecorder(mysqlLike);
      await recorder.changeTable("fruits", async (t) => {
        await (t as any).unsignedInteger("qty");
        await (t as any).mediumtext("notes");
        await (t as any).longblob("payload");
      });
      expect(recorder.commands).toEqual([
        { cmd: "addColumn", args: ["fruits", "qty", "unsigned_integer"] },
        { cmd: "addColumn", args: ["fruits", "notes", "mediumtext"] },
        { cmd: "addColumn", args: ["fruits", "payload", "longblob"] },
      ]);
    });

    it("reverts MySQL shorthands to removeColumn (down removes)", async () => {
      const recorder = new CommandRecorder(mysqlLike);
      await recorder.revert(async () => {
        await recorder.changeTable("fruits", async (t) => {
          await (t as any).unsignedInteger("qty");
          await (t as any).mediumtext("notes");
        });
      });
      expect(recorder.commands).toEqual([
        { cmd: "removeColumn", args: ["fruits", "notes", "mediumtext"] },
        { cmd: "removeColumn", args: ["fruits", "qty", "unsigned_integer"] },
      ]);
    });
  });

  describe("bulk invert change table", () => {
    it("records two changeTable commands from revert + revert-of-revert", async () => {
      const delegate = { ...abstractDelegate, supportsBulkAlter: () => true };
      const recorder = new CommandRecorder(delegate);

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

      expect(recorder.commands).toHaveLength(2);
      expect(recorder.commands[0].cmd).toBe("changeTable");
      expect(recorder.commands[0].args[0]).toBe("fruits");
      expect(recorder.commands[1].cmd).toBe("changeTable");
      expect(recorder.commands[1].args[0]).toBe("fruits");
    });
  });
});

describe("Migration", () => {
  describe("CommandRecorderTest", () => {
    it("respond to delegates", () => {
      const recorder = new CommandRecorder({ america() {} }) as unknown as {
        america: unknown;
      };
      expect(typeof recorder.america).toBe("function");
    });

    it("send calls super", () => {
      const recorder = new CommandRecorder(abstractDelegate) as unknown as {
        nonExistingMethod(name: string): void;
      };
      expect(() => recorder.nonExistingMethod("horses")).toThrow(TypeError);
    });

    it("send delegates to record", () => {
      const recorder = new CommandRecorder({ createTable(_name: string) {} });
      // The recorder only records the command — no DDL runs, so there is no table to tear down.
      // eslint-disable-next-line blazetrails/require-table-teardown
      (recorder as unknown as { createTable(name: string): void }).createTable("horses");
      expect(recorder.commands).toEqual([{ cmd: "createTable", args: ["horses"] }]);
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
      const recorder = new CommandRecorder(abstractDelegate);
      expect(() => recorder.inverseOf("execute", ["some sql"])).toThrow(IrreversibleMigration);
    });

    it("irreversible commands raise exception", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await expect(
        recorder.revert(async () => {
          (recorder as unknown as { execute(sql: string): void }).execute("some sql");
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("record", () => {
      const recorder = new CommandRecorder(abstractDelegate);
      recorder.record("createTable", ["system_settings"]);
      expect(recorder.commands.length).toBe(1);
    });

    it("inverted commands are reversed", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.revert(async () => {
        recorder.record("createTable", ["hello"]);
        recorder.record("createTable", ["world"]);
      });
      const tables = recorder.commands.map(({ args }) => args);
      expect(tables).toEqual([["world"], ["hello"]]);
    });

    it("revert order", async () => {
      const block = (t: Table) => t.string("name");
      const recorder = new CommandRecorder(abstractDelegate) as unknown as CommandRecorder & {
        createTable(...args: unknown[]): void;
      };
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
        { cmd: "createTable", args: ["apples", block] },
        { cmd: "dropTable", args: ["elderberries"] },
        { cmd: "createTable", args: ["clementines", block] },
        { cmd: "createTable", args: ["dates"] },
        { cmd: "dropTable", args: ["bananas", block] },
        { cmd: "dropTable", args: ["grapes"] },
        { cmd: "dropTable", args: ["figs", block] },
      ]);
    });

    it("invert change table", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.revert(async () => {
        await recorder.changeTable("fruits", async (t) => {
          await t.string("name");
          await t.rename("kind", "cultivar");
        });
      });

      expect(recorder.commands).toEqual([
        { cmd: "renameColumn", args: ["fruits", "cultivar", "kind"] },
        { cmd: "removeColumn", args: ["fruits", "name", "string"] },
      ]);

      await expect(
        recorder.revert(async () => {
          await recorder.changeTable("fruits", async (t) => {
            await t.remove("kind");
          });
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });

    it("invert create table", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.revert(async () => {
        recorder.record("createTable", ["system_settings"]);
      });
      const dropTable = recorder.commands[0];
      expect(dropTable).toEqual({ cmd: "dropTable", args: ["system_settings"] });
    });

    it("invert create table with if not exists", async () => {
      const recorder = new CommandRecorder(abstractDelegate);
      await recorder.revert(async () => {
        recorder.record("createTable", ["system_settings", { ifNotExists: true }]);
      });
      const dropTable = recorder.commands[0];
      expect(dropTable).toEqual({ cmd: "dropTable", args: ["system_settings", {}] });
    });

    it("invert create table with options and block", () => {
      const block = () => {};
      const dropTable = new CommandRecorder(abstractDelegate).inverseOf("createTable", [
        "people_reminders",
        { id: false },
        block,
      ]);
      expect(dropTable).toEqual({
        cmd: "dropTable",
        args: ["people_reminders", { id: false }, block],
      });
    });

    it("invert drop table", () => {
      const block = () => {};
      const createTable = new CommandRecorder(abstractDelegate).inverseOf("dropTable", [
        "people_reminders",
        { id: false },
        block,
      ]);
      expect(createTable).toEqual({
        cmd: "createTable",
        args: ["people_reminders", { id: false }, block],
      });
    });

    it("invert drop table with if exists", () => {
      const block = () => {};
      const createTable = new CommandRecorder(abstractDelegate).inverseOf("dropTable", [
        "people_reminders",
        { id: false, ifExists: true },
        block,
      ]);
      expect(createTable).toEqual({
        cmd: "createTable",
        args: ["people_reminders", { id: false }, block],
      });
    });

    it("invert drop table without a block nor option", () => {
      const inverseOf = () =>
        new CommandRecorder(abstractDelegate).inverseOf("dropTable", ["people_reminders"]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given options or a block (can be empty).",
      );
    });

    it("invert drop table with multiple tables", () => {
      const inverseOf = () =>
        new CommandRecorder(abstractDelegate).inverseOf("dropTable", ["musics", "artists"]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert drop table with multiple tables and options", () => {
      const inverseOf = () =>
        new CommandRecorder(abstractDelegate).inverseOf("dropTable", [
          "musics",
          "artists",
          { id: false },
        ]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert drop table with multiple tables and block", () => {
      const block = () => {};
      const inverseOf = () =>
        new CommandRecorder(abstractDelegate).inverseOf("dropTable", ["musics", "artists", block]);
      expect(inverseOf).toThrow(IrreversibleMigration);
      expect(inverseOf).toThrow(
        "To avoid mistakes, drop_table is only reversible if given a single table name.",
      );
    });

    it("invert create join table", () => {
      const dropJoinTable = new CommandRecorder(abstractDelegate).inverseOf("createJoinTable", [
        "musics",
        "artists",
      ]);
      expect(dropJoinTable).toEqual({ cmd: "dropJoinTable", args: ["musics", "artists"] });
    });

    it("invert create join table with table name", () => {
      const dropJoinTable = new CommandRecorder(abstractDelegate).inverseOf("createJoinTable", [
        "musics",
        "artists",
        { tableName: "catalog" },
      ]);
      expect(dropJoinTable).toEqual({
        cmd: "dropJoinTable",
        args: ["musics", "artists", { tableName: "catalog" }],
      });
    });

    it("invert drop join table", () => {
      const block = () => {};
      const createJoinTable = new CommandRecorder(abstractDelegate).inverseOf("dropJoinTable", [
        "musics",
        "artists",
        { tableName: "catalog" },
        block,
      ]);
      expect(createJoinTable).toEqual({
        cmd: "createJoinTable",
        args: ["musics", "artists", { tableName: "catalog" }, block],
      });
    });

    it("invert rename table", () => {
      const rename = new CommandRecorder(abstractDelegate).inverseOf("renameTable", ["old", "new"]);
      expect(rename).toEqual({ cmd: "renameTable", args: ["new", "old"] });
    });

    it("invert add column", () => {
      const remove = new CommandRecorder(abstractDelegate).inverseOf("addColumn", [
        "table",
        "column",
        "type",
        {},
      ]);
      expect(remove).toEqual({ cmd: "removeColumn", args: ["table", "column", "type", {}] });
    });

    it("invert change column", () => {
      expect(() =>
        new CommandRecorder(abstractDelegate).inverseOf("changeColumn", [
          "table",
          "column",
          "type",
          {},
        ]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert change column default", () => {
      expect(() =>
        new CommandRecorder(abstractDelegate).inverseOf("changeColumnDefault", [
          "table",
          "column",
          "default_value",
        ]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert change column default with from and to", () => {
      const change = new CommandRecorder(abstractDelegate).inverseOf("changeColumnDefault", [
        "table",
        "column",
        { from: "old_value", to: "new_value" },
      ]);
      expect(change).toEqual({
        cmd: "changeColumnDefault",
        args: ["table", "column", { from: "new_value", to: "old_value" }],
      });
    });

    it("invert change column default with from and to with boolean", () => {
      const change = new CommandRecorder(abstractDelegate).inverseOf("changeColumnDefault", [
        "table",
        "column",
        { from: true, to: false },
      ]);
      expect(change).toEqual({
        cmd: "changeColumnDefault",
        args: ["table", "column", { from: false, to: true }],
      });
    });

    it("invert change column null", () => {
      const add = new CommandRecorder(abstractDelegate).inverseOf("changeColumnNull", [
        "table",
        "column",
        true,
      ]);
      expect(add).toEqual({ cmd: "changeColumnNull", args: ["table", "column", false] });
    });

    it("invert remove column", () => {
      const add = new CommandRecorder(abstractDelegate).inverseOf("removeColumn", [
        "table",
        "column",
        "type",
        {},
      ]);
      expect(add).toEqual({ cmd: "addColumn", args: ["table", "column", "type", {}] });
    });

    it("invert remove column without type", () => {
      expect(() =>
        new CommandRecorder(abstractDelegate).inverseOf("removeColumn", ["table", "column"]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert rename column", () => {
      const rename = new CommandRecorder(abstractDelegate).inverseOf("renameColumn", [
        "table",
        "old",
        "new",
      ]);
      expect(rename).toEqual({ cmd: "renameColumn", args: ["table", "new", "old"] });
    });

    it("invert add index", () => {
      const remove = new CommandRecorder(abstractDelegate).inverseOf("addIndex", [
        "table",
        ["one", "two"],
      ]);
      expect(remove).toEqual({ cmd: "removeIndex", args: ["table", ["one", "two"]] });
    });

    it("invert add index with name", () => {
      const remove = new CommandRecorder(abstractDelegate).inverseOf("addIndex", [
        "table",
        ["one", "two"],
        { name: "new_index" },
      ]);
      expect(remove).toEqual({
        cmd: "removeIndex",
        args: ["table", ["one", "two"], { name: "new_index" }],
      });
    });

    it("invert add index with algorithm option", () => {
      const remove = new CommandRecorder(abstractDelegate).inverseOf("addIndex", [
        "table",
        "one",
        { algorithm: ":concurrently" },
      ]);
      expect(remove).toEqual({
        cmd: "removeIndex",
        args: ["table", "one", { algorithm: ":concurrently" }],
      });
    });

    it("invert remove index", () => {
      const add = new CommandRecorder(abstractDelegate).inverseOf("removeIndex", ["table", "one"]);
      expect(add).toEqual({ cmd: "addIndex", args: ["table", "one"] });
    });

    it("invert remove index with positional column", () => {
      const add = new CommandRecorder(abstractDelegate).inverseOf("removeIndex", [
        "table",
        ["one", "two"],
        { options: true },
      ]);
      expect(add).toEqual({ cmd: "addIndex", args: ["table", ["one", "two"], { options: true }] });
    });

    it("invert remove index with column", () => {
      const add = new CommandRecorder(abstractDelegate).inverseOf("removeIndex", [
        "table",
        { column: ["one", "two"], options: true },
      ]);
      expect(add).toEqual({ cmd: "addIndex", args: ["table", ["one", "two"], { options: true }] });
    });

    it("invert remove index with name", () => {
      const add = new CommandRecorder(abstractDelegate).inverseOf("removeIndex", [
        "table",
        { column: ["one", "two"], name: "new_index" },
      ]);
      expect(add).toEqual({
        cmd: "addIndex",
        args: ["table", ["one", "two"], { name: "new_index" }],
      });
    });

    it("invert remove index with no special options", () => {
      const add = new CommandRecorder(abstractDelegate).inverseOf("removeIndex", [
        "table",
        { column: ["one", "two"] },
      ]);
      expect(add).toEqual({ cmd: "addIndex", args: ["table", ["one", "two"]] });
    });

    it("invert remove index with no column", () => {
      expect(() =>
        new CommandRecorder(abstractDelegate).inverseOf("removeIndex", [
          "table",
          { name: "new_index" },
        ]),
      ).toThrow(IrreversibleMigration);
    });

    it("invert rename index", () => {
      const rename = new CommandRecorder(abstractDelegate).inverseOf("renameIndex", [
        "table",
        "old",
        "new",
      ]);
      expect(rename).toEqual({ cmd: "renameIndex", args: ["table", "new", "old"] });
    });
  });
});
