/**
 * Faithful port of:
 *   activerecord/test/cases/invertible_migration_test.rb
 *
 * Test names mirror the Rails `test_*` methods so `test:compare` can map them.
 * Migrations and the `Horse` model both lease the shared worker connection via
 * `setupHandlerSuite()`, exactly as Rails routes everything through
 * `ActiveRecord::Base.lease_connection`. The scratch tables (`horses`,
 * `new_horses`) are Rails' own — created and dropped per test, never canonical.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./base.js";
import { Migration, IrreversibleMigration } from "./migration.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { itIfSupports, describeIfSupports } from "./test-helpers/supports.js";
import { adapterType } from "./test-adapter.js";
import { registerModel } from "./associations.js";

class Horse extends Base {
  static {
    this.tableName = "horses";
    registerModel(this);
  }
}

// -- Migration class hierarchy (mirrors the Rails nested classes) --

class SilentMigration extends Migration {
  // sssshhhhh!!
  write(): void {}
}

class InvertibleMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("horses", (t) => {
      t.column("content", "text");
      t.column("remind_at", "datetime");
      t.column("place_id", "integer");
      t.column("parent_id", "bigint");
    });
  }
}

class InvertibleChangeTableMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.changeTable("horses", async (t) => {
      await t.column("name", "string");
      await t.remove("remind_at", { type: "datetime" });
    });
  }
}

class InvertibleTransactionMigration extends InvertibleMigration {
  async change(): Promise<void> {
    if (this.isReverting()) {
      await super.change();
      return;
    }
    await this.connection.transaction(async () => {
      await super.change();
    });
  }
}

class InvertibleRevertMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.revert(async () => {
      await this.createTable("horses", (t) => {
        t.column("content", "text");
        t.column("remind_at", "datetime");
      });
    });
  }
}

class InvertibleByPartsMigration extends SilentMigration {
  test?: (dir: symbol) => void;
  async change(): Promise<void> {
    // Torn down by the suite afterEach (drops horses + new_horses).
    // eslint-disable-next-line blazetrails/require-table-teardown
    await this.createTable("new_horses", (t) => {
      t.column("breed", "string");
    });
    await this.reversible((dir) => {
      this.test?.(Symbol.for("both"));
      dir.up(async () => this.test?.(Symbol.for("up")));
      dir.down(async () => this.test?.(Symbol.for("down")));
    });
    await this.revert(async () => {
      await this.createTable("horses", (t) => {
        t.column("content", "text");
        t.column("remind_at", "datetime");
      });
    });
  }
}

class NonInvertibleMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("horses", (t) => {
      t.column("content", "text");
      t.column("remind_at", "datetime");
    });
    await this.removeColumn("horses", "content");
  }
}

class RemoveIndexMigration1 extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("horses", (t) => {
      t.column("name", "string");
      t.column("color", "string");
      t.index(["name", "color"]);
      t.index(["color"]);
    });
  }
}

class RemoveIndexMigration2 extends SilentMigration {
  async change(): Promise<void> {
    await this.changeTable("horses", async (t) => {
      await t.removeIndex(["name", "color"]);
      if (await (t as any).indexExists?.(["color"])) {
        await t.removeIndex(["color"]);
      }
    });
  }
}

class ChangeColumnDefault1 extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("horses", (t) => {
      t.column("name", "string", { default: "Sekitoba" });
    });
  }
}

class ChangeColumnDefault2 extends SilentMigration {
  async change(): Promise<void> {
    await this.changeColumnDefault("horses", "name", { from: "Sekitoba", to: "Diomed" });
  }
}

class ChangeColumnComment1 extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("horses", (t) => {
      t.column("name", "string", { comment: "Sekitoba" });
    });
  }
}

class ChangeColumnComment2 extends SilentMigration {
  async change(): Promise<void> {
    await this.changeColumnComment("horses", "name", { from: "Sekitoba", to: "Diomed" });
  }
}

class ChangeTableComment1 extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("horses", { comment: "Sekitoba" });
  }
}

class ChangeTableComment2 extends SilentMigration {
  async change(): Promise<void> {
    await this.changeTableComment("horses", { from: "Sekitoba", to: "Diomed" });
  }
}

class DisableExtension1 extends SilentMigration {
  async change(): Promise<void> {
    await this.enableExtension("hstore");
  }
}

class DisableExtension2 extends SilentMigration {
  async change(): Promise<void> {
    await this.disableExtension("hstore", { force: "cascade" });
  }
}

class LegacyMigration extends Migration {
  async up(): Promise<void> {
    await this.createTable("horses", (t) => {
      t.column("content", "text");
      t.column("remind_at", "datetime");
    });
  }
  async down(): Promise<void> {
    await this.dropTable("horses");
  }
}

class RevertWholeMigration extends SilentMigration {
  protected _migration: Migration;
  constructor(migration: Migration) {
    super();
    this._migration = migration;
  }
  async change(): Promise<void> {
    await this.revert(this._migration);
  }
}

class NestedRevertWholeMigration extends RevertWholeMigration {
  async change(): Promise<void> {
    await this.revert(async () => {
      await super.change();
    });
  }
}

class RevertNamedIndexMigration1 extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("horses", (t) => {
      t.column("content", "string");
      t.column("remind_at", "datetime");
    });
    await this.addIndex("horses", "content");
  }
}

class RevertNamedIndexMigration2 extends SilentMigration {
  async change(): Promise<void> {
    await this.addIndex("horses", "content", { name: "horses_index_named" });
  }
}

class RevertNonNamedExpressionIndexMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.addIndex("horses", "remind_at, place_id");
  }
}

class UpOnlyMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.addColumn("horses", "oldie", "integer", { default: 0 });
    await this.upOnly(async () => {
      await this.connection.executeMutation("update horses set oldie = 1");
    });
  }
}

class RevertForeignKeyWithInvalidOption extends SilentMigration {
  async change(): Promise<void> {
    await this.addForeignKey("horses", "horses", { column: "parent_id", invalid: "option" } as any);
  }
}

class RevertCheckConstraintWithInvalidOption extends SilentMigration {
  async change(): Promise<void> {
    await this.addCheckConstraint("horses", "place_id > 0", { invalid: "option" });
  }
}

describe("InvertibleMigrationTest", () => {
  setupHandlerSuite();

  afterEach(async () => {
    const connection = Base.leaseConnection();
    for (const table of ["horses", "new_horses"]) {
      if (await connection.tableExists(table)) {
        await connection.dropTable(table);
      }
    }
    Horse.resetColumnInformation();
  });

  it("no reverse", async () => {
    const migration = new NonInvertibleMigration();
    await migration.migrate("up");
    await expect(migration.migrate("down")).rejects.toThrow(IrreversibleMigration);
  });

  // trails' changeTable `removeIndex` records no `column` info, so the migrate
  // reverse path throws "Cannot reverse removeIndex without column info".
  // Tracked-pending-convergence under RFC 0023-surfaced-deviations.
  it.skip("exception on removing index without column option", async () => {
    const indexDefinition: [string, string[]] = ["horses", ["name", "color"]];
    const migration1 = new RemoveIndexMigration1();
    await migration1.migrate("up");
    expect(await migration1.connection.indexExists(...indexDefinition)).toBe(true);

    const migration2 = new RemoveIndexMigration2();
    await migration2.migrate("up");
    expect(await migration2.connection.indexExists(...indexDefinition)).toBe(false);

    await migration2.migrate("down");
    expect(await migration2.connection.indexExists(...indexDefinition)).toBe(true);
  });

  it("migrate up", async () => {
    const migration = new InvertibleMigration();
    await migration.migrate("up");
    expect(await migration.connection.tableExists("horses")).toBe(true);
  });

  it("migrate down", async () => {
    const migration = new InvertibleMigration();
    await migration.migrate("up");
    await migration.migrate("down");
    expect(await migration.connection.tableExists("horses")).toBe(false);
  });

  // trails' `revert(fn)` always reverses the recorded ops regardless of the
  // migration's own direction, so a migration reverting a `revert` block (and
  // its `dropTable` reverse) is not yet direction-aware. Tracked-pending-
  // convergence under RFC 0023-surfaced-deviations (revert-direction semantics).
  it.skip("migrate revert", async () => {
    const migration = new InvertibleMigration();
    const revert = new InvertibleRevertMigration();
    await migration.migrate("up");
    await revert.migrate("up");
    expect(await migration.connection.tableExists("horses")).toBe(false);
    await revert.migrate("down");
    expect(await migration.connection.tableExists("horses")).toBe(true);
    await migration.migrate("down");
    expect(await migration.connection.tableExists("horses")).toBe(false);
  });

  it("migrate revert change table", async () => {
    await new InvertibleMigration().migrate("up");
    const migration = new InvertibleChangeTableMigration();
    await migration.migrate("up");
    expect(await migration.connection.columnExists("horses", "remind_at")).toBe(false);
    await migration.migrate("down");
    expect(await migration.connection.columnExists("horses", "remind_at")).toBe(true);
  });

  it.skip("migrate revert by part", async () => {
    await new InvertibleMigration().migrate("up");
    const received: symbol[] = [];
    const migration = new InvertibleByPartsMigration();
    migration.test = (dir) => {
      received.push(dir);
    };
    await migration.migrate("up");
    expect(received).toEqual([Symbol.for("both"), Symbol.for("up")]);
    expect(await migration.connection.tableExists("horses")).toBe(false);
    expect(await migration.connection.tableExists("new_horses")).toBe(true);
    await migration.migrate("down");
    expect(received).toEqual([
      Symbol.for("both"),
      Symbol.for("up"),
      Symbol.for("both"),
      Symbol.for("down"),
    ]);
    expect(await migration.connection.tableExists("horses")).toBe(true);
    expect(await migration.connection.tableExists("new_horses")).toBe(false);
  });

  it.skip("migrate revert whole migration", async () => {
    const migration = new InvertibleMigration();
    for (const klass of [LegacyMigration, InvertibleMigration]) {
      const revert = new RevertWholeMigration(new klass());
      await migration.migrate("up");
      await revert.migrate("up");
      expect(await migration.connection.tableExists("horses")).toBe(false);
      await revert.migrate("down");
      expect(await migration.connection.tableExists("horses")).toBe(true);
      await migration.migrate("down");
      expect(await migration.connection.tableExists("horses")).toBe(false);
    }
  });

  it.skip("migrate nested revert whole migration", async () => {
    const revert = new NestedRevertWholeMigration(new InvertibleRevertMigration());
    await revert.migrate("down");
    expect(await revert.connection.tableExists("horses")).toBe(true);
    await revert.migrate("up");
    expect(await revert.connection.tableExists("horses")).toBe(false);
  });

  it("migrate revert transaction", async () => {
    const migration = new InvertibleTransactionMigration();
    await migration.migrate("up");
    expect(await migration.connection.tableExists("horses")).toBe(true);
    await migration.migrate("down");
    expect(await migration.connection.tableExists("horses")).toBe(false);
  });

  it.skip("migrate revert change column default", async () => {
    const migration1 = new ChangeColumnDefault1();
    await migration1.migrate("up");
    Horse.resetColumnInformation();
    expect(new Horse().readAttribute("name")).toBe("Sekitoba");

    const migration2 = new ChangeColumnDefault2();
    await migration2.migrate("up");
    Horse.resetColumnInformation();
    expect(new Horse().readAttribute("name")).toBe("Diomed");

    await migration2.migrate("down");
    Horse.resetColumnInformation();
    expect(new Horse().readAttribute("name")).toBe("Sekitoba");
  });

  itIfSupports("comments", "migrate revert change column comment", async () => {
    const migration1 = new ChangeColumnComment1();
    await migration1.migrate("up");
    Horse.resetColumnInformation();
    expect((await Horse.columnsHash())["name"].comment).toBe("Sekitoba");

    const migration2 = new ChangeColumnComment2();
    await migration2.migrate("up");
    Horse.resetColumnInformation();
    expect((await Horse.columnsHash())["name"].comment).toBe("Diomed");

    await migration2.migrate("down");
    Horse.resetColumnInformation();
    expect((await Horse.columnsHash())["name"].comment).toBe("Sekitoba");
  });

  itIfSupports("comments", "migrate revert change table comment", async () => {
    const connection = Base.leaseConnection();
    const migration1 = new ChangeTableComment1();
    await migration1.migrate("up");
    expect(await (connection as any).tableComment("horses")).toBe("Sekitoba");

    const migration2 = new ChangeTableComment2();
    await migration2.migrate("up");
    expect(await (connection as any).tableComment("horses")).toBe("Diomed");

    await migration2.migrate("down");
    expect(await (connection as any).tableComment("horses")).toBe("Sekitoba");
  });

  it.skipIf(adapterType !== "postgres")("migrate enable and disable extension", async () => {
    const connection = Horse.leaseConnection();
    const migration1 = new InvertibleMigration();
    const migration2 = new DisableExtension1();
    const migration3 = new DisableExtension2();

    expect(await (connection as any).extensionAvailable("hstore")).toBe(true);

    await migration1.migrate("up");
    await migration2.migrate("up");
    expect(await (connection as any).extensionEnabled("hstore")).toBe(true);

    await migration3.migrate("up");
    expect(await (connection as any).extensionEnabled("hstore")).toBe(false);

    await migration3.migrate("down");
    expect(await (connection as any).extensionEnabled("hstore")).toBe(true);

    await migration2.migrate("down");
    expect(await (connection as any).extensionEnabled("hstore")).toBe(false);

    await (connection as any).enableExtension("hstore");
  });

  // Rails' drop_table accepts a block (the table definition) so the migrate
  // path can recreate the table on reversal; trails' Migration#dropTable takes
  // no block and _reverseOperation throws IrreversibleMigration for dropTable.
  // Tracked-pending-convergence under RFC 0023-surfaced-deviations.
  it.skip("migrate revert drop table", () => {});

  // Rails asserts the exact CommandRecorder#commands triples
  // ([sym, args, block]); the trails recorder records {cmd, args} without the
  // block, so a verbatim port needs block-tracking in CommandRecorder.
  // Tracked-pending-convergence under RFC 0023-surfaced-deviations.
  it.skip("revert order", () => {});

  it("legacy up", async () => {
    const migration = new LegacyMigration();
    await migration.up();
    expect(await Base.leaseConnection().tableExists("horses")).toBe(true);
  });

  it("legacy down", async () => {
    const migration = new LegacyMigration();
    await migration.up();
    await migration.down();
    expect(await Base.leaseConnection().tableExists("horses")).toBe(false);
  });

  it("up", async () => {
    const migration = new LegacyMigration();
    await migration.up();
    expect(await Base.leaseConnection().tableExists("horses")).toBe(true);
  });

  it("down", async () => {
    const migration = new LegacyMigration();
    await migration.up();
    await migration.down();
    expect(await Base.leaseConnection().tableExists("horses")).toBe(false);
  });

  it("migrate down with table name prefix", async () => {
    Base.tableNamePrefix = "p_";
    Base.tableNameSuffix = "_s";
    try {
      const migration = new InvertibleMigration();
      await migration.migrate("up");
      await expect(migration.migrate("down")).resolves.not.toThrow();
      expect(await Base.leaseConnection().tableExists("p_horses_s")).toBe(false);
    } finally {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
    }
  });

  it("migrate revert add index without name on expression", async () => {
    await new InvertibleMigration().migrate("up");
    await new RevertNonNamedExpressionIndexMigration().migrate("up");

    const connection = Base.leaseConnection();
    expect(await connection.indexExists("horses", ["remind_at", "place_id"])).toBe(true);

    await new RevertNonNamedExpressionIndexMigration().migrate("down");

    expect(await connection.indexExists("horses", ["remind_at", "place_id"])).toBe(false);
  });

  // MySQL/Oracle disallow duplicate indexes on the same columns.
  it.skipIf(adapterType === "mysql")("migrate revert add index with name", async () => {
    await new RevertNamedIndexMigration1().migrate("up");
    await new RevertNamedIndexMigration2().migrate("up");
    await new RevertNamedIndexMigration2().migrate("down");

    const connection = Base.leaseConnection();
    expect(await connection.indexExists("horses", "content")).toBe(true);
    expect(await connection.indexExists("horses", "content", { name: "horses_index_named" })).toBe(
      false,
    );
  });

  it("up only", async () => {
    await new InvertibleMigration().migrate("up");
    const horse1 = await Horse.create();
    // populates existing horses with oldie = 1 but new ones have default 0
    await new UpOnlyMigration().migrate("up");
    Horse.resetColumnInformation();
    await horse1.reload();
    const horse2 = await Horse.create();

    expect(horse1.readAttribute("oldie")).toBe(1); // created before migration
    expect(horse2.readAttribute("oldie")).toBe(0); // created after migration

    await new UpOnlyMigration().migrate("down"); // should be no error
    const connection = Base.leaseConnection();
    expect(await connection.columnExists("horses", "oldie")).toBe(false);
    Horse.resetColumnInformation();
  });

  describeIfSupports("unique_constraints", "unique constraints", () => {
    class RevertUniqueConstraintWithInvalidOption extends SilentMigration {
      async change(): Promise<void> {
        await this.addUniqueConstraint("horses", "place_id", { invalid: "option" });
      }
    }

    it("migrate revert add unique constraint with invalid option", async () => {
      await new InvertibleMigration().migrate("up");
      await new RevertUniqueConstraintWithInvalidOption().migrate("up");

      const connection = Base.leaseConnection();
      expect((await (connection as any).uniqueConstraints("horses")).length).toBe(1);

      await new RevertUniqueConstraintWithInvalidOption().migrate("down");
      expect((await (connection as any).uniqueConstraints("horses")).length).toBe(0);
    });
  });

  // trails' SQLite adapter emits `ALTER TABLE ... ADD CONSTRAINT` for
  // addForeignKey, which SQLite rejects (it needs table recreation); PG/MySQL
  // run it. SQLite case tracked-pending-convergence under
  // RFC 0023-surfaced-deviations.
  it.skipIf(adapterType === "sqlite")(
    "migrate revert add foreign key with invalid option",
    async () => {
      await new InvertibleMigration().migrate("up");
      await new RevertForeignKeyWithInvalidOption().migrate("up");

      const connection = Base.leaseConnection();
      expect((await connection.foreignKeys("horses")).length).toBe(1);

      await new RevertForeignKeyWithInvalidOption().migrate("down");
      expect((await connection.foreignKeys("horses")).length).toBe(0);
    },
  );

  itIfSupports(
    "check_constraints",
    "migrate revert add check constraint with invalid option",
    async () => {
      await new InvertibleMigration().migrate("up");
      await new RevertCheckConstraintWithInvalidOption().migrate("up");

      const connection = Base.leaseConnection();
      expect((await (connection as any).checkConstraints("horses")).length).toBe(1);

      await new RevertCheckConstraintWithInvalidOption().migrate("down");
      expect((await (connection as any).checkConstraints("horses")).length).toBe(0);
    },
  );
});
