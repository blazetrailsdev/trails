import { describe, expect, beforeEach, afterEach } from "vitest";
import { assertDifference } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { Professor } from "../../test-helpers/models/professor.js";
import { ARUnit2Model } from "../../test-helpers/models/arunit2-model.js";
import { itIfSupports } from "../../support/supports.js";

class ForeignProfessor extends Base {
  static tableName = "foreign_professors";
}

class ForeignProfessorWithPk extends ForeignProfessor {
  static primaryKey = "id";
}

const url = new URL(PG_TEST_URL);

const fdwPassword = decodeURIComponent(url.password || "");

function quoteLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

fixtures({}, { useTransactionalTests: false });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async (ctx) => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;

    await adapter.execute("DROP FOREIGN TABLE IF EXISTS foreign_professors");
    await adapter.execute("DROP SERVER IF EXISTS foreign_server CASCADE");
    try {
      await adapter.enableExtension("postgres_fdw");
    } catch {
      ctx.skip();
      return;
    }
    const fdwDb = String(ARUnit2Model.connectionDbConfig().database);
    await adapter.execute(
      `CREATE SERVER foreign_server FOREIGN DATA WRAPPER postgres_fdw ` +
        `OPTIONS (dbname ${quoteLit(fdwDb)})`,
    );
    const currentUserRows = await adapter.execute("SELECT current_user AS u");
    const fdwUser = String((currentUserRows[0] as { u: string }).u);
    const userMappingOpts = fdwPassword
      ? `OPTIONS (user ${quoteLit(fdwUser)}, password ${quoteLit(fdwPassword)})`
      : `OPTIONS (user ${quoteLit(fdwUser)})`;
    await adapter.execute(
      `CREATE USER MAPPING FOR CURRENT_USER SERVER foreign_server ${userMappingOpts}`,
    );
    await adapter.execute(
      `CREATE FOREIGN TABLE foreign_professors (
        id    int,
        name  character varying NOT NULL
      ) SERVER foreign_server OPTIONS (table_name 'professors')`,
    );
  });

  afterEach(async () => {
    await adapter.execute("DROP FOREIGN TABLE IF EXISTS foreign_professors").catch(() => {});
    await adapter.execute("DROP SERVER IF EXISTS foreign_server CASCADE").catch(() => {});
    await adapter.disableExtension("postgres_fdw", { force: "cascade" }).catch(() => {});
  });

  describe("ForeignTableTest", () => {
    itIfSupports("foreign_tables", "table exists", async () => {
      expect(await adapter.tableExists("foreign_professors")).toBeFalsy();
    });

    itIfSupports("foreign_tables", "foreign tables are valid data sources", async () => {
      expect(await adapter.dataSourceExists("foreign_professors")).toBeTruthy();
    });

    itIfSupports("foreign_tables", "foreign tables", async () => {
      expect(await adapter.foreignTables()).toEqual(["foreign_professors"]);
    });

    itIfSupports("foreign_tables", "foreign table exists", async () => {
      expect(await adapter.foreignTableExists("foreign_professors")).toBeTruthy();
      expect(await adapter.foreignTableExists("foreign_professors")).toBeTruthy();
      expect(await adapter.foreignTableExists("nonexistingtable")).toBeFalsy();
      expect(await adapter.foreignTableExists("'")).toBeFalsy();
      expect(await adapter.foreignTableExists(null as unknown as string)).toBeFalsy();
    });

    itIfSupports("foreign_tables", "attribute names", async () => {
      await ForeignProfessor.loadSchema();
      expect(ForeignProfessor.attributeNames()).toEqual(["id", "name"]);
    });

    itIfSupports("foreign_tables", "does not have a primary key", async () => {
      await ForeignProfessor.loadSchema();
      expect(ForeignProfessor.primaryKey).toBeNull();
    });

    itIfSupports("foreign_tables", "attributes", async () => {
      await Professor.loadSchema();
      await ForeignProfessorWithPk.loadSchema();
      const created = await Professor.create({ name: "Nicola" });
      const professor = await ForeignProfessorWithPk.find(created.readAttribute("id"));
      expect(professor.attributes).toEqual(created.attributes);
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
      await assertDifference(
        () => ForeignProfessor.count() as Promise<number>,
        -1,
        null,
        async () => {
          await prof.destroy();
        },
      );
    });
  });
});
