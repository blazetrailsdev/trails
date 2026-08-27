import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Base } from "../../base.js";
import { withDbWarningsAction } from "../../support/with-db-warnings-action.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { itIfSupports } from "../../support/supports.js";
import { fixtures } from "../../test-fixtures.js";
import * as Arel from "@blazetrails/arel";
import {
  ConnectionFailed,
  ConnectionNotEstablished,
  RecordNotUnique,
  SQLWarning,
  StatementInvalid,
} from "../../errors.js";
import { NullPool } from "../../connection-adapters/abstract/connection-pool.js";
import { QueryAttribute } from "../../relation/query-attribute.js";
import { Value, Integer } from "../../type.js";
import { withSecondAdapter } from "../../support/second-connection.js";
import { Name } from "../../connection-adapters/postgresql/utils.js";

const EX_DEFAULT = "id serial primary key, number integer, data character varying(255)";

async function withExampleTable(
  adapter: PostgreSQLAdapter,
  fn: () => Promise<void>,
  definition: string = EX_DEFAULT,
): Promise<void> {
  await adapter.exec(`CREATE TABLE ex (${definition})`);
  try {
    await fn();
  } finally {
    await adapter.exec(`DROP TABLE IF EXISTS ex CASCADE`);
  }
}

function connectionWithoutInsertReturning(): PostgreSQLAdapter {
  return new PostgreSQLAdapter({ connectionString: PG_TEST_URL, insertReturning: false });
}

async function withExtensionDisabled(
  adapter: PostgreSQLAdapter,
  ext: string,
  fn: () => Promise<void>,
): Promise<void> {
  const wasEnabled = await adapter.extensionEnabled(ext);
  const ensureDisabled = wasEnabled ? () => adapter.disableExtension(ext) : async () => {};
  const restore = wasEnabled
    ? () => adapter.enableExtension(ext)
    : () => adapter.disableExtension(ext);
  await ensureDisabled();
  try {
    await fn();
  } finally {
    await restore();
  }
}

