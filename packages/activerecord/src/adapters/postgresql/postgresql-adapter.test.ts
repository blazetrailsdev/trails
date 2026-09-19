import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assertRaises, assertNothingRaised } from "@blazetrails/activesupport";
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
import {
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
} from "../../testing/query-assertions.js";
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
  await adapter.execute(`CREATE TABLE ex (${definition})`);
  try {
    await fn();
  } finally {
    await adapter.execute(`DROP TABLE IF EXISTS ex CASCADE`);
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
        await adapter.execute(`DROP TABLE IF EXISTS ex, ex2 CASCADE`);
      } catch {}
    }
    await adapter.disconnectBang();
  });

  describe("PostgreSQLAdapterTest", () => {
    fixtures(["accounts"], { useTransactionalTests: false });

    it("connection error", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      const error = await assertRaises([ConnectionNotEstablished], {}, () =>
        bad.execute("SELECT 1"),
      );
      expect((error as ConnectionNotEstablished).connectionPool).toBeInstanceOf(NullPool);
      await bad.disconnectBang();
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
        const error = await assertRaises([ConnectionNotEstablished], {}, () =>
          a.execute("SELECT 1"),
        );
        expect(error.message).toBe("actual bad connection error");
        expect((error as ConnectionNotEstablished).connectionPool).toBe(a.pool);
      } finally {
        clientSpy.mockRestore();
        await a.disconnectBang().catch(() => {});
      }
    });

    it("bad connection", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.disconnectBang();
    });

    it("bad connection to postgres database", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      const error = await assertRaises([ConnectionNotEstablished], {}, () =>
        bad.execute("SELECT 1"),
      );
      expect(bad).not.toBeNull();
      expect((error as ConnectionNotEstablished).connectionPool).toBe(bad.pool);
      await bad.disconnectBang();
    });

    it("reconnect after bad connection on check version", async () => {
      await adapter.getDatabaseVersion();
      (adapter.pool as unknown as { _serverVersion: unknown })._serverVersion = null;
      const versionSpy = vi.spyOn(adapter, "_serverVersion").mockResolvedValue(0);
      const error = await assertRaises([ConnectionFailed], {}, () => adapter.reconnectBang());
      expect(error.message).toBe("Could not determine PostgreSQL version");
      versionSpy.mockRestore();

      await assertNothingRaised(() => adapter.reconnectBang());
    });

    it("database exists returns false when the database does not exist", async () => {
      const url = new URL(PG_TEST_URL);
      url.pathname = "/non_extant_database";
      expect(await PostgreSQLAdapter.databaseExists(url.toString())).toBeFalsy();
    });

    it("database exists returns true when the database exists", async () => {
      expect(await PostgreSQLAdapter.databaseExists(PG_TEST_URL)).toBeTruthy();
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
          await connection.disconnectBang();
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
          await connection.disconnectBang();
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
          await connection.disconnectBang();
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
          await connection.disconnectBang();
        }
      });
    });

    it("serial sequence", async () => {
      expect(await adapter.serialSequence("accounts", "id")).toBe("public.accounts_id_seq");

      const error = await assertRaises([StatementInvalid], {}, () =>
        adapter.serialSequence("zomg", "id"),
      );

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
        const [pk, seq] = (await adapter.pkAndSequenceFor("ex"))!;
        expect(pk).toBe("id");
        expect(seq!.toString()).toBe(await adapter.defaultSequenceName("ex", "id"));
      });
    });

    it("pk and sequence for with non standard primary key", async () => {
      await withExampleTable(
        adapter,
        async () => {
          const [pk, seq] = (await adapter.pkAndSequenceFor("ex"))!;
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
      await adapter.execute(`create table ex(id serial primary key)`);
      await adapter.execute(`create table ex2(id serial primary key)`);
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

        await adapter.execute(
          `DELETE FROM pg_depend WHERE objid = 'ex_id_seq'::regclass AND refobjid = 'ex'::regclass AND deptype = 'a'`,
        );
        await adapter.execute(`INSERT INTO pg_depend VALUES(${collisionDependRecord.join(",")})`);
        await adapter.execute(`INSERT INTO pg_depend VALUES(${correctDependRecord.join(",")})`);

        const seq = (await adapter.pkAndSequenceFor("ex"))![1];
        expect(seq).toEqual(new Name("public", "ex_id_seq"));

        await adapter.execute(
          `DELETE FROM pg_depend WHERE objid = 'ex2_id_seq'::regclass AND refobjid = 'ex'::regclass AND deptype = 'a'`,
        );
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS ex CASCADE`);
        await adapter.execute(`DROP TABLE IF EXISTS ex2 CASCADE`);
      }
    });

    it("table alias length", async () => {
      await assertNothingRaised(() =>
        (adapter as unknown as { tableAliasLength(): number }).tableAliasLength(),
      );
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
        expect(index).toBeFalsy();
      });
    });

    it("invalid index", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.execQuery("INSERT INTO ex (number) VALUES (1), (1)");
        const error = await assertRaises([RecordNotUnique], {}, () =>
          adapter.addIndex("ex", "number", {
            unique: true,
            algorithm: "concurrently",
            name: "invalid_index",
          }),
        );
        expect(error.message).toMatch(/could not create unique index/);
        expect((error as RecordNotUnique).connectionPool).toBe(adapter.pool);

        expect(await adapter.indexExists("ex", "number", { name: "invalid_index" })).toBeTruthy();
        expect(
          await adapter.indexExists("ex", "number", { name: "invalid_index", valid: true }),
        ).toBeFalsy();
        expect(
          await adapter.indexExists("ex", "number", { name: "invalid_index", valid: false }),
        ).toBeTruthy();
      });
    });

    itIfSupports("nulls_not_distinct", "index with not distinct nulls", async () => {
      await withExampleTable(adapter, async () => {
        await adapter.execute(
          `CREATE UNIQUE INDEX index_ex_on_data ON ex (data) NULLS NOT DISTINCT WHERE number > 0`,
        );
        const index = (await adapter.indexes("ex"))[0];
        expect(index.unique).toBe(true);
        expect(index.where).toMatch("number");
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
      await assertRaises([TypeError], {}, () => adapter.execute(null));
    });

    it("translate no connection exception to not established", async () => {
      const pidRows = await adapter.execute("SELECT pg_backend_pid() AS pid");
      const pid = (pidRows[0] as { pid: number }).pid;
      await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
        await adapter2.execute(`SELECT pg_terminate_backend(${pid})`);
      });
      await assertRaises([ConnectionFailed], {}, () => adapter.execute("SELECT 1"));
    });

    it("reload type map for newly defined types", async () => {
      const { Enum: OidEnum } = await import("../../connection-adapters/postgresql/oid/enum.js");
      await adapter.createEnum("feeling", ["good", "bad"]);
      try {
        await assertQueriesCount(1, true, async () => {
          const result = await adapter.selectAll("SELECT 'good'::feeling");
          expect(result.columnTypes["feeling"]).toBeInstanceOf(OidEnum);
        });
      } finally {
        await assertQueriesMatch(/from pg_type/i, undefined, true, () =>
          adapter.dropEnum("feeling", { ifExists: true }),
        );
      }
    });

    it("only reload type map once for every unrecognized type", async () => {
      await adapter.selectAll("SELECT 1");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await assertQueriesCount(2, true, () =>
          adapter.selectAll("select 'pg_catalog.pg_class'::regclass"),
        );
        await assertQueriesCount(1, true, () =>
          adapter.selectAll("select 'pg_catalog.pg_class'::regclass"),
        );
        await assertQueriesCount(2, true, () => adapter.selectAll("SELECT NULL::anyarray"));
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("only warn on first encounter of unrecognized oid", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await adapter.selectAll(`select 'pg_catalog.pg_class'::regclass`);
        await adapter.selectAll(`select 'pg_catalog.pg_class'::regclass`);
        await adapter.selectAll(`select 'pg_catalog.pg_class'::regclass`);
        const warning = warnSpy.mock.calls
          .filter((c) => typeof c[0] === "string" && /unknown OID \d+/.test(c[0]))
          .map((c) => `${c[0]}\n`)
          .join("");
        expect(warning).toMatch(
          /^unknown OID \d+: failed to recognize type of 'regclass'\. It will be treated as String\.\n$/,
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("unparsed defaults are at least set when saving", async () => {
      await withExampleTable(
        adapter,
        async () => {
          class NumberKlass extends Base {
            declare number: number | null;
            static tableName = "ex";
          }
          await NumberKlass.loadSchema();
          const column = NumberKlass.columnsHash()["number"];
          expect(column.default).toBeNull();
          expect(column.defaultFunction).toBeNull();

          const firstNumber = new NumberKlass();
          expect(firstNumber.number).toBeNull();

          await firstNumber.saveBang();
          expect((await firstNumber.reload()).number).toBe(4);
        },
        "id SERIAL PRIMARY KEY, number INTEGER NOT NULL DEFAULT (4 + 4) * 2 / 4",
      );
    });

    it("only check for insensitive comparison capability once", async () => {
      await adapter.execute("CREATE DOMAIN example_type AS integer");
      try {
        await withExampleTable(
          adapter,
          async () => {
            class NumberKlass extends Base {
              static tableName = "ex";
            }
            const attribute = NumberKlass.arelTable.get("number");
            await assertQueriesCount(undefined, true, () =>
              adapter.caseInsensitiveComparison(attribute, "foo"),
            );
            await assertNoQueries(false, () => adapter.caseInsensitiveComparison(attribute, "foo"));
          },
          "id SERIAL PRIMARY KEY, number example_type",
        );
      } finally {
        await adapter.execute("DROP DOMAIN example_type");
      }
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
        const error = await assertRaises([SQLWarning], {}, () =>
          adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$"),
        );
        expect((error as SQLWarning).connectionPool).toBe(adapter.pool);
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
          const warningEvent = events[0].error;

          expect(warningEvent).toBeInstanceOf(SQLWarning);
          expect(warningEvent.message).toBe("PostgreSQL SQL warning");
        });
      } finally {
        ActiveSupport.errorReporter = previousReporter;
      }
    });

    it("warnings behaviour can be customized with a proc", async () => {
      let warningMessage: string | null = null;
      let warningLevel: string | null = null;
      const warningAction = (warning: SQLWarning) => {
        warningMessage = warning.message;
        warningLevel = warning.level;
      };
      await withDbWarningsAction(warningAction, async () => {
        await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");

        expect(warningMessage).toBe("PostgreSQL SQL warning");
        expect(warningLevel).toBe("WARNING");
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
        const result = await adapter.execute("DROP TABLE IF EXISTS non_existent_table");

        expect(result).toEqual([]);
      });
    });

    it("date decoding enabled", async () => {
      const date = (await adapter.selectValue("select '2024-01-01'::date")) as Temporal.PlainDate;
      expect(date).toEqual(Temporal.PlainDate.from("2024-01-01"));
      expect(date.constructor).toBe(Temporal.PlainDate);
    });

    it("date decoding disabled", async () => {
      const saved = PostgreSQLAdapter.decodeDates;
      PostgreSQLAdapter.decodeDates = false;
      const connection = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        const date = await connection.selectValue("select '2024-01-01'::date");
        expect(date).toBe("2024-01-01");
        expect((date as string).constructor).toBe(String);
      } finally {
        await connection.disconnectBang();
        PostgreSQLAdapter.decodeDates = saved;
      }
    });

    it("disable extension with schema", async () => {
      const sql =
        "SELECT extname FROM pg_extension WHERE extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'custom_schema')";
      try {
        await adapter.execute("CREATE SCHEMA custom_schema");
        await adapter.execute("DROP EXTENSION IF EXISTS hstore");
        await adapter.execute("CREATE EXTENSION hstore SCHEMA custom_schema");
        let result = await adapter.query(sql);
        expect(result).toEqual([["hstore"]]);

        await adapter.disableExtension("custom_schema.hstore");
        result = await adapter.query(sql);
        expect(result).toEqual([]);
      } finally {
        await adapter.execute("DROP EXTENSION IF EXISTS hstore");
        await adapter.execute("DROP SCHEMA IF EXISTS custom_schema CASCADE");
      }
    });

    it("disable extension without schema", async () => {
      try {
        await adapter.execute("DROP EXTENSION IF EXISTS hstore");
        await adapter.execute("CREATE EXTENSION hstore");
        let result = await adapter.query("SELECT extname FROM pg_extension");
        expect(result).toContainEqual(["hstore"]);

        await adapter.disableExtension("hstore");
        result = await adapter.query("SELECT extname FROM pg_extension");
        expect(result).not.toContainEqual(["hstore"]);
      } finally {
        await adapter.execute("DROP EXTENSION IF EXISTS hstore");
      }
    });
  });
});
