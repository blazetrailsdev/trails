import { describe, it, expect } from "vitest";
import { CommandRecorder, RecorderTableProxy } from "./command-recorder.js";
import { IrreversibleMigration } from "../migration.js";

describe("CommandRecorder", () => {
  it("records commands", () => {
    const recorder = new CommandRecorder();
    recorder.record("addColumn", ["users", "name", "string"]);
    expect(recorder.commands).toEqual([{ cmd: "addColumn", args: ["users", "name", "string"] }]);
  });

  it("reverting toggles and inverts commands", async () => {
    const recorder = new CommandRecorder();
    await recorder.revert(async () => {
      recorder.record("addColumn", ["users", "name", "string"]);
    });
    expect(recorder.commands[0].cmd).toBe("removeColumn");
  });

  describe("inverseOf", () => {
    it("returns the inverse command", () => {
      const recorder = new CommandRecorder();
      const result = recorder.inverseOf("addColumn", ["users", "name", "string"]);
      expect(result).toEqual({ cmd: "removeColumn", args: ["users", "name", "string"] });
    });

    it("throws IrreversibleMigration for unknown commands", () => {
      const recorder = new CommandRecorder();
      expect(() => recorder.inverseOf("dropDatabase", [])).toThrow(IrreversibleMigration);
    });
  });

  describe("invertCreateTable / invertDropTable", () => {
    it("invertCreateTable removes ifNotExists and returns dropTable", () => {
      const recorder = new CommandRecorder();
      const [cmd, args] = recorder.invertCreateTable(["users", { ifNotExists: true }]);
      expect(cmd).toBe("dropTable");
      expect((args[1] as Record<string, unknown>)["ifNotExists"]).toBeUndefined();
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

    it("invertDropTable throws without options/block for single table", () => {
      const recorder = new CommandRecorder();
      expect(() => recorder.invertDropTable(["users"])).toThrow(IrreversibleMigration);
    });

    it("invertDropTable throws for multiple tables", () => {
      const recorder = new CommandRecorder();
      expect(() => recorder.invertDropTable(["users", "posts"])).toThrow(IrreversibleMigration);
    });

    it("invertDropTable returns createTable when options present", () => {
      const recorder = new CommandRecorder();
      const [cmd, args] = recorder.invertDropTable(["users", { force: true }]);
      expect(cmd).toBe("createTable");
      expect(args[0]).toBe("users");
    });
  });

  describe("invertCreateJoinTable / invertDropJoinTable", () => {
    it("invertCreateJoinTable returns dropJoinTable", () => {
      const recorder = new CommandRecorder();
      const [cmd] = recorder.invertCreateJoinTable(["cats", "dogs"]);
      expect(cmd).toBe("dropJoinTable");
    });

    it("invertDropJoinTable returns createJoinTable", () => {
      const recorder = new CommandRecorder();
      const [cmd] = recorder.invertDropJoinTable(["cats", "dogs"]);
      expect(cmd).toBe("createJoinTable");
    });
  });

  describe("invertAddColumn / invertRemoveColumn", () => {
    it("invertAddColumn returns removeColumn", () => {
      const recorder = new CommandRecorder();
      const [cmd] = recorder.invertAddColumn(["users", "age", "integer"]);
      expect(cmd).toBe("removeColumn");
    });

    it("invertRemoveColumn throws without type", () => {
      const recorder = new CommandRecorder();
      expect(() => recorder.invertRemoveColumn(["users", "age"])).toThrow(IrreversibleMigration);
    });

    it("invertRemoveColumn returns addColumn when type given", () => {
      const recorder = new CommandRecorder();
      const [cmd] = recorder.invertRemoveColumn(["users", "age", "integer"]);
      expect(cmd).toBe("addColumn");
    });
  });

  describe("invertAddIndex / invertRemoveIndex", () => {
    it("invertAddIndex returns removeIndex", () => {
      const recorder = new CommandRecorder();
      const [cmd] = recorder.invertAddIndex(["users", "email"]);
      expect(cmd).toBe("removeIndex");
    });

    it("invertRemoveIndex throws without column", () => {
      const recorder = new CommandRecorder();
      expect(() => recorder.invertRemoveIndex(["users"])).toThrow(IrreversibleMigration);
    });

    it("invertRemoveIndex returns addIndex with column option", () => {
      const recorder = new CommandRecorder();
      const [cmd, args] = recorder.invertRemoveIndex(["users", { column: "email" }]);
      expect(cmd).toBe("addIndex");
      expect(args[1]).toBe("email");
    });

    it("invertRemoveIndex handles array column list without treating it as options", () => {
      const [cmd, args] = new CommandRecorder().invertRemoveIndex(["users", ["email", "name"]]);
      expect(cmd).toBe("addIndex");
      expect(args[1]).toEqual(["email", "name"]);
    });
  });

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

  describe("invertRenameTable / invertRenameColumn", () => {
    it("invertRenameTable swaps table names", () => {
      const [cmd, args] = new CommandRecorder().invertRenameTable(["old_users", "new_users"]);
      expect(cmd).toBe("renameTable");
      expect(args).toEqual(["new_users", "old_users"]);
    });

    it("invertRenameColumn swaps column names", () => {
      const [cmd, args] = new CommandRecorder().invertRenameColumn([
        "users",
        "old_name",
        "new_name",
      ]);
      expect(cmd).toBe("renameColumn");
      expect(args).toEqual(["users", "new_name", "old_name"]);
    });
  });

  describe("invertRenameIndex", () => {
    it("swaps index names", () => {
      const [cmd, args] = new CommandRecorder().invertRenameIndex(["users", "old_idx", "new_idx"]);
      expect(cmd).toBe("renameIndex");
      expect(args).toEqual(["users", "new_idx", "old_idx"]);
    });
  });

  describe("invertChangeColumnDefault", () => {
    it("throws without from/to options", () => {
      expect(() => new CommandRecorder().invertChangeColumnDefault(["users", "age", 0])).toThrow(
        IrreversibleMigration,
      );
    });

    it("swaps from/to values", () => {
      const [cmd, args] = new CommandRecorder().invertChangeColumnDefault([
        "users",
        "age",
        { from: 0, to: 18 },
      ]);
      expect(cmd).toBe("changeColumnDefault");
      expect(args[2] as Record<string, unknown>).toEqual({ from: 18, to: 0 });
    });
  });

  describe("invertChangeColumnNull", () => {
    it("flips the nullable boolean", () => {
      const [cmd, args] = new CommandRecorder().invertChangeColumnNull(["users", "email", false]);
      expect(cmd).toBe("changeColumnNull");
      expect(args[2]).toBe(true);
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

  describe("invert change column", () => {
    it("throws IrreversibleMigration", () => {
      const recorder = new CommandRecorder();
      expect(() => recorder.inverseOf("changeColumn", ["table", "column", "string", {}])).toThrow(
        IrreversibleMigration,
      );
    });
  });

  describe("invert change table (non-bulk)", () => {
    it("reverts string + rename inside change_table block", async () => {
      const recorder = new CommandRecorder();
      await recorder.revert(async () => {
        await recorder.changeTable("fruits", {}, async (t) => {
          t.string("name");
          t.rename("kind", "cultivar");
        });
      });
      // Reversed order and inverted: renameColumn first, then removeColumn
      expect(recorder.commands).toHaveLength(2);
      const [first, second] = recorder.commands;
      expect(first.cmd).toBe("renameColumn");
      expect(first.args).toEqual(["fruits", "cultivar", "kind"]);
      expect(second.cmd).toBe("removeColumn");
      expect(second.args[0]).toBe("fruits");
      expect(second.args[1]).toBe("name");
    });

    it("raises IrreversibleMigration when remove lacks type", async () => {
      const recorder = new CommandRecorder();
      await expect(
        recorder.revert(async () => {
          await recorder.changeTable("fruits", {}, async (t) => {
            t.remove("kind"); // no type → not reversible
          });
        }),
      ).rejects.toThrow(IrreversibleMigration);
    });
  });

  describe("bulk invert change table", () => {
    it("records two changeTable commands from revert + revert-of-revert", async () => {
      const delegate = { supportsBulkAlter: () => true };
      const recorder = new CommandRecorder(delegate);

      const block = async (t: RecorderTableProxy) => {
        t.string("name");
        t.rename("kind", "cultivar");
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
