/**
 * TS-only cases with no counterpart in
 * `activerecord/test/cases/migration/command_recorder_test.rb`.
 */

import { describe, expect, it } from "vitest";
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

const columnMethods = (t: Table): Record<string, (name: string) => Promise<void>> =>
  t as unknown as Record<string, (name: string) => Promise<void>>;

describe("CommandRecorder", () => {
  it("forwards a non-function delegate member the way public_send does", () => {
    const recorder = new CommandRecorder({ encoding: "utf8", america: () => "hi" }) as unknown as {
      encoding: string;
      america: () => string;
    };
    expect(recorder.encoding).toBe("utf8");
    expect(recorder.america()).toBe("hi");
  });

  it("does not forward a private delegate member, the way public_send does not", () => {
    const recorder = new CommandRecorder({ _secret: () => "no", visible: () => "yes" });
    expect("_secret" in recorder).toBe(false);
    expect("visible" in recorder).toBe(true);
    expect(() => (recorder as unknown as { _secret(): string })._secret()).toThrow(
      /undefined method '_secret'/,
    );
  });

  it("a name no delegate answers raises NoMethodError only when called", () => {
    const recorder = new CommandRecorder({}) as unknown as Record<string, () => void>;
    expect(typeof recorder["nope"]).toBe("function");
    expect(() => recorder["nope"]()).toThrow(/undefined method 'nope'/);
  });

  it("invertCreateTable strips ifNotExists even when fn is last arg", () => {
    const fn = () => {};
    const [cmd, args] = new CommandRecorder().invertCreateTable([
      "users",
      { ifNotExists: true },
      fn,
    ]);
    expect(cmd).toBe("dropTable");
    expect((args[1] as Record<string, unknown>)["ifNotExists"]).toBeUndefined();
  });

  it("invertRemoveIndex handles array column list without treating it as options", () => {
    const [cmd, args] = new CommandRecorder().invertRemoveIndex(["users", ["email", "name"]]);
    expect(cmd).toBe("addIndex");
    expect(args[1]).toEqual(["email", "name"]);
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

  describe("invertAddColumns", () => {
    it("returns removeColumns", () => {
      const [cmd] = new CommandRecorder().invertAddColumns(["users", "name", "age"]);
      expect(cmd).toBe("removeColumns");
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
        await columnMethods(t).serial("seq");
        await columnMethods(t).bigserial("big_seq");
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
          await columnMethods(t).serial("seq");
          await columnMethods(t).bigserial("big_seq");
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
        await columnMethods(t).bitVarying("mask");
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
        await columnMethods(t).unsignedInteger("qty");
        await columnMethods(t).mediumtext("notes");
        await columnMethods(t).longblob("payload");
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
          await columnMethods(t).unsignedInteger("qty");
          await columnMethods(t).mediumtext("notes");
        });
      });
      expect(recorder.commands).toEqual([
        { cmd: "removeColumn", args: ["fruits", "notes", "mediumtext"] },
        { cmd: "removeColumn", args: ["fruits", "qty", "unsigned_integer"] },
      ]);
    });
  });
});
