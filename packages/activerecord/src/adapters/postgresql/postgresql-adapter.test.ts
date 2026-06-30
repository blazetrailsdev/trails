/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_adapter_test.rb
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { itIfSupports } from "../../test-helpers/supports.js";
import * as Arel from "@blazetrails/arel";
import { ConnectionFailed, ConnectionNotEstablished, SQLWarning } from "../../errors.js";
import { withSecondAdapter } from "../../test-helpers/second-connection.js";

// Run `fn` with `ext` guaranteed disabled; restore the pre-state (enabled
// or disabled) on exit even if `fn` throws before tearing down whatever it
// created.
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

// Same as withExtensionDisabled but inverted: `ext` is guaranteed enabled
// inside `fn` and its pre-state (enabled or disabled) is restored on exit
// even if `fn` throws before touching the extension itself.
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
    // Clean up test tables
    try {
      await adapter.exec(`DROP TABLE IF EXISTS "CamelCase" CASCADE`);
      // Explicit teardown for every table this file creates via raw CREATE TABLE
      // (the dynamic `LIKE 'ex_%'` sweep below also drops them, but the static
      // list is what require-table-teardown balances against). IF EXISTS keeps
      // this idempotent and behavior-neutral.
      await adapter.exec(
        `DROP TABLE IF EXISTS pk_test, no_pk_test, ex_partial, ex_expr, ex_idx_opts, ex_opclass, ex_serial, ex_bigserial, ex_custom_seqt, ex_class, ex_uniq, ex_notnull, ex_parent, ex_child, ex_long, ex_lock, ex_dl, ex_num, ex_cast, ex_ser, ex_bool, ex_float, ex_int, ex_bigint, ex_numeric, ex_json, ex_jsonb, ex_backslash, ex_hs, ex_arr, ex_uuid, ex_xml, ex_cidr, ex_inet, ex_mac, ex_point, ex_bit, ex_rng, ex_custom_pk, ex_insert_ret, ex_insert_ret2, ex_insert_ret3, ex_insert_ret5, ex_serial_seq, ex_def_seq, ex_ns_pk, ex_no_seq, ex_no_pk, ex_keyword, ex_include, ex_include2, ex_incl_kw, ex_incl_esc, ex_invalid_idx, ex_nulls_nd, ex_unparsed_defaults, ex_dates, ex_insert_ret4, ex_pk_seq, ex_txn, ex_txn_rb, ex_txn_sp, ex_ret, ex_upd, ex_del, ex_ret2, ex_multi, ex_null, test_no_returning CASCADE`,
      );
      const tables = await adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'ex_%' OR tablename IN ('pk_test', 'no_pk_test', 'exec_test', 'ex_insert_ret', 'ex_insert_ret2', 'ex_insert_ret3', 'ex_insert_ret4', 'ex_insert_ret5'))`,
      );
      for (const t of tables) {
        await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
      }
    } catch {
      // ignore cleanup errors
    }
    await adapter.close();
  });

  describe("PostgreSQLAdapterTest", () => {
    it("primary key", async () => {
      await adapter.exec(`CREATE TABLE "pk_test" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const rows = await adapter.execute(
        `SELECT column_name FROM information_schema.key_column_usage
         WHERE table_name = 'pk_test' AND constraint_name LIKE '%pkey'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].column_name).toBe("id");
    });

    it("primary key returns nil for no pk", async () => {
      await adapter.exec(`CREATE TABLE "no_pk_test" ("name" TEXT, "value" INTEGER)`);
      const rows = await adapter.execute(
        `SELECT column_name FROM information_schema.key_column_usage
         WHERE table_name = 'no_pk_test' AND constraint_name LIKE '%pkey'`,
      );
      expect(rows).toHaveLength(0);
    });

    it("exec no binds", async () => {
      const rows = await adapter.execute("SELECT 1 AS val");
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe(1);
    });

    it("exec with binds", async () => {
      const rows = await adapter.execute("SELECT ? AS val", [1]);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].val)).toBe(1);
    });

    it("exec typecasts bind vals", async () => {
      const rows = await adapter.execute("SELECT ? AS val", ["hello"]);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe("hello");
    });

    it("table alias length", async () => {
      // PostgreSQL default max identifier length is 63
      const rows = await adapter.execute("SHOW max_identifier_length");
      const len = parseInt(String(rows[0].max_identifier_length), 10);
      expect(len).toBeGreaterThanOrEqual(63);
    });

    it("partial index", async () => {
      await adapter.exec(`CREATE TABLE "ex_partial" ("id" SERIAL PRIMARY KEY, "number" INTEGER)`);
      await adapter.exec(`CREATE INDEX "partial_idx" ON "ex_partial" ("id") WHERE number > 100`);
      const rows = await adapter.execute(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'ex_partial' AND indexname = 'partial_idx'`,
      );
      expect(rows).toHaveLength(1);
    });

    it("expression index", async () => {
      await adapter.exec(`CREATE TABLE "ex_expr" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.addIndex("ex_expr", ["lower(name)"], { name: "idx_expr_lower_name" });
      const indexes = await adapter.indexes("ex_expr");
      const idx = indexes.find((i) => i.name === "idx_expr_lower_name");
      expect(idx).toBeDefined();
    });

    it("index with opclass", async () => {
      await adapter.exec(`CREATE TABLE "ex_opclass" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.addIndex("ex_opclass", ["name"], {
        name: "idx_opclass_name",
        opclass: { name: "varchar_pattern_ops" },
      });
      const indexes = await adapter.indexes("ex_opclass");
      const idx = indexes.find((i) => i.name === "idx_opclass_name");
      expect(idx).toBeDefined();
    });

    it("only reload type map once for every unrecognized type", async () => {
      // Eagerly initialize so the spy captures only unrecognized-type reloads,
      // not the first-connection type-map bootstrap.
      await adapter.execQuery("SELECT 1");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const loadSpy = vi.spyOn(adapter, "loadAdditionalTypes");
      try {
        // First encounter of an unrecognized OID reloads the type map.
        await adapter.execQuery("select 'pg_catalog.pg_class'::regclass");
        const afterFirst = loadSpy.mock.calls.length;
        expect(afterFirst).toBeGreaterThan(0);
        // Same unrecognized OID again — a fallback type is already registered,
        // so no further reload.
        await adapter.execQuery("select 'pg_catalog.pg_class'::regclass");
        expect(loadSpy.mock.calls.length).toBe(afterFirst);
        // A different unrecognized type reloads the map again.
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
        // execQuery goes through getOidType which triggers the dedup logic.
        // execute() bypasses OID resolution so it cannot trigger the warn.
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

    // ── Bind parameter rewriting + type round-trip ──────────────────────
    // Our adapter rewrites ? → $1, $2. These tests verify that bind params
    // work correctly with various PG types through INSERT and SELECT.

    // ── Transaction tests ─────────────────────────────────────────────
    // Our adapter manages transactions, savepoints, and rollbacks.

    it("bad connection to postgres database", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.close();
    });

    it("reconnect after bad connection on check version", async () => {
      // Cache the true version off a live connection.
      expect(await adapter.getDatabaseVersion()).toBeGreaterThan(0);
      // Mimic a connection that hasn't checked and cached the server version yet.
      (adapter as unknown as { _databaseVersion: number | null })._databaseVersion = null;
      // Stub server_version to 0 (Rails: raw_connection.stub(:server_version, 0)).
      const versionSpy = vi.spyOn(adapter, "_serverVersion").mockResolvedValue(0);
      await expect(adapter.getDatabaseVersion()).rejects.toBeInstanceOf(ConnectionFailed);
      await expect(adapter.getDatabaseVersion()).rejects.toThrow(
        "Could not determine PostgreSQL version",
      );
      versionSpy.mockRestore();

      // Can reconnect after a bad connection.
      await adapter.reconnectBang();
      (adapter as unknown as { _databaseVersion: number | null })._databaseVersion = null;
      expect(await adapter.getDatabaseVersion()).toBeGreaterThan(0);
    });

    it("primary key works tables containing capital letters", async () => {
      await adapter.exec(`CREATE TABLE "CamelCase" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const pk = await adapter.primaryKey('"CamelCase"');
      expect(pk).toBe("id");
    });

    it("non standard primary key", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_custom_pk" ("custom_id" SERIAL PRIMARY KEY, "name" TEXT)`,
      );
      const pk = await adapter.primaryKey("ex_custom_pk");
      expect(pk).toBe("custom_id");
    });

    it("exec insert with returning disabled and no sequence name given", async () => {
      await adapter.exec(`CREATE TABLE "ex_insert_ret" ("id" SERIAL PRIMARY KEY, "number" INT)`);
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "ex_insert_ret" ("number") VALUES (1)`,
          null,
          [],
          "id",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });
    it("exec insert default values with returning disabled and no sequence name given", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_insert_ret2" ("id" SERIAL PRIMARY KEY, "number" INT DEFAULT 0)`,
      );
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "ex_insert_ret2" DEFAULT VALUES`,
          null,
          [],
          "id",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret2"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });
    it("exec insert default values quoted schema with returning disabled and no sequence name given", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_insert_ret3" ("id" SERIAL PRIMARY KEY, "number" INT DEFAULT 0)`,
      );
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "public"."ex_insert_ret3" DEFAULT VALUES`,
          null,
          [],
          "id",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret3"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });

    it("serial sequence", async () => {
      await adapter.exec(`CREATE TABLE "ex_serial_seq" ("id" SERIAL PRIMARY KEY)`);
      const result = await adapter.pkAndSequenceFor("ex_serial_seq");
      expect(result).not.toBeNull();
      expect(result![1]!.name).toBe("ex_serial_seq_id_seq");
    });

    it("default sequence name", async () => {
      await adapter.exec(`CREATE TABLE "ex_def_seq" ("id" SERIAL PRIMARY KEY)`);
      const result = await adapter.pkAndSequenceFor("ex_def_seq");
      expect(result).not.toBeNull();
      expect(result![1]!.name).toBe("ex_def_seq_id_seq");
    });

    it("default sequence name bad table", async () => {
      const result = await adapter.pkAndSequenceFor("nonexistent_table_xyz");
      expect(result).toBeNull();
    });

    it("pk and sequence for with non standard primary key", async () => {
      await adapter.exec(`CREATE TABLE "ex_ns_pk" ("custom_id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const result = await adapter.pkAndSequenceFor("ex_ns_pk");
      expect(result).not.toBeNull();
      expect(result![0]).toBe("custom_id");
      expect(result![1]!.name).toBe("ex_ns_pk_custom_id_seq");
    });

    it("pk and sequence for returns nil if no seq", async () => {
      await adapter.exec(`CREATE TABLE "ex_no_seq" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
      const result = await adapter.pkAndSequenceFor("ex_no_seq");
      expect(result).not.toBeNull();
      expect(result![0]).toBe("id");
      expect(result![1]).toBeNull();
    });

    it("pk and sequence for returns nil if no pk", async () => {
      await adapter.exec(`CREATE TABLE "ex_no_pk" ("name" TEXT, "val" INTEGER)`);
      const result = await adapter.pkAndSequenceFor("ex_no_pk");
      expect(result).toBeNull();
    });

    it("pk and sequence for returns nil if table not found", async () => {
      const result = await adapter.pkAndSequenceFor("does_not_exist_xyz");
      expect(result).toBeNull();
    });
    it("pk and sequence for with collision pg class oid", async () => {
      await adapter.exec(`CREATE TABLE "ex" ("id" SERIAL PRIMARY KEY)`);
      await adapter.exec(`CREATE TABLE "ex2" ("id" SERIAL PRIMARY KEY)`);
      try {
        // classid, objid, objsubid, refclassid, refobjid, refobjsubid, deptype
        const correctDependRecord = [
          "'pg_class'::regclass",
          "'ex_id_seq'::regclass",
          "0",
          "'pg_class'::regclass",
          "'ex'::regclass",
          "1",
          "'a'",
        ];
        // A spurious dependency whose classid is pg_attrdef rather than pg_class —
        // a "collision" that the correct query must ignore when resolving ex's sequence.
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
        expect(result![1]).toEqual({ schema: "public", name: "ex_id_seq" });

        await adapter.exec(
          `DELETE FROM pg_depend WHERE objid = 'ex2_id_seq'::regclass AND refobjid = 'ex'::regclass AND deptype = 'a'`,
        );
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS "ex" CASCADE`);
        await adapter.exec(`DROP TABLE IF EXISTS "ex2" CASCADE`);
      }
    });

    it("partial index on column named like keyword", async () => {
      await adapter.exec(`CREATE TABLE "ex_keyword" ("id" SERIAL PRIMARY KEY, "order" INTEGER)`);
      await adapter.addIndex("ex_keyword", ["order"], {
        name: "idx_keyword_order",
        where: '"order" > 10',
      });
      const indexes = await adapter.indexes("ex_keyword");
      expect(indexes.find((i) => i.name === "idx_keyword_order")).toBeDefined();
    });

    itIfSupports("index_include", "include index", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_include" ("id" SERIAL PRIMARY KEY, "name" TEXT, "email" TEXT)`,
      );
      await adapter.addIndex("ex_include", ["name"], {
        name: "idx_include_name",
        include: ["email"],
      });
      const indexes = await adapter.indexes("ex_include");
      expect(indexes.find((i) => i.name === "idx_include_name")).toBeDefined();
    });

    itIfSupports("index_include", "include multiple columns index", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_include2" ("id" SERIAL PRIMARY KEY, "a" TEXT, "b" TEXT, "c" TEXT)`,
      );
      await adapter.addIndex("ex_include2", ["a"], {
        name: "idx_include_multi",
        include: ["b", "c"],
      });
      const indexes = await adapter.indexes("ex_include2");
      expect(indexes.find((i) => i.name === "idx_include_multi")).toBeDefined();
    });

    itIfSupports("index_include", "include keyword column name", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_incl_kw" ("id" SERIAL PRIMARY KEY, "name" TEXT, "order" INTEGER)`,
      );
      await adapter.addIndex("ex_incl_kw", ["name"], {
        name: "idx_incl_kw",
        include: ["order"],
      });
      const indexes = await adapter.indexes("ex_incl_kw");
      expect(indexes.find((i) => i.name === "idx_incl_kw")).toBeDefined();
    });

    itIfSupports("index_include", "include escaped quotes column name", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_incl_esc" ("id" SERIAL PRIMARY KEY, "name" TEXT, "desc" TEXT)`,
      );
      await adapter.addIndex("ex_incl_esc", ["name"], {
        name: "idx_incl_esc",
        include: ["desc"],
      });
      const indexes = await adapter.indexes("ex_incl_esc");
      expect(indexes.find((i) => i.name === "idx_incl_esc")).toBeDefined();
    });

    it("invalid index", async () => {
      await adapter.exec(`CREATE TABLE "ex_invalid_idx" ("id" SERIAL PRIMARY KEY)`);
      await expect(
        adapter.addIndex("ex_invalid_idx", ["nonexistent_column"], { name: "idx_bad" }),
      ).rejects.toThrow();
    });

    itIfSupports("nulls_not_distinct", "index with not distinct nulls", async () => {
      await adapter.exec(`CREATE TABLE "ex_nulls_nd" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.addIndex("ex_nulls_nd", ["name"], {
        name: "idx_nulls_nd",
        unique: true,
        nullsNotDistinct: true,
      });
      const indexes = await adapter.indexes("ex_nulls_nd");
      expect(indexes.find((i) => i.name === "idx_nulls_nd")).toBeDefined();
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
      // execute(null) propagates TypeError unchanged (pg rejects null text; not a DatabaseError).
      await expect(adapter.execute(null as any)).rejects.toBeInstanceOf(TypeError);
    });
    it("translate no connection exception to not established", async () => {
      // Open the connection and capture its backend pid.
      const pidRows = await adapter.execute("SELECT pg_backend_pid() AS pid");
      const pid = (pidRows[0] as { pid: number }).pid;
      // Terminate this backend from a separate connection. After the single
      // persistent client's backend is gone, the next query on it surfaces a
      // connection error that translates to ConnectionNotEstablished — rather
      // than transparently retrying (allowRetry defaults to false).
      await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
        await adapter2.execute(`SELECT pg_terminate_backend(${pid})`);
      });
      await expect(adapter.execute("SELECT 1")).rejects.toBeInstanceOf(ConnectionNotEstablished);
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
    it("unparsed defaults are at least set when saving", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_unparsed_defaults" (id SERIAL PRIMARY KEY, number INTEGER NOT NULL DEFAULT (4 + 4) * 2 / 4)`,
      );
      const cols = await adapter.columns("ex_unparsed_defaults");
      const numberCol = cols.find((c) => c.name === "number")!;
      // Rails: arithmetic-expression defaults — extract_value_from_default and
      // extract_default_function both return nil; the column carries neither a
      // literal default nor a SQL function. The DB still applies the default
      // on INSERT, so save! must NOT emit `number = NULL`.
      expect(numberCol.default).toBeNull();
      expect(numberCol.defaultFunction == null).toBe(true);
      await adapter.exec(`INSERT INTO "ex_unparsed_defaults" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT number FROM "ex_unparsed_defaults"`);
      expect(Number(rows[0].number)).toBe(4);
    });
    it("only check for insensitive comparison capability once", async () => {
      await adapter.execute(`CREATE DOMAIN example_type AS integer`);
      const schemaQuerySpy = vi.spyOn(adapter, "schemaQuery");
      try {
        // canPerformCaseInsensitiveComparisonFor does the pg_proc lookup via schemaQuery.
        // Spy on schemaQuery to verify the cache prevents a second DB round-trip.
        const col = { sqlType: "example_type" };
        await adapter.canPerformCaseInsensitiveComparisonFor(col);
        const callsAfterFirst = schemaQuerySpy.mock.calls.length;
        await adapter.canPerformCaseInsensitiveComparisonFor(col);
        expect(schemaQuerySpy.mock.calls.length).toBe(callsAfterFirst);
      } finally {
        schemaQuerySpy.mockRestore();
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
    // db_warnings_action tests — flat under PostgreSQLAdapterTest to mirror
    // Rails (no sub-context). Hooks save/restore the static warnings config.
    let savedWarningsAction: typeof PostgreSQLAdapter.dbWarningsAction;
    let savedWarningsIgnore: typeof PostgreSQLAdapter.dbWarningsIgnore;
    beforeEach(() => {
      savedWarningsAction = PostgreSQLAdapter.dbWarningsAction;
      savedWarningsIgnore = PostgreSQLAdapter.dbWarningsIgnore;
    });
    afterEach(() => {
      PostgreSQLAdapter.dbWarningsAction = savedWarningsAction;
      PostgreSQLAdapter.dbWarningsIgnore = savedWarningsIgnore;
      vi.restoreAllMocks();
    });

    it("ignores warnings when behaviour ignore", async () => {
      PostgreSQLAdapter.dbWarningsAction = "ignore";
      const rows = await adapter.execute("do $$ BEGIN RAISE WARNING 'foo'; END; $$");
      expect(rows).toEqual([]);
    });

    it("logs warnings when behaviour log", async () => {
      PostgreSQLAdapter.dbWarningsAction = "log";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("PostgreSQL SQL warning"));
    });

    it("raises warnings when behaviour raise", async () => {
      PostgreSQLAdapter.dbWarningsAction = "raise";
      await expect(
        adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$"),
      ).rejects.toBeInstanceOf(SQLWarning);
    });

    it("reports when behaviour report", async () => {
      const { ErrorReporter, setErrorReporter } = await import("@blazetrails/activesupport");
      PostgreSQLAdapter.dbWarningsAction = "report";
      const reporter = new ErrorReporter();
      const events: Array<{ error: Error; handled: boolean }> = [];
      reporter.subscribe({
        report: ({ error, handled }) => {
          events.push({ error, handled });
        },
      });
      setErrorReporter(reporter);
      try {
        await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
        expect(events).toHaveLength(1);
        expect(events[0].error).toBeInstanceOf(SQLWarning);
        expect(events[0].error.message).toBe("PostgreSQL SQL warning");
        expect(events[0].handled).toBe(true);
      } finally {
        setErrorReporter(null);
      }
    });

    it("warnings behaviour can be customized with a proc", async () => {
      let captured: SQLWarning | null = null;
      PostgreSQLAdapter.dbWarningsAction = (w) => {
        captured = w;
      };
      await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
      expect(captured).toBeInstanceOf(SQLWarning);
      expect((captured as unknown as SQLWarning).message).toBe("PostgreSQL SQL warning");
      expect((captured as unknown as SQLWarning).level).toBe("WARNING");
    });

    it("allowlist of warnings to ignore", async () => {
      PostgreSQLAdapter.dbWarningsAction = "raise";
      PostgreSQLAdapter.dbWarningsIgnore = [/PostgreSQL SQL warning/];
      const rows = await adapter.execute(
        "do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$",
      );
      expect(rows).toEqual([]);
    });

    it("allowlist of warning codes to ignore", async () => {
      PostgreSQLAdapter.dbWarningsAction = "raise";
      PostgreSQLAdapter.dbWarningsIgnore = ["01000"];
      const rows = await adapter.execute(
        "do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$",
      );
      expect(rows).toEqual([]);
    });

    it("does not raise notice level warnings", async () => {
      PostgreSQLAdapter.dbWarningsAction = "raise";
      // DROP TABLE IF EXISTS fires a NOTICE (not WARNING) — must not raise
      await expect(
        adapter.execute("DROP TABLE IF EXISTS non_existent_table_xyz_warnings"),
      ).resolves.toBeDefined();
    });

    it("date decoding enabled", async () => {
      await adapter.exec(`CREATE TABLE "ex_dates" ("id" SERIAL PRIMARY KEY, "d" DATE)`);
      await adapter.exec(`INSERT INTO "ex_dates" ("d") VALUES ('2023-06-15')`);
      const rows = await adapter.execute(`SELECT "d" FROM "ex_dates"`);
      const d = rows[0].d as Temporal.PlainDate;
      expect(d).toBeInstanceOf(Temporal.PlainDate);
      expect(d.year).toBe(2023);
      expect(d.month).toBe(6);
      expect(d.day).toBe(15);
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
        await adapter.exec(`CREATE SCHEMA IF NOT EXISTS "ex_extensions"`);
        try {
          await adapter.exec(`CREATE EXTENSION "hstore" WITH SCHEMA "ex_extensions"`);
          const before = await adapter.extensionEnabled("hstore");
          expect(before).toBe(true);
          await adapter.disableExtension("hstore", { schema: "ex_extensions" });
          const after = await adapter.extensionEnabled("hstore");
          expect(after).toBe(false);
        } finally {
          await adapter.exec(`DROP SCHEMA IF EXISTS "ex_extensions" CASCADE`);
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
    it("connection error", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.close();
    });

    it("reconnection error", async () => {
      // Mirrors Rails: test_reconnection_error. Rails stubs PG.connect to raise
      // "actual bad connection error" and asserts reconnect! re-raises it as
      // ConnectionNotEstablished. Our adapter connects lazily on first use and
      // wraps pg.Client, so stub Client.connect to reject with that message and
      // assert the translated ConnectionNotEstablished carries it through.
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
        await expect(a.execute("SELECT 1")).rejects.toBeInstanceOf(ConnectionNotEstablished);
        await expect(a.execute("SELECT 1")).rejects.toThrow("actual bad connection error");
      } finally {
        clientSpy.mockRestore();
        await a.close().catch(() => {});
      }
    });

    it("database exists returns true when the database exists", async () => {
      const [{ current_database }] = await adapter.execute(
        `SELECT current_database() AS current_database`,
      );
      const exists = await adapter.databaseExists(current_database as string);
      expect(exists).toBe(true);
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

    it("bad connection", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.close();
    });

    it("database exists returns false when the database does not exist", async () => {
      const exists = await adapter.databaseExists("nonexistent_db_xyz_12345");
      expect(exists).toBe(false);
    });
    it("exec insert with returning disabled", async () => {
      await adapter.exec(`CREATE TABLE "ex_insert_ret4" ("id" SERIAL PRIMARY KEY, "number" INT)`);
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "ex_insert_ret4" ("number") VALUES (1)`,
          null,
          [],
          "id",
          "ex_insert_ret4_id_seq",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret4"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });

    it("pk and sequence for", async () => {
      await adapter.exec(`CREATE TABLE "ex_pk_seq" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const result = await adapter.pkAndSequenceFor("ex_pk_seq");
      expect(result).not.toBeNull();
      expect(result![0]).toBe("id");
    });
  });
});
