/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/foreign_table_test.rb
 *
 * Loopback FDW: foreign_server points back at the same database and
 * foreign_professors is mapped to a local professors table. Rails wires
 * foreign_server at the secondary "arunit2" database; loopback keeps the
 * test infra single-database.
 */
import { describe, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { TEST_SCHEMA } from "../../test-helpers/test-schema.js";
import { Base } from "../../index.js";
import { Professor } from "../../test-helpers/models/professor.js";
import { itIfSupports } from "../../test-helpers/supports.js";

// Rails: class ForeignProfessor < ActiveRecord::Base; self.table_name = "foreign_professors"
class ForeignProfessor extends Base {
  static tableName = "foreign_professors";
}

// Rails: class ForeignProfessorWithPk < ForeignProfessor; self.primary_key = "id"
class ForeignProfessorWithPk extends ForeignProfessor {
  static primaryKey = "id";
}

const url = new URL(PG_TEST_URL);
const fdwHost = url.hostname || "localhost";
const fdwPort = url.port || "5432";
const fdwDb = url.pathname.replace(/^\//, "") || "postgres";
const fdwPassword = decodeURIComponent(url.password || "");

function quoteLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

setupHandlerSuite();

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async (ctx) => {
    adapter = Base.connection as PostgreSQLAdapter;

    await adapter.exec("DROP FOREIGN TABLE IF EXISTS foreign_professors");
    await adapter.exec("DROP SERVER IF EXISTS foreign_server CASCADE");
    try {
      await adapter.enableExtension("postgres_fdw");
    } catch {
      // Mirrors Rails' enable_extension! contract: the test requires
      // postgres_fdw. If the CI PG image lacks it, skip gracefully.
      ctx.skip();
      return;
    }
    await defineSchema({ professors: TEST_SCHEMA.professors }, { dropExisting: true });
    await adapter.exec(
      `CREATE SERVER foreign_server FOREIGN DATA WRAPPER postgres_fdw ` +
        `OPTIONS (host ${quoteLit(fdwHost)}, port ${quoteLit(fdwPort)}, dbname ${quoteLit(fdwDb)})`,
    );
    const currentUserRows = await adapter.execute("SELECT current_user AS u");
    const fdwUser = String((currentUserRows[0] as { u: string }).u);
    const userMappingOpts = fdwPassword
      ? `OPTIONS (user ${quoteLit(fdwUser)}, password ${quoteLit(fdwPassword)})`
      : `OPTIONS (user ${quoteLit(fdwUser)})`;
    await adapter.exec(
      `CREATE USER MAPPING FOR CURRENT_USER SERVER foreign_server ${userMappingOpts}`,
    );
    await adapter.exec(
      `CREATE FOREIGN TABLE foreign_professors (
        id    int,
        name  character varying NOT NULL
      ) SERVER foreign_server OPTIONS (table_name 'professors')`,
    );
  });

  afterEach(async () => {
    await adapter.exec("DROP FOREIGN TABLE IF EXISTS foreign_professors").catch(() => {});
    await adapter.exec("DROP SERVER IF EXISTS foreign_server CASCADE").catch(() => {});
    await adapter.disableExtension("postgres_fdw", { force: "cascade" }).catch(() => {});
  });

  describe("ForeignTableTest", () => {
    itIfSupports("foreign_tables", "table exists", async () => {
      expect(await adapter.tableExists("foreign_professors")).toBe(false);
    });

    itIfSupports("foreign_tables", "foreign tables are valid data sources", async () => {
      expect(await adapter.dataSourceExists("foreign_professors")).toBe(true);
    });

    itIfSupports("foreign_tables", "foreign tables", async () => {
      expect(await adapter.foreignTables()).toEqual(["foreign_professors"]);
    });

    itIfSupports("foreign_tables", "foreign table exists", async () => {
      expect(await adapter.foreignTableExists("foreign_professors")).toBe(true);
      expect(await adapter.foreignTableExists("nonexistingtable")).toBe(false);
      expect(await adapter.foreignTableExists("'")).toBe(false);
      expect(await adapter.foreignTableExists(null as unknown as string)).toBe(false);
    });

    itIfSupports("foreign_tables", "attribute names", async () => {
      await ForeignProfessor.loadSchema();
      expect(ForeignProfessor.attributeNames()).toEqual(["id", "name"]);
    });

    itIfSupports("foreign_tables", "does not have a primary key", async () => {
      // loadSchema warms the schema cache's primary-key entry; a foreign table
      // has no PK constraint, so introspection yields null and primary_key
      // resolves to null rather than the "id" convention.
      await ForeignProfessor.loadSchema();
      expect(ForeignProfessor.primaryKey).toBeNull();
    });

    itIfSupports("foreign_tables", "attributes", async () => {
      await Professor.loadSchema();
      await ForeignProfessorWithPk.loadSchema();
      const created = await Professor.create({ name: "Nicola" });
      const found = await ForeignProfessorWithPk.find(created.readAttribute("id"));
      expect(found.readAttribute("name")).toBe("Nicola");
      expect(found.readAttribute("id")).toBe(created.readAttribute("id"));
    });

    itIfSupports("foreign_tables", "insert record", async () => {
      await ForeignProfessorWithPk.loadSchema();
      await ForeignProfessorWithPk.createBang({ id: 100, name: "Leonardo" });
      const last = await ForeignProfessorWithPk.last();
      expect(last?.readAttribute("name")).toBe("Leonardo");
    });

    itIfSupports("foreign_tables", "update record", async () => {
      await Professor.loadSchema();
      await ForeignProfessorWithPk.loadSchema();
      const created = await Professor.create({ name: "Nicola" });
      const prof = await ForeignProfessorWithPk.find(created.readAttribute("id"));
      prof.writeAttribute("name", "Albert");
      await prof.saveBang();
      await prof.reload();
      expect(prof.readAttribute("name")).toBe("Albert");
    });

    itIfSupports("foreign_tables", "delete record", async () => {
      await Professor.loadSchema();
      await ForeignProfessorWithPk.loadSchema();
      const created = await Professor.create({ name: "Nicola" });
      const prof = await ForeignProfessorWithPk.find(created.readAttribute("id"));
      const countAll = async (): Promise<number> => {
        const rows = await adapter.execute("SELECT COUNT(*) AS c FROM foreign_professors");
        return Number((rows[0] as { c: string | number }).c);
      };
      const before = await countAll();
      await prof.destroy();
      const after = await countAll();
      expect(after).toBe(before - 1);
    });
  });
});
