/**
 * Port of the `add_foreign_key` and `remove_foreign_key` halves of
 * `ActiveRecord::Migration::ForeignKeyTest`
 * (vendor/rails/activerecord/test/cases/migration/foreign_key_test.rb:209-330
 * and :393-451, :749-773) plus all of its sibling
 * `ActiveRecord::Migration::CompositeForeignKeyTest` (:824-912). The
 * `SchemaDumpingHelper`-driven dumper cases in `ForeignKeyTest` are still
 * unported.
 *
 * Driven by the ambient connection, mirroring Rails'
 * `@connection = ActiveRecord::Base.lease_connection`. The rockets/astronauts
 * setup/teardown is shared with schema-statements-on-adapter.test.ts via
 * `withRocketTables`.
 */
import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { StatementInvalid } from "../errors.js";
import type { ReferentialAction } from "../connection-adapters/abstract/schema-definitions.js";
import { fixtures } from "../test-helpers/fixtures.js";
import {
  ambientConnection,
  withCompositeRocketTables,
  withRocketTables,
} from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";
import { describeIfSupports } from "../support/supports.js";
import { dumpTableSchema } from "../support/schema-dumping-helper.js";
import type { SchemaSource } from "../schema-dumper.js";

// Rails' `unless current_adapter?(:SQLite3Adapter)` guard on the `fk.name`
// assertions: PRAGMA foreign_key_list exposes no constraint name, so SQLite
// has no name to compare.
const unlessSqlite3Adapter = adapterType !== "sqlite";