async function withExtensionEnabled(
  adapter: PostgreSQLAdapter,
  ext: string,
  fn: () => Promise<void>,
): Promise<void> {
  const wasEnabled = await adapter.extensionEnabled(ext);
  const ensureEnabled = wasEnabled ? async () => {} : () => adapter.enableExtension(ext);
  const restore = wasEnabled
    ? () => adapter.enableExtension(ext)
    : () => adapter.disableExtension(ext);
  await ensureEnabled();
  try {
    await fn();
  } finally {
    await restore();
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter.isConnected()) {
      try {
        await adapter.exec(`DROP TABLE IF EXISTS ex, ex2 CASCADE`);
      } catch {}
    }
    await adapter.close();
  });

  describe("PostgreSQLAdapterTest", () => {
    fixtures(["accounts"], { useTransactionalTests: false });

    it("connection error", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      const error = await bad.execute("SELECT 1").then(
        () => null,
        (e) => e,
      );
      expect(error).toBeInstanceOf(ConnectionNotEstablished);
      expect((error as ConnectionNotEstablished).connectionPool).toBeInstanceOf(NullPool);
      await bad.close();
    });

    it("reconnection error", async () => {
      const pgModule = (await import("pg")).default;
      const fakeClient = {
        connect: () => Promise.reject(new Error("actual bad connection error")),
        end: () => Promise.resolve(),
        on: () => fakeClient,
        query: () => Promise.reject(new Error("not connected")),
      };
      const clientSpy = vi
        .spyOn(pgModule, "Client" as never)
        .mockImplementation((() => fakeClient) as never);
      const a = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        const error = await a.execute("SELECT 1").then(
          () => null,
          (e) => e,
        );
        expect(error).toBeInstanceOf(ConnectionNotEstablished);
        expect((error as Error).message).toContain("actual bad connection error");
        expect((error as ConnectionNotEstablished).connectionPool).toBe(a.pool);
      } finally {
        clientSpy.mockRestore();
        await a.close().catch(() => {});
      }
    });

    it("bad connection", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.close();
    });

    it("bad connection to postgres database", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      const error = await bad.execute("SELECT 1").then(
        () => null,
        (e) => e,
      );
      expect((error as ConnectionNotEstablished).connectionPool).toBe(bad.pool);
      await bad.close();
    });

    it("reconnect after bad connection on check version", async () => {
      expect(await adapter.getDatabaseVersion()).toBeGreaterThan(0);
      (adapter.pool as unknown as { _serverVersion: unknown })._serverVersion = null;
      const versionSpy = vi.spyOn(adapter, "_serverVersion").mockResolvedValue(0);
      const error = await adapter.reconnectBang().then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ConnectionFailed);
      expect((error as ConnectionFailed).message).toBe("Could not determine PostgreSQL version");
      versionSpy.mockRestore();

      await adapter.reconnectBang();
      expect(await adapter.getDatabaseVersion()).toBeGreaterThan(0);
    });

    it("database exists returns false when the database does not exist", async () => {
      const url = new URL(PG_TEST_URL);
      url.pathname = "/non_extant_database";
      expect(await PostgreSQLAdapter.databaseExists(url.toString())).toBe(false);
    });

    it("database exists returns true when the database exists", async () => {
      expect(await PostgreSQLAdapter.databaseExists(PG_TEST_URL)).toBe(true);
    });

    it("primary key", async () => {
      await withExampleTable(adapter, async () => {
        expect(await adapter.primaryKey("ex")).toBe("id");
      });
    });

    it("primary key works tables containing capital letters", async () => {
      expect(await adapter.primaryKey("CamelCase")).toBe("id");
    });

    it("non standard primary key", async () => {
      await withExampleTable(
        adapter,
        async () => {
          expect(await adapter.primaryKey("ex")).toBe("data");
        },
        "data character varying(255) primary key",
      );
    });

    it("primary key returns nil for no pk", async () => {
      await withExampleTable(
        adapter,
        async () => {
          expect(await adapter.primaryKey("ex")).toBeNull();
        },
        "id integer",
      );
    });

    it("exec insert with returning disabled", async () => {
      await withExampleTable(adapter, async () => {
        const connection = connectionWithoutInsertReturning();
        try {
          const result = await connection.execInsert(
            "insert into ex (number) VALUES (1)",
            null,
            [],
            "id",
            "ex_id_seq",
          );
          const rows = await connection.execute("select max(id) as max from ex");
          const expected = Number(rows[0].max);
          expect(Number((result as { rows: unknown[][] }).rows[0][0])).toBe(expected);
        } finally {
          await connection.close();
        }
      });
    });

    it("exec insert with returning disabled and no sequence name given", async () => {
      await withExampleTable(adapter, async () => {
        const connection = connectionWithoutInsertReturning();
        try {
          const result = await connection.execInsert(
            "insert into ex (number) VALUES (1)",
            null,
            [],
            "id",
          );
          const rows = await connection.execute("select max(id) as max from ex");
          const expected = Number(rows[0].max);
          expect(Number((result as { rows: unknown[][] }).rows[0][0])).toBe(expected);
        } finally {
          await connection.close();
        }
      });
    });

    it("exec insert default values with returning disabled and no sequence name given", async () => {
      await withExampleTable(adapter, async () => {
        const connection = connectionWithoutInsertReturning();
        try {
          const result = await connection.execInsert(
            "insert into ex DEFAULT VALUES",
            null,
            [],
            "id",
          );
          const rows = await connection.execute("select max(id) as max from ex");
          const expected = Number(rows[0].max);
          expect(Number((result as { rows: unknown[][] }).rows[0][0])).toBe(expected);
        } finally {
          await connection.close();
        }
      });
    });

    it("exec insert default values quoted schema with returning disabled and no sequence name given", async () => {
      await withExampleTable(adapter, async () => {
        const connection = connectionWithoutInsertReturning();
        try {
          const result = await connection.execInsert(
            'insert into "public"."ex" DEFAULT VALUES',
            null,
            [],
            "id",
          );
          const rows = await connection.execute("select max(id) as max from ex");
          const expected = Number(rows[0].max);
          expect(Number((result as { rows: unknown[][] }).rows[0][0])).toBe(expected);
        } finally {
          await connection.close();
        }
      });
    });

    it("serial sequence", async () => {
      expect(await adapter.serialSequence("accounts", "id")).toBe("public.accounts_id_seq");
      const error = await adapter.serialSequence("zomg", "id").then(
        () => null,
        (e) => e,
      );
      expect(error).toBeInstanceOf(StatementInvalid);
      expect((error as StatementInvalid).connectionPool).toBe(adapter.pool);
    });

    it("default sequence name", async () => {
      expect(await adapter.defaultSequenceName("accounts", "id")).toBe("public.accounts_id_seq");
      expect(await adapter.defaultSequenceName("accounts")).toBe("public.accounts_id_seq");
    });

    it("default sequence name bad table", async () => {
      expect(await adapter.defaultSequenceName("zomg", "id")).toBe("zomg_id_seq");
      expect(await adapter.defaultSequenceName("zomg")).toBe("zomg_id_seq");
    });

    it("pk and sequence for", async () => {
      await withExampleTable(adapter, async () => {
        const result = await adapter.pkAndSequenceFor("ex");
        expect(result).not.toBeNull();
        const [pk, seq] = result!;
        expect(pk).toBe("id");
        expect(seq!.toString()).toBe(await adapter.defaultSequenceName("ex", "id"));
      });
    });

    it("pk and sequence for with non standard primary key", async () => {
      await withExampleTable(
        adapter,
        async () => {
          const result = await adapter.pkAndSequenceFor("ex");
          expect(result).not.toBeNull();
          const [pk, seq] = result!;
          expect(pk).toBe("code");
          expect(seq!.toString()).toBe(await adapter.defaultSequenceName("ex", "code"));
        },
        "code serial primary key",
      );
    });

    it("pk and sequence for returns nil if no seq", async () => {
      await withExampleTable(
        adapter,
        async () => {
          expect(await adapter.pkAndSequenceFor("ex")).toBeNull();
        },
        "id integer primary key",
      );
    });

    it("pk and sequence for returns nil if no pk", async () => {
      await withExampleTable(
        adapter,
        async () => {
          expect(await adapter.pkAndSequenceFor("ex")).toBeNull();
        },
        "id integer",
      );
    });

    it("pk and sequence for returns nil if table not found", async () => {
      expect(await adapter.pkAndSequenceFor("unobtainium")).toBeNull();
    });

    it("pk and sequence for with collision pg class oid", async () => {
      await adapter.exec(`create table ex(id serial primary key)`);
      await adapter.exec(`create table ex2(id serial primary key)`);
      try {
        const correctDependRecord = [
          "'pg_class'::regclass",
          "'ex_id_seq'::regclass",
          "0",
          "'pg_class'::regclass",
          "'ex'::regclass",
          "1",
          "'a'",
        ];
        const collisionDependRecord = [
          "'pg_attrdef'::regclass",
          "'ex2_id_seq'::regclass",
          "0",
          "'pg_class'::regclass",
          "'ex'::regclass",
          "1",
          "'a'",
        ];

        await adapter.exec(
          `DELETE FROM pg_depend WHERE objid = 'ex_id_seq'::regclass AND refobjid = 'ex'::regclass AND deptype = 'a'`,
        );
        await adapter.exec(`INSERT INTO pg_depend VALUES(${collisionDependRecord.join(",")})`);
        await adapter.exec(`INSERT INTO pg_depend VALUES(${correctDependRecord.join(",")})`);

        const result = await adapter.pkAndSequenceFor("ex");
        expect(result).not.toBeNull();
        expect(result![1]).toEqual(new Name("public", "ex_id_seq"));

        await adapter.exec(
          `DELETE FROM pg_depend WHERE objid = 'ex2_id_seq'::regclass AND refobjid = 'ex'::regclass AND deptype = 'a'`,
        );
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS ex CASCADE`);
        await adapter.exec(`DROP TABLE IF EXISTS ex2 CASCADE`);
      }
    });

    it("table alias length", async () => {
      let raised = false;
      try {
        (adapter as unknown as { tableAliasLength(): number }).tableAliasLength();
      } catch {
        raised = true;
      }
      expect(raised).toBe(false);
    });

    it("exec no binds", async () => {
      await withExampleTable(adapter, async () => {
        let result = await adapter.execQuery("SELECT id, data FROM ex");
        expect(result.rows.length).toBe(0);
        expect(result.columns.length).toBe(2);
        expect(result.columns).toEqual(["id", "data"]);

        const string = adapter.quote("foo");
        await adapter.execQuery(`INSERT INTO ex (id, data) VALUES (1, ${string})`);
        result = await adapter.execQuery("SELECT id, data FROM ex");
        expect(result.rows.length).toBe(1);
        expect(result.columns.length).toBe(2);

        expect(result.rows).toEqual([[1, "foo"]]);
      });
    });

    it("exec with binds", async () => {
      await withExampleTable(adapter, async () => {
        const string = adapter.quote("foo");
        await adapter.execQuery(`INSERT INTO ex (id, data) VALUES (1, ${string})`);

        const bind = new QueryAttribute("id", 1, new Value());
        const result = await adapter.execQuery("SELECT id, data FROM ex WHERE id = $1", null, [
          bind,
        ]);

        expect(result.rows.length).toBe(1);
        expect(result.columns.length).toBe(2);

        expect(result.rows).toEqual([[1, "foo"]]);
      });
    });

    it("exec typecasts bind vals", async () => {
      await withExampleTable(adapter, async () => {
        const string = adapter.quote("foo");
        await adapter.execQuery(`INSERT INTO ex (id, data) VALUES (1, ${string})`);

        const bind = new QueryAttribute("id", "1-fuu", new Integer());
        const result = await adapter.execQuery("SELECT id, data FROM ex WHERE id = $1", null, [
          bind,
        ]);

        expect(result.rows.length).toBe(1);
        expect(result.columns.length).toBe(2);

        expect(result.rows).toEqual([[1, "foo"]]);
      });
    });

    it("partial index", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.addIndex("ex", ["id", "number"], { name: "partial", where: "number > 100" });
        const index = (await adapter.indexes("ex")).find((idx) => idx.name === "partial");
        expect(index!.where).toBe("(number > 100)");
      });
    });

    it("partial index on column named like keyword", async () => {
      await withExampleTable(
        adapter,
        async () => {
          await adapter.addIndex("ex", "id", { name: "partial", where: "primary" });
          const index = (await adapter.indexes("ex")).find((idx) => idx.name === "partial");
          expect(index!.where).toBe('"primary"');
        },
        'id serial primary key, number integer, "primary" boolean',
      );
    });

    itIfSupports("index_include", "include index", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.addIndex("ex", ["id"], { name: "include", include: ["number"] });
        const index = (await adapter.indexes("ex")).find((idx) => idx.name === "include");
        expect(index!.include).toEqual(["number"]);
      });
    });

    itIfSupports("index_include", "include multiple columns index", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.addIndex("ex", ["id"], { name: "include", include: ["number", "data"] });
        const index = (await adapter.indexes("ex")).find((idx) => idx.name === "include");
        expect(index!.include).toEqual(["number", "data"]);
      });
    });

    itIfSupports("index_include", "include keyword column name", async () => {
      await withExampleTable(
        adapter,
        async () => {
          await adapter.addIndex("ex", "id", { name: "include", include: ["timestamp"] });
          const index = (await adapter.indexes("ex")).find((idx) => idx.name === "include");
          expect(index!.include).toEqual(["timestamp"]);
        },
        "id integer, timestamp integer",
      );
    });

    itIfSupports("index_include", "include escaped quotes column name", async () => {
      await withExampleTable(
        adapter,
        async () => {
          await adapter.addIndex("ex", "id", { name: "include", include: ['I"like"quotes'] });
          const index = (await adapter.indexes("ex")).find((idx) => idx.name === "include");
          expect(index!.include).toEqual(['I"like"quotes']);
        },
        'id integer, "I""like""quotes" integer',
      );
    });

    it("expression index", async () => {
      await withExampleTable(adapter, async () => {
        const expr = "mod(id, 10), abs(number)";
        await adapter.addIndex("ex", expr, { name: "expression" });
        const index = (await adapter.indexes("ex")).find((idx) => idx.name === "expression");
        expect(index!.columns).toBe(expr);
        expect(await adapter.indexExists("ex", expr, { name: "expression" })).toBe(true);
      });
    });

    it("index with opclass", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.addIndex("ex", "data", { opclass: { data: "varchar_pattern_ops" } });
        let index = (await adapter.indexes("ex")).find((idx) => idx.name === "index_ex_on_data");
        expect(index!.columns).toEqual(["data"]);

        await adapter.removeIndex("ex", "data");
        index = (await adapter.indexes("ex")).find((idx) => idx.name === "index_ex_on_data");
        expect(index).toBeUndefined();
      });
    });

    it("invalid index", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.execQuery("INSERT INTO ex (number) VALUES (1), (1)");
        let error: unknown;
        try {
          await adapter.addIndex("ex", "number", {
            unique: true,
            algorithm: "concurrently",
            name: "invalid_index",
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(RecordNotUnique);
        expect((error as Error).message).toMatch(/could not create unique index/);
        expect((error as RecordNotUnique).connectionPool).toBe(adapter.pool);

        expect(await adapter.indexExists("ex", "number", { name: "invalid_index" })).toBe(true);
        expect(
          await adapter.indexExists("ex", "number", { name: "invalid_index", valid: true }),
        ).toBe(false);
        expect(
          await adapter.indexExists("ex", "number", { name: "invalid_index", valid: false }),
        ).toBe(true);
      });
    });

    itIfSupports("nulls_not_distinct", "index with not distinct nulls", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.execute(
          `CREATE UNIQUE INDEX index_ex_on_data ON ex (data) NULLS NOT DISTINCT WHERE number > 0`,
        );
        const index = (await adapter.indexes("ex"))[0];
        expect(index.unique).toBe(true);
        expect(index.where).toContain("number");
      });
    });

    it("columns for distinct zero orders", () => {
      expect(adapter.columnsForDistinct("posts.id", [])).toBe("posts.id");
    });

    it("columns for distinct one order", () => {
      expect(adapter.columnsForDistinct("posts.id", ["posts.created_at desc"])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    });

    it("columns for distinct few orders", () => {
      expect(
        adapter.columnsForDistinct("posts.id", ["posts.created_at desc", "posts.position asc"]),
      ).toBe("posts.created_at AS alias_0, posts.position AS alias_1, posts.id");
    });

    it("columns for distinct with case", () => {
      expect(
        adapter.columnsForDistinct("posts.id", [
          "CASE WHEN author.is_active THEN UPPER(author.name) ELSE UPPER(author.email) END",
        ]),
      ).toBe(
        "CASE WHEN author.is_active THEN UPPER(author.name) ELSE UPPER(author.email) END AS alias_0, posts.id",
      );
    });

    it("columns for distinct blank not nil orders", () => {
      expect(adapter.columnsForDistinct("posts.id", ["posts.created_at desc", "", "   "])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    });

    it("columns for distinct with arel order", () => {
      const order = new Arel.Nodes.Descending(Arel.sql("posts.created_at"));
      expect(adapter.columnsForDistinct("posts.id", [order])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    });

    it("columns for distinct with nulls", async () => {
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id desc nulls first"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id desc nulls last"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
    });

    it("columns for distinct without order specifiers", async () => {
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id nulls last"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id nulls first"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
    });

    it("raise error when cannot translate exception", async () => {
      await expect(adapter.execute(null as never)).rejects.toBeInstanceOf(TypeError);
    });

    it("translate no connection exception to not established", async () => {
      const pidRows = await adapter.execute("SELECT pg_backend_pid() AS pid");
      const pid = (pidRows[0] as { pid: number }).pid;
      await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
        await adapter2.execute(`SELECT pg_terminate_backend(${pid})`);
      });
      await expect(adapter.execute("SELECT 1")).rejects.toBeInstanceOf(ConnectionFailed);
    });

    it("reload type map for newly defined types", async () => {
      const { Enum: OidEnum } = await import("../../connection-adapters/postgresql/oid/enum.js");
      await adapter.createEnum("feeling", ["good", "bad"]);
      try {
        const result = await adapter.execQuery(`SELECT 'good'::feeling AS feeling`);
        expect(result.columnTypes["feeling"]).toBeInstanceOf(OidEnum);
      } finally {
        await adapter.dropEnum("feeling", { ifExists: true });
      }
    });

    it("only reload type map once for every unrecognized type", async () => {
      await adapter.execQuery("SELECT 1");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const loadSpy = vi.spyOn(adapter, "loadAdditionalTypes");
      try {
        await adapter.execQuery("select 'pg_catalog.pg_class'::regclass");
        const afterFirst = loadSpy.mock.calls.length;
        expect(afterFirst).toBeGreaterThan(0);
        await adapter.execQuery("select 'pg_catalog.pg_class'::regclass");
        expect(loadSpy.mock.calls.length).toBe(afterFirst);
        await adapter.execQuery("SELECT NULL::anyarray");
        expect(loadSpy.mock.calls.length).toBeGreaterThan(afterFirst);
      } finally {
        loadSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });

    it("only warn on first encounter of unrecognized oid", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await adapter.execQuery(`select 'pg_catalog.pg_class'::regclass`);
        await adapter.execQuery(`select 'pg_catalog.pg_class'::regclass`);
        await adapter.execQuery(`select 'pg_catalog.pg_class'::regclass`);
        const oidWarns = warnSpy.mock.calls.filter(
          (c) => typeof c[0] === "string" && /unknown OID \d+/.test(c[0]),
        );
        expect(oidWarns).toHaveLength(1);
        expect(oidWarns[0][0]).toMatch(
          /unknown OID \d+: failed to recognize type of 'regclass'\. It will be treated as String\./,
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("unparsed defaults are at least set when saving", async () => {
      await withExampleTable(
        adapter,
        async () => {
          const cols = await adapter.columns("ex");
          const numberCol = cols.find((c) => c.name === "number")!;
          expect(numberCol.default).toBeNull();
          expect(numberCol.defaultFunction == null).toBe(true);
          await adapter.exec(`INSERT INTO ex DEFAULT VALUES`);
          const rows = await adapter.execute(`SELECT number FROM ex`);
          expect(Number(rows[0].number)).toBe(4);
        },
        "id SERIAL PRIMARY KEY, number INTEGER NOT NULL DEFAULT (4 + 4) * 2 / 4",
      );
    });

    it("only check for insensitive comparison capability once", async () => {
      await adapter.execute(`CREATE DOMAIN example_type AS integer`);
      const internalExecQuerySpy = vi.spyOn(adapter, "internalExecQuery");
      try {
        const col = { sqlType: "example_type" };
        await adapter.canPerformCaseInsensitiveComparisonFor(col);
        const callsAfterFirst = internalExecQuerySpy.mock.calls.length;
        await adapter.canPerformCaseInsensitiveComparisonFor(col);
        expect(internalExecQuerySpy.mock.calls.length).toBe(callsAfterFirst);
      } finally {
        internalExecQuerySpy.mockRestore();
        await adapter.execute(`DROP DOMAIN example_type CASCADE`);
      }
    });

    it("extensions omits current schema name", async () => {
      await withExtensionDisabled(adapter, "hstore", async () => {
        await adapter.exec(`CREATE SCHEMA IF NOT EXISTS customschema`);
        try {
          await adapter.exec(`CREATE EXTENSION hstore SCHEMA customschema`);
          const exts = await adapter.extensions();
          expect(exts).toContain("customschema.hstore");
        } finally {
          await adapter.exec(`DROP SCHEMA IF EXISTS customschema CASCADE`);
        }
      });
    });

    it("extensions includes non current schema name", async () => {
      const currentSchemaRows = await adapter.execute(
        `SELECT quote_ident(current_schema()) AS quoted_current_schema`,
      );
      const quotedCurrentSchema = currentSchemaRows[0].quoted_current_schema as string;
      await withExtensionDisabled(adapter, "hstore", async () => {
        try {
          await adapter.exec(`CREATE EXTENSION hstore SCHEMA ${quotedCurrentSchema}`);
          const exts = await adapter.extensions();
          expect(exts).toContain("hstore");
        } finally {
          await adapter.exec(`DROP EXTENSION IF EXISTS hstore`);
        }
      });
    });

    it("ignores warnings when behaviour ignore", async () => {
      await withDbWarningsAction("ignore", async () => {
        const rows = await adapter.execute("do $$ BEGIN RAISE WARNING 'foo'; END; $$");
        expect(rows).toEqual([]);
      });
    });

    it("logs warnings when behaviour log", async () => {
      await withDbWarningsAction("log", async () => {
        const sqlWarning = "[ActiveRecord::SQLWarning] PostgreSQL SQL warning (01000)";
        const logger = { warn: vi.fn() };
        const previousLogger = Base.logger;
        Base.logger = logger as never;
        try {
          await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
          expect(logger.warn).toHaveBeenCalledWith(sqlWarning);
        } finally {
          Base.logger = previousLogger;
        }
      });
    });

    it("raises warnings when behaviour raise", async () => {
      await withDbWarningsAction("raise", async () => {
        await expect(
          adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$"),
        ).rejects.toBeInstanceOf(SQLWarning);
      });
    });

    it("reports when behaviour report", async () => {
      const { ActiveSupport, ErrorReporter } = await import("@blazetrails/activesupport");
      const previousReporter = ActiveSupport.errorReporter;
      const reporter = new ErrorReporter();
      const events: Array<{ error: Error; handled: boolean }> = [];
      reporter.subscribe({
        report: (error, { handled }) => {
          events.push({ error, handled });
        },
      });
      ActiveSupport.errorReporter = reporter;
      try {
        await withDbWarningsAction("report", async () => {
          await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
          expect(events).toHaveLength(1);
          expect(events[0].error).toBeInstanceOf(SQLWarning);
          expect(events[0].error.message).toBe("PostgreSQL SQL warning");
          expect(events[0].handled).toBe(true);
        });
      } finally {
        ActiveSupport.errorReporter = previousReporter;
      }
    });

    it("warnings behaviour can be customized with a proc", async () => {
      let captured: SQLWarning | null = null;
      const warningAction = (w: SQLWarning) => {
        captured = w;
      };
      await withDbWarningsAction(warningAction, async () => {
        await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
        expect(captured).toBeInstanceOf(SQLWarning);
        expect((captured as unknown as SQLWarning).message).toBe("PostgreSQL SQL warning");
        expect((captured as unknown as SQLWarning).level).toBe("WARNING");
      });
    });

    it("allowlist of warnings to ignore", async () => {
      await withDbWarningsAction("raise", [/PostgreSQL SQL warning/], async () => {
        const rows = await adapter.execute(
          "do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$",
        );
        expect(rows).toEqual([]);
      });
    });

    it("allowlist of warning codes to ignore", async () => {
      await withDbWarningsAction("raise", ["01000"], async () => {
        const rows = await adapter.execute(
          "do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$",
        );
        expect(rows).toEqual([]);
      });
    });

    it("does not raise notice level warnings", async () => {
      await withDbWarningsAction("raise", [/PostgreSQL SQL warning/], async () => {
        await expect(
          adapter.execute("DROP TABLE IF EXISTS non_existent_table_xyz_warnings"),
        ).resolves.toBeDefined();
      });
    });

    it("date decoding enabled", async () => {
      await adapter.exec(`CREATE TABLE "ex_dates" ("id" SERIAL PRIMARY KEY, "d" DATE)`);
      try {
        await adapter.exec(`INSERT INTO "ex_dates" ("d") VALUES ('2023-06-15')`);
        const rows = await adapter.execute(`SELECT "d" FROM "ex_dates"`);
        const d = rows[0].d as Temporal.PlainDate;
        expect(d).toBeInstanceOf(Temporal.PlainDate);
        expect(d.year).toBe(2023);
        expect(d.month).toBe(6);
        expect(d.day).toBe(15);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS "ex_dates" CASCADE`);
      }
    });

    it("date decoding disabled", async () => {
      const saved = PostgreSQLAdapter.decodeDates;
      PostgreSQLAdapter.decodeDates = false;
      const localAdapter = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await localAdapter.exec(`CREATE TABLE "ex_dates_off" ("id" SERIAL PRIMARY KEY, "d" DATE)`);
        await localAdapter.exec(`INSERT INTO "ex_dates_off" ("d") VALUES ('2024-01-01')`);
        const rows = await localAdapter.execute(`SELECT "d" FROM "ex_dates_off"`);
        expect(rows[0].d).toBe("2024-01-01");
      } finally {
        await localAdapter.exec(`DROP TABLE IF EXISTS "ex_dates_off"`);
        await localAdapter.close();
        PostgreSQLAdapter.decodeDates = saved;
      }
    });

    it("disable extension with schema", async () => {
      await withExtensionDisabled(adapter, "hstore", async () => {
        await adapter.exec(`CREATE SCHEMA IF NOT EXISTS "custom_schema"`);
        try {
          await adapter.exec(`CREATE EXTENSION "hstore" SCHEMA custom_schema`);
          expect(await adapter.extensions()).toContain("custom_schema.hstore");
          await adapter.disableExtension("custom_schema.hstore");
          expect(await adapter.extensions()).not.toContain("custom_schema.hstore");
        } finally {
          await adapter.exec(`DROP SCHEMA IF EXISTS "custom_schema" CASCADE`);
        }
      });
    });

    it("disable extension without schema", async () => {
      await withExtensionEnabled(adapter, "hstore", async () => {
        await adapter.disableExtension("hstore");
        const enabled = await adapter.extensionEnabled("hstore");
        expect(enabled).toBe(false);
      });
    });
  });
});
