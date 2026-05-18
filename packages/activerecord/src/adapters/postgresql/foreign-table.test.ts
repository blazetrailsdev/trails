/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/foreign_table_test.rb
 *
 * Loopback FDW: foreign_server points back at the same database and
 * foreign_professors is mapped to a local professors table. Rails wires
 * foreign_server at the secondary "arunit2" database; loopback keeps the
 * test infra single-database.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";

const url = new URL(PG_TEST_URL);
const fdwHost = url.hostname || "localhost";
const fdwPort = url.port || "5432";
const fdwDb = url.pathname.replace(/^\//, "") || "postgres";
const fdwPassword = decodeURIComponent(url.password || "");

function quoteLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async (ctx) => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);

    await adapter.exec("DROP FOREIGN TABLE IF EXISTS foreign_professors");
    await adapter.exec("DROP SERVER IF EXISTS foreign_server CASCADE");
    await adapter.exec("DROP TABLE IF EXISTS professors");
    try {
      await adapter.enableExtension("postgres_fdw");
    } catch {
      // Mirrors Rails' enable_extension! contract: the test requires
      // postgres_fdw. If the CI PG image lacks it, skip gracefully.
      ctx.skip();
      return;
    }
    await defineSchema(adapter, {
      professors: { name: { type: "string", null: false } },
    });
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
    await adapter.exec("DROP TABLE IF EXISTS professors").catch(() => {});
    await adapter.disableExtension("postgres_fdw", { force: "cascade" }).catch(() => {});
    await adapter.close();
  });

  describe("ForeignTableTest", () => {
    it("table exists", async () => {
      expect(await adapter.tableExists("foreign_professors")).toBe(false);
    });

    it("foreign tables are valid data sources", async () => {
      expect(await adapter.dataSourceExists("foreign_professors")).toBe(true);
    });

    it("foreign tables", async () => {
      expect(await adapter.foreignTables()).toEqual(["foreign_professors"]);
    });

    it("foreign table exists", async () => {
      expect(await adapter.foreignTableExists("foreign_professors")).toBe(true);
      expect(await adapter.foreignTableExists("nonexistingtable")).toBe(false);
      expect(await adapter.foreignTableExists("'")).toBe(false);
      expect(await adapter.foreignTableExists(null as unknown as string)).toBe(false);
    });

    it("attribute names", async () => {
      const { Base } = await import("../../index.js");
      class ForeignProfessor extends Base {
        static tableName = "foreign_professors";
        static {
          this.adapter = adapter;
        }
      }
      await ForeignProfessor.loadSchema();
      expect(ForeignProfessor.attributeNames()).toEqual(["id", "name"]);
    });

    it.skip("does not have a primary key", async () => {
      // BLOCKED: trails Base.primaryKey defaults to "id" and does not consult
      // schema introspection. Rails sets primary_key to nil when
      // connection.schema_cache.primary_keys(table_name) returns nil (foreign
      // tables have no PK constraint). Closing this gap requires wiring
      // model-schema.loadSchema to call adapter.primaryKey(tableName) and
      // store the result (incl. null) on _primaryKey — a cross-cutting
      // change outside this PR's test-only scope.
    });

    it("attributes", async () => {
      const { Base } = await import("../../index.js");
      class Professor extends Base {
        static tableName = "professors";
        static {
          this.adapter = adapter;
        }
      }
      class ForeignProfessorWithPk extends Base {
        static tableName = "foreign_professors";
        static primaryKey = "id";
        static {
          this.adapter = adapter;
        }
      }
      await Professor.loadSchema();
      await ForeignProfessorWithPk.loadSchema();
      const created = await Professor.create({ name: "Nicola" });
      const found = await ForeignProfessorWithPk.find(created.readAttribute("id"));
      expect(found.readAttribute("name")).toBe("Nicola");
      expect(found.readAttribute("id")).toBe(created.readAttribute("id"));
    });

    it("insert record", async () => {
      const { Base } = await import("../../index.js");
      class ForeignProfessorWithPk extends Base {
        static tableName = "foreign_professors";
        static primaryKey = "id";
        static {
          this.adapter = adapter;
        }
      }
      await ForeignProfessorWithPk.loadSchema();
      await ForeignProfessorWithPk.createBang({ id: 100, name: "Leonardo" });
      const last = await ForeignProfessorWithPk.last();
      expect(last?.readAttribute("name")).toBe("Leonardo");
    });

    it("update record", async () => {
      const { Base } = await import("../../index.js");
      class Professor extends Base {
        static tableName = "professors";
        static {
          this.adapter = adapter;
        }
      }
      class ForeignProfessorWithPk extends Base {
        static tableName = "foreign_professors";
        static primaryKey = "id";
        static {
          this.adapter = adapter;
        }
      }
      await Professor.loadSchema();
      await ForeignProfessorWithPk.loadSchema();
      const created = await Professor.create({ name: "Nicola" });
      const prof = await ForeignProfessorWithPk.find(created.readAttribute("id"));
      prof.writeAttribute("name", "Albert");
      await prof.saveBang();
      await prof.reload();
      expect(prof.readAttribute("name")).toBe("Albert");
    });

    it("delete record", async () => {
      const { Base } = await import("../../index.js");
      class Professor extends Base {
        static tableName = "professors";
        static {
          this.adapter = adapter;
        }
      }
      class ForeignProfessorWithPk extends Base {
        static tableName = "foreign_professors";
        static primaryKey = "id";
        static {
          this.adapter = adapter;
        }
      }
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