describeIfSupports("foreign_keys", "Migration", () => {
  describe("ForeignKeyTest", () => {
    // DDL can't run inside the transactional-fixtures wrapper (PG aborts the
    // outer transaction on a failed statement), matching the schema-statements
    // suite's setup.
    fixtures([], { useTransactionalTests: false });

    it("add foreign key inferes column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.fromTable).toBe("astronauts");
        expect(fk.toTable).toBe("rockets");
        expect(fk.column).toBe("rocket_id");
        expect(fk.primaryKey).toBe("id");
        if (unlessSqlite3Adapter) expect(fk.name).toBe("fk_rails_78146ddd2e");
      });
    });

    it("add foreign key with column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.fromTable).toBe("astronauts");
        expect(fk.toTable).toBe("rockets");
        expect(fk.column).toBe("rocket_id");
        expect(fk.primaryKey).toBe("id");
        if (unlessSqlite3Adapter) expect(fk.name).toBe("fk_rails_78146ddd2e");
      });
    });

    it("add foreign key with if not exists to already referenced table", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        await conn.addForeignKey("astronauts", "rockets", {
          column: "favorite_rocket_id",
          ifNotExists: true,
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(2);
        expect(foreignKeys.every((fk) => fk.toTable === "rockets")).toBe(true);
        expect(foreignKeys.map((fk) => fk.column).sort()).toEqual([
          "favorite_rocket_id",
          "rocket_id",
        ]);
      });
    });

    it("add foreign key with non standard primary key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.createTable("space_shuttles", { id: false, force: true }, (t) => {
          t.bigint("pk", { primaryKey: true });
        });

        try {
          await conn.addForeignKey("astronauts", "space_shuttles", {
            column: "rocket_id",
            primaryKey: "pk",
            name: "custom_pk",
          });

          const foreignKeys = await conn.foreignKeys("astronauts");
          expect(foreignKeys.length).toBe(1);

          const fk = foreignKeys[0];
          expect(fk.fromTable).toBe("astronauts");
          expect(fk.toTable).toBe("space_shuttles");
          expect(fk.primaryKey).toBe("pk");
        } finally {
          await conn.removeForeignKey("astronauts", {
            name: "custom_pk",
            toTable: "space_shuttles",
          });
          await conn.dropTable("space_shuttles");
        }
      });
    });

    it("add on delete restrict foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          onDelete: "restrict",
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        if (adapterType === "mysql") {
          // ON DELETE RESTRICT is the default on MySQL
          expect(fk.onDelete).toBeUndefined();
        } else {
          expect(fk.onDelete).toBe("restrict");
        }
      });
    });

    it("add on delete cascade foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          onDelete: "cascade",
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);
        expect(foreignKeys[0].onDelete).toBe("cascade");
      });
    });

    it("add on delete nullify foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          onDelete: "nullify",
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);
        expect(foreignKeys[0].onDelete).toBe("nullify");
      });
    });

    it("on update and on delete raises with invalid values", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await expect(
          conn.addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            onDelete: "invalid" as unknown as ReferentialAction,
          }),
        ).rejects.toThrow(ArgumentError);

        await expect(
          conn.addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            onUpdate: "invalid" as unknown as ReferentialAction,
          }),
        ).rejects.toThrow(ArgumentError);
      });
    });

    it("add foreign key with on update", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          onUpdate: "nullify",
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);
        expect(foreignKeys[0].onUpdate).toBe("nullify");
      });
    });

    it("add foreign key with non existent from table raises", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        // Rails asserts twice on ONE raise (`e = assert_raises ...`), so the
        // error is captured rather than the call repeated.
        const e = await conn.addForeignKey("missions", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );
        expect(e).toBeInstanceOf(StatementInvalid);
        expect((e as Error).message).toMatch(/missions/);
      });
    });

    it("add foreign key with non existent to table raises", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        // Rails asserts twice on ONE raise (`e = assert_raises ...`), so the
        // error is captured rather than the call repeated.
        const e = await conn.addForeignKey("missions", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );
        expect(e).toBeInstanceOf(StatementInvalid);
        expect((e as Error).message).toMatch(/missions/);
      });
    });

    it("remove foreign key inferes column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", "rockets");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("remove foreign key by column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", { column: "rocket_id" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("remove foreign key by symbol column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", { column: "rocket_id" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it.skipIf(adapterType === "sqlite")("remove foreign key by name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          name: "fancy_named_fk",
        });

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", { name: "fancy_named_fk" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("remove foreign non existing foreign key raises", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        const e = await conn.removeForeignKey("astronauts", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toBe("Table 'astronauts' has no foreign key for rockets");
      });
    });

    it("remove foreign key by the select one on the same table", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        await conn.addReference("astronauts", "myrocket", {
          foreignKey: { toTable: "rockets" },
        });

        expect((await conn.foreignKeys("astronauts")).length).toBe(2);

        await conn.removeForeignKey("astronauts", "rockets", { column: "myrocket_id" });

        const remaining = await conn.foreignKeys("astronauts");
        expect(remaining.map((fk) => [fk.fromTable, fk.toTable, fk.column])).toEqual([
          ["astronauts", "rockets", "rocket_id"],
        ]);
      });
    });

    it("remove foreign key with restrict action", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { onDelete: "restrict" });
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", "rockets", { onDelete: "restrict" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("remove foreign key with if exists not set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);

        const error = await conn.removeForeignKey("astronauts", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );
        expect((error as Error).message).toBe("Table 'astronauts' has no foreign key for rockets");
      });
    });

    it("remove foreign key with if exists set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets", { ifExists: true });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);

        await conn.removeForeignKey("astronauts", "rockets", { ifExists: true });
      });
    });
  });

  describe("CompositeForeignKeyTest", () => {
    fixtures([], { useTransactionalTests: false });

    it("add composite foreign key raises without options", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        const error = await conn.addForeignKey("astronauts", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );

        expect(error).toBeInstanceOf(StatementInvalid);
        const message = (error as Error).message;
        if (adapterType === "postgres") {
          expect(message).toMatch(
            /there is no unique constraint matching given keys for referenced table "rockets"/,
          );
        } else if (adapterType === "sqlite") {
          expect(message).toMatch(/foreign key mismatch - "astronauts" referencing "rockets"/);
        }
        // Rails' MySQL/MariaDB branch builds an `.any?` over three message
        // patterns and then discards the result — it is passed to no assertion
        // (foreign_key_test.rb:850-856), deliberately, because "MariaDB and
        // different versions of MySQL generate different error messages". Only
        // the raise itself is asserted there, so there is nothing to port: an
        // `expect` here would be a stronger pass condition than Rails', failing
        // on any MySQL/MariaDB build whose wording is not one of the three.
      });
    });

    it("add composite foreign key infers column", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.column).toEqual(["rocket_tenant_id", "rocket_id"]);
      });
    });

    it("add composite foreign key raises if column and primary key sizes mismatch", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        const error = await conn
          .addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            primaryKey: ["tenant_id", "id"],
          })
          .then(
            () => undefined,
            (err: unknown) => err,
          );

        expect(error).toBeInstanceOf(ArgumentError);
        expect((error as Error).message).toMatch(
          /:column must reference all the :primary_key columns/,
        );
      });
    });

    it("foreign key exists", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        expect(await conn.foreignKeyExists("astronauts", "rockets")).toBe(true);
        expect(await conn.foreignKeyExists("astronauts", "stars")).toBe(false);
      });
    });

    it("foreign key exists by options", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            primaryKey: ["tenant_id", "id"],
          }),
        ).toBe(true);
        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            column: ["rocket_tenant_id", "rocket_id"],
            primaryKey: ["tenant_id", "id"],
          }),
        ).toBe(true);

        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            primaryKey: ["id", "tenant_id"],
          }),
        ).toBe(false);
        expect(await conn.foreignKeyExists("astronauts", "rockets", { primaryKey: "id" })).toBe(
          false,
        );
        expect(await conn.foreignKeyExists("astronauts", "rockets", { column: "rocket_id" })).toBe(
          false,
        );
      });
    });

    it("remove foreign key", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("schema dumping", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");

        // Deviation: Rails asserts the Ruby DSL line `add_foreign_key "astronauts",
        // "rockets", column: [...], primary_key: [...]`. The TS dumper emits the
        // equivalent `ctx.addForeignKey(...)` call with JSON-formatted arrays.
        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ column: \["rocket_tenant_id","rocket_id"\], primaryKey: \["tenant_id","id"\] \}\);$/m,
        );
      });
    });
  });
});
