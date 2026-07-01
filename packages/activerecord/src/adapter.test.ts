import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { SchemaCreation } from "./connection-adapters/abstract/schema-creation.js";
import { AdapterError, ConnectionFailed } from "./errors.js";
import {
  Base,
  disablePreparedStatements,
  setDisablePreparedStatements,
  NotNullViolation,
  RecordNotUnique,
  StatementInvalid,
  Deadlocked,
  InvalidForeignKey,
  RangeError,
  ValueTooLong,
  registerModel,
  Rollback,
} from "./index.js";
import { Result } from "./result.js";
import { fixtures, setupFixtures } from "./test-helpers/fixtures.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { adapterType, inMemoryDb } from "./test-adapter.js";
import { itIfSupports } from "./test-helpers/supports.js";
import { establishFromTestConfig } from "./test-helpers/test-database-config.js";
import { runWithoutConnection } from "./test-helpers/connection-helper.js";
import { Book } from "./test-helpers/models/book.js";
import { Post } from "./test-helpers/models/post.js";
import { Author, AuthorAddress } from "./test-helpers/models/author.js";
import { Movie } from "./test-helpers/models/movie.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { Event } from "./test-helpers/models/event.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
  databaseName,
  ARUNIT_DATABASE,
  ARUNIT2_DATABASE,
} from "./adapters/abstract-mysql-adapter/test-helper.js";

// Build the placeholder the same way Rails does — `Arel::Nodes::BindParam.new(nil)
// .to_sql` collects the `?` marker — rather than hard-coding a literal `?`.
const qm = new Nodes.BindParam(null).toSql();

// Drives Rails' AdapterTest casted/non-casted bind probes against the leased
// connection and the canonical `events` table. The insert return value is
// normalized (`Number(...)`) and skipped on MySQL, whose driver reports `0` for
// an explicit-id INSERT rather than the inserted key.
async function roundTripBinds(conn: DatabaseAdapter, binds: unknown[]): Promise<void> {
  const id = await conn.insert(
    `INSERT INTO events(id) VALUES (${qm})`,
    null,
    null,
    null,
    null,
    binds,
  );
  // Rails asserts `assert_equal 1, id` unconditionally; the mysql2 driver reports
  // insertId 0 for an explicit-id INSERT (the value isn't auto-generated), so skip
  // only the insert-return check there. The bound SELECT below still asserts the
  // row round-trips as `{ id: 1, ... }` on every adapter.
  if (adapterType !== "mysql") expect(Number(id)).toBe(1);

  const updated = await conn.update(
    `UPDATE events SET title = 'foo' WHERE id = ${qm}`,
    null,
    binds,
  );
  expect(updated).toBe(1);

  const found = await conn.selectAll(`SELECT * FROM events WHERE id = ${qm}`, null, binds);
  const foundRow = found.first() as { id: unknown; title: string };
  expect({ ...foundRow, id: Number(foundRow.id) }).toEqual({ id: 1, title: "foo" });

  const deleted = await conn.delete(`DELETE FROM events WHERE id = ${qm}`, null, binds);
  expect(deleted).toBe(1);

  const empty = await conn.selectAll(`SELECT * FROM events WHERE id = ${qm}`, null, binds);
  expect(empty.first()).toBeUndefined();
}

// Mirrors Rails' AdapterConnectionTest#raw_transaction_open? — whether a
// transaction is actually live on the *raw* connection (independent of the
// adapter's lazy-transaction bookkeeping).
async function rawTransactionOpen(conn: DatabaseAdapter): Promise<boolean> {
  if (adapterType === "postgres") {
    // ruby-pg reads `raw_connection.transaction_status == PG::PQTRANS_INTRANS`.
    // node-postgres' pg.Client exposes no transaction_status, but the PG
    // adapter flips `_inTransaction` in the very code path that issues
    // BEGIN/COMMIT/ROLLBACK on the raw client, so it faithfully tracks whether
    // a transaction is live on the raw connection.
    return Boolean((conn as unknown as { _inTransaction?: boolean })._inTransaction);
  }
  if (adapterType === "mysql") {
    // Probe exactly as Rails does: a SAVEPOINT only succeeds inside a
    // transaction; otherwise the RELEASE raises because the savepoint never
    // existed.
    const raw = (
      conn as unknown as { _clientForTest(): { query(sql: string): Promise<unknown> } | null }
    )._clientForTest();
    if (!raw) return false;
    try {
      await raw.query("SAVEPOINT transaction_test");
      await raw.query("RELEASE SAVEPOINT transaction_test");
      return true;
    } catch {
      return false;
    }
  }
  // SQLite: Rails probes `raw_connection.transaction { nil }` (raises if already
  // inside a transaction). trails tracks that state on the adapter directly.
  return Boolean((conn as unknown as { inTransaction?: boolean }).inTransaction);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Mirrors Rails' AdapterConnectionTest#remote_disconnect — provokes the server
// to drop the connection out from under the adapter. SQLite has no analog
// (Rails `skip`s), so callers gate the dependent tests on a non-in-memory,
// non-SQLite adapter.
async function remoteDisconnect(conn: DatabaseAdapter): Promise<void> {
  if (adapterType === "postgres") {
    const raw = (
      conn as unknown as {
        _rawConnectionForTest(): { query(sql: string): Promise<unknown> } | null;
      }
    )._rawConnectionForTest();
    if (!raw) return;
    if (!(conn as unknown as { _inTransaction?: boolean })._inTransaction) {
      await raw.query("begin");
    }
    await raw.query("set idle_in_transaction_session_timeout = '10ms'");
    await sleep(50);
  } else if (adapterType === "mysql") {
    await (
      conn as unknown as {
        internalExecute(
          sql: string,
          name?: string,
          opts?: { materializeTransactions?: boolean },
        ): Promise<unknown>;
      }
    ).internalExecute("set @@wait_timeout=1", "SQL", { materializeTransactions: false });
    await sleep(1200);
  }
}

// Mirrors Rails' AdapterConnectionTest#kill_connection_from_server — kills a
// server-side connection by id from a *different* pooled connection.
async function killConnectionFromServer(
  conn: DatabaseAdapter,
  connectionId: unknown,
): Promise<void> {
  const pool = (
    conn as unknown as { pool: { checkout(): DatabaseAdapter; checkin(c: DatabaseAdapter): void } }
  ).pool;
  const killer = pool.checkout();
  try {
    if (adapterType === "mysql") {
      await killer.execute(`KILL ${connectionId}`);
    } else if (adapterType === "postgres") {
      await killer.execute(`SELECT pg_cancel_backend(${connectionId})`);
    }
  } finally {
    pool.checkin(killer);
  }
}

// Mirrors Rails' `active?` — an active liveness probe (PG sends `;`, MySQL
// issues mysql_ping) on the raw connection, which detects a *remote* disconnect
// that the adapter doesn't yet know about. trails' sync `active` getter is
// optimistic and only reflects an adapter-initiated disconnect
// (postgresql-adapter.ts:2523 documents that it cannot run this async ping), so
// the remote-disconnect cases drive the probe directly here. The raw ping has
// no adapter-state side effects (unlike `activeAsync()`), matching Rails'
// pure `active?` check.
async function activePredicate(conn: DatabaseAdapter): Promise<boolean> {
  if (adapterType === "postgres") {
    const raw = (
      conn as unknown as {
        _rawConnectionForTest(): { query(sql: string): Promise<unknown> } | null;
      }
    )._rawConnectionForTest();
    if (!raw) return false;
    try {
      await raw.query(";");
      return true;
    } catch {
      return false;
    }
  }
  if (adapterType === "mysql") {
    const raw = (
      conn as unknown as { _clientForTest(): { ping(): Promise<unknown> } | null }
    )._clientForTest();
    if (!raw) return false;
    try {
      await raw.ping();
      return true;
    } catch {
      return false;
    }
  }
  // SQLite (not reached: remote-disconnect cases are gated on remoteSupported).
  return conn.active;
}

// Faithful port of Rails' AdapterTest (adapter_test.rb). Rides the canonical
// schema + official Book/Post/Author/Event models and real fixtures; the leased
// `Base.connection` stands in for Rails' `@connection = ...lease_connection`.
describe("AdapterTest", () => {
  registerModel("Author", Author);
  registerModel("Post", Post);
  registerModel("Book", Book);
  registerModel("Event", Event);
  fixtures(["accounts", "authors", "tasks", "topics", "subscribers", "posts", "books"], {
    schema: canonicalSchema,
    usesTransaction: [
      // Raise a DB error mid-statement (aborts an open PG transaction, poisoning
      // transactional teardown) — run un-wrapped; they persist nothing. The
      // index tests' add_index/remove_index commit (DDL auto-commits on MySQL),
      // so they too run outside the shared transaction (cleanup in a finally).
      "value limit violations are translated to specific exception",
      "numeric value out of ranges are translated to specific exception",
      "uniqueness violations are translated to specific exception",
      "not null violations are translated to specific exception",
      "database related exceptions are translated to statement invalid",
      "indexes",
      "remove index when name and wrong column name specified",
      "remove index when name and wrong column name specified positional argument",
    ],
  });

  // The Event-backed `events` table is not among the fixtures wired above, so
  // ensure it exists (mirrors schema.rb `t.string :title, limit: 5`). The
  // sqlite worker DB is seeded with the full canonical schema, so events
  // already exists there; only the server adapters need the explicit create.
  beforeAll(async () => {
    if (adapterType !== "sqlite") await defineSchema({ events: canonicalSchema.events });
  });

  // Rails runs this `unless current_adapter?(:PostgreSQLAdapter) ||
  // (current_adapter?(:SQLite3Adapter) && !prepared_statements)` (adapter_test.rb:19) —
  // i.e. on MySQL and SQLite (SQLite defaults prepared_statements: true), excluding
  // only PostgreSQL.
  it.skipIf(adapterType === "postgres")("update prepared statement", async () => {
    const b = await Book.create({ name: "my \x00 book" });
    await b.reload();
    expect(b.name).toBe("my \x00 book");

    await b.update({ name: "my other \x00 book" });
    await b.reload();
    expect(b.name).toBe("my other \x00 book");
  });

  it.skip("create record with pk as zero", () => {
    // BLOCKED: schema-gen. defineSchema emits the canonical `books` PK as an
    // auto-increment/identity column (PG GENERATED AS IDENTITY, MySQL AUTO_INCREMENT
    // treats inserted 0 as "next value"), so explicit `id: 0` is overridden and
    // `Book.find(0)` misses. Rails declares `books` with `id: :integer` (plain integer
    // PK that honours 0). Skipped until defineSchema can mirror that.
  });

  it("valid column", () => {
    const conn = Base.connection;
    for (const type of Object.keys(conn.nativeDatabaseTypes())) {
      expect(conn.isValidType(type)).toBe(true);
    }
  });

  it("invalid column", () => {
    expect(Base.connection.isValidType("foobar")).toBe(false);
  });

  it("tables", async () => {
    const tables = await Base.connection.tables();
    expect(tables).toContain("accounts");
    expect(tables).toContain("authors");
    expect(tables).toContain("tasks");
    expect(tables).toContain("topics");
  });

  it("table exists?", async () => {
    const conn = Base.connection;
    // Rails passes both "accounts" and :accounts; symbols collapse to strings here.
    expect(await conn.tableExists("accounts")).toBe(true);
    expect(await conn.tableExists("nonexistingtable")).toBe(false);
    expect(await conn.tableExists("'")).toBe(false);
    expect(await conn.tableExists(null as unknown as string)).toBe(false);
  });

  it("data sources", async () => {
    const dataSources = await Base.connection.dataSources();
    expect(dataSources).toContain("accounts");
    expect(dataSources).toContain("authors");
    expect(dataSources).toContain("tasks");
    expect(dataSources).toContain("topics");
  });

  it("data source exists?", async () => {
    const conn = Base.connection;
    expect(await conn.isDataSourceExists("accounts")).toBe(true);
    expect(await conn.isDataSourceExists("nonexistingtable")).toBe(false);
    expect(await conn.isDataSourceExists("'")).toBe(false);
    expect(await conn.isDataSourceExists(null as unknown as string)).toBe(false);
  });

  it("indexes", async () => {
    const idxName = "accounts_idx";
    const conn = Base.connection;
    try {
      expect(await conn.indexes("accounts")).toEqual([]);

      await conn.addIndex("accounts", "firm_id", { name: idxName });
      const indexes = (await conn.indexes("accounts")) as Array<{
        table: string;
        name: string;
        unique: boolean;
        columns: string[];
      }>;
      expect(indexes[0].table).toBe("accounts");
      expect(indexes[0].name).toBe(idxName);
      expect(indexes[0].unique).toBe(false);
      expect(indexes[0].columns).toEqual(["firm_id"]);
    } finally {
      await conn.removeIndex("accounts", { name: idxName }).catch(() => {});
    }
  });

  it("returns empty indexes for non existing table", async () => {
    expect(await Base.connection.indexes("nonexistingtable")).toEqual([]);
  });

  it("remove index when name and wrong column name specified", async () => {
    const conn = Base.connection;
    const indexName = "accounts_idx";
    try {
      await conn.addIndex("accounts", "firm_id", { name: indexName });
      await expect(
        conn.removeIndex("accounts", { name: indexName, column: "wrong_column_name" }),
      ).rejects.toBeInstanceOf(ArgumentError);
    } finally {
      await conn.removeIndex("accounts", { name: indexName });
    }
  });

  it("remove index when name and wrong column name specified positional argument", async () => {
    const conn = Base.connection;
    const indexName = "accounts_idx";
    try {
      await conn.addIndex("accounts", "firm_id", { name: indexName });
      await expect(
        conn.removeIndex("accounts", "wrong_column_name", { name: indexName }),
      ).rejects.toBeInstanceOf(ArgumentError);
    } finally {
      await conn.removeIndex("accounts", { name: indexName });
    }
  });

  // current database (gated by respond_to?(:current_database)) lives in the
  // describeIfMysql AdapterTest block below (MySQL) and adapters/postgresql/
  // adapter.test.ts (PG).

  it("#exec_query queries with no result set return an empty ActiveRecord::Result", async () => {
    const result = await Base.connection.execQuery("INSERT INTO subscribers(nick) VALUES('me')");
    expect(result).toBeInstanceOf(Result);
    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual([]);
  });

  it("#exec_query queries with an empty result set still return the columns", async () => {
    const result = await Base.connection.execQuery("SELECT * FROM subscribers WHERE 1=0");
    expect(result).toBeInstanceOf(Result);
    expect(result.rows).toEqual([]);
    expect(result.columns.length).toBeGreaterThan(0);
  });

  // charset / collation / show-variable / cross-database-selects (MySQL-only)
  // live in the describeIfMysql AdapterTest block below.

  it("disable prepared statements", async () => {
    // Rails asserts `prepared_statements?` flips false once the global
    // `ActiveRecord.disable_prepared_statements` toggle is set. Rails gates this
    // `unless in_memory_db?`; our default DB is sqlite `:memory:`, so we hit the
    // same setter chokepoint by constructing adapters on each side of the toggle.
    const original = disablePreparedStatements;
    try {
      const enabled = new BetterSQLite3Adapter(":memory:", { preparedStatements: true });
      expect(enabled.preparedStatements).toBe(true);
      await enabled.close();

      setDisablePreparedStatements(true);
      const disabled = new BetterSQLite3Adapter(":memory:", { preparedStatements: true });
      expect(disabled.preparedStatements).toBe(false);
      await disabled.close();
    } finally {
      setDisablePreparedStatements(original);
    }
  });

  it("table alias", () => {
    // Rails redefines `table_alias_length` on the connection's singleton class
    // to return 10; TS has no per-instance method override, so a subclass that
    // overrides the (mixed-in) `tableAliasLength` reproduces the same effect.
    class TableAliasAdapter extends AbstractAdapter {
      tableAliasLength(): number {
        return 10;
      }
    }
    const conn = new TableAliasAdapter();
    expect(conn.tableAliasFor("posts")).toBe("posts");
    expect(conn.tableAliasFor("posts_comments")).toBe("posts_comm");
    expect(conn.tableAliasFor("dbo.posts")).toBe("dbo_posts");
  });

  it("uniqueness violations are translated to specific exception", async () => {
    const conn = Base.connection;
    await conn.executeMutation("INSERT INTO subscribers(nick) VALUES('me')");
    const error = await conn
      .executeMutation("INSERT INTO subscribers(nick) VALUES('me')")
      .catch((e) => e);
    expect(error).toBeInstanceOf(RecordNotUnique);
    expect(error.cause).toBeTruthy();
  });

  it("not null violations are translated to specific exception", async () => {
    const error = await Post.create().catch((e) => e);
    expect(error).toBeInstanceOf(NotNullViolation);
    expect(error.cause).toBeTruthy();
  });

  it.skipIf(adapterType === "sqlite")(
    "value limit violations are translated to specific exception",
    async () => {
      const error = await Event.create({ title: "abcdefgh" }).catch((e) => e);
      expect(error).toBeInstanceOf(ValueTooLong);
      expect(error.cause).toBeTruthy();
    },
  );

  it.skipIf(adapterType === "sqlite")(
    "numeric value out of ranges are translated to specific exception",
    async () => {
      const error = (await Base.connection
        .insert("INSERT INTO books(author_id) VALUES (9223372036854775808)")
        .catch((e) => e)) as { cause?: unknown };
      expect(error).toBeInstanceOf(RangeError);
      expect(error.cause).toBeTruthy();
    },
  );

  it.skip("exceptions from notifications are not translated", () => {
    // BLOCKED: notifications. activesupport Notifications._notify swallows subscriber
    // errors on the instrument()/instrumentAsync() path (only publish() with
    // propagate=true re-raises), so a subscriber raising inside sql.active_record never
    // bubbles to the caller. Needs Notifications to re-raise from instrumented blocks.
  });

  it("database related exceptions are translated to statement invalid", async () => {
    const error = await Base.connection.execute("This is a syntax error").catch((e) => e);
    expect(error).toBeInstanceOf(StatementInvalid);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("select all always return activerecord result", async () => {
    const result = await Base.connection.selectAll("SELECT * FROM posts");
    expect(result).toBeInstanceOf(Result);
  });

  // Rails gates these `if prepared_statements`; every adapter in our matrix
  // (sqlite/mysql/postgres) defaults it on, so the gate is always satisfied.
  it("select all insert update delete with casted binds", async () => {
    const binds = [Event.typeForAttribute("id").serialize(1)];
    await roundTripBinds(Base.connection, binds);
  });

  it("select all insert update delete with binds", async () => {
    const binds = [new QueryAttribute("id", 1, Event.typeForAttribute("id"))];
    await roundTripBinds(Base.connection, binds);
  });

  it("select methods passing a association relation", async () => {
    const conn = Base.connection;
    const author = await Author.create({ name: "john" });
    await Post.create({ author, title: "foo", body: "bar" });
    const query = (author as any).posts.where({ title: "foo" }).select("title");
    const sql = query.toSql();
    expect(await conn.selectOne(sql)).toEqual({ title: "foo" });
    expect(await conn.selectAll(sql)).toBeInstanceOf(Result);
    expect(await conn.selectValue(sql)).toBe("foo");
    expect(await conn.selectValues(sql)).toEqual(["foo"]);
  });

  it("select methods passing a relation", async () => {
    const conn = Base.connection;
    await Post.create({ title: "foo", body: "bar" });
    const query = Post.where({ title: "foo" }).select("title");
    const sql = query.toSql();
    expect(await conn.selectOne(sql)).toEqual({ title: "foo" });
    expect(await conn.selectAll(sql)).toBeInstanceOf(Result);
    expect(await conn.selectValue(sql)).toBe("foo");
    expect(await conn.selectValues(sql)).toEqual(["foo"]);
  });

  it("type_to_sql returns a String for unmapped types", () => {
    expect(new SchemaCreation("sqlite").typeToSql("special_db_type" as any)).toBe(
      "special_db_type",
    );
  });

  it("inspect does not show secrets", () => {
    const output = Base.connection.inspect();
    // Rails: `/...::FooAdapter:0x[\da-f]+ env_name="\w+" role=:writing>/`. trails
    // has no Ruby namespace and renders role as a quoted string, not a :symbol.
    expect(output).toMatch(/\w*Adapter:0x[\da-f]+ env_name="\w+" role="writing">/);
  });
});

// Rails declares `fixtures :fk_test_has_pk` and a real `foreign_key` on
// fk_test_has_fk. defineSchema can't express FK constraints (see test-schema.ts
// header), so we add it via raw DDL once per worker and tear it down after,
// then drive the tables directly (Rails sets `use_transactional_tests = false`).
describe("AdapterForeignKeyTest", () => {
  setupFixtures();

  const addFkSql = (): string =>
    "ALTER TABLE fk_test_has_fk ADD CONSTRAINT fk_name " +
    "FOREIGN KEY (fk_id) REFERENCES fk_test_has_pk (pk_id)";
  const dropFkSql = (): string =>
    adapterType === "mysql"
      ? "ALTER TABLE fk_test_has_fk DROP FOREIGN KEY fk_name"
      : "ALTER TABLE fk_test_has_fk DROP CONSTRAINT IF EXISTS fk_name";

  const cleanup = async (): Promise<void> => {
    await Base.connection.executeMutation("DELETE FROM fk_test_has_fk");
    await Base.connection.executeMutation("DELETE FROM fk_test_has_pk");
  };

  beforeAll(async () => {
    if (adapterType === "sqlite") {
      // SQLite can't `ALTER TABLE … ADD CONSTRAINT`, so create the FK inline
      // (Rails' schema.rb declares the foreign_key). SQLite enforces it because
      // the adapter sets `PRAGMA foreign_keys=ON` by default.
      await Base.connection.executeMutation("DROP TABLE IF EXISTS fk_test_has_fk");
      await Base.connection.executeMutation("DROP TABLE IF EXISTS fk_test_has_pk");
      await Base.connection.executeMutation(
        "CREATE TABLE fk_test_has_pk (pk_id INTEGER NOT NULL PRIMARY KEY)",
      );
      await Base.connection.executeMutation(
        "CREATE TABLE fk_test_has_fk (id INTEGER PRIMARY KEY AUTOINCREMENT, " +
          "fk_id INTEGER NOT NULL, FOREIGN KEY (fk_id) REFERENCES fk_test_has_pk (pk_id))",
      );
      return;
    }
    // These tables aren't fixture-backed here; create them (mirrors schema.rb)
    // then add the FK constraint defineSchema can't express.
    await defineSchema({
      fk_test_has_pk: canonicalSchema.fk_test_has_pk,
      fk_test_has_fk: canonicalSchema.fk_test_has_fk,
    });
    await Base.connection.execute(dropFkSql()).catch(() => {});
    await Base.connection.execute(addFkSql());
  });
  afterAll(async () => {
    if (adapterType === "sqlite") {
      await Base.connection.executeMutation("DROP TABLE IF EXISTS fk_test_has_fk");
      await Base.connection.executeMutation("DROP TABLE IF EXISTS fk_test_has_pk");
      return;
    }
    await Base.connection.execute(dropFkSql()).catch(() => {});
  });
  beforeEach(cleanup);
  afterEach(cleanup);

  // Rails' sqlite test connection always runs with `PRAGMA foreign_keys = ON`.
  // The shared worker connection's pragma can drift OFF after a sibling
  // describe's non-transactional fixture reloads (disableReferentialIntegrity
  // toggles it around the load), so re-assert it here before the FK-violation
  // probes — otherwise the INSERTs silently succeed and no error is raised.
  beforeEach(async () => {
    if (adapterType === "sqlite") {
      await Base.connection.executeMutation("PRAGMA foreign_keys = ON");
    }
  });

  const insertIntoFkTestHasFk = (fkId = 0): Promise<unknown> =>
    Base.connection.insert(`INSERT INTO fk_test_has_fk (fk_id) VALUES (${fkId})`);

  it("foreign key violations are translated to specific exception with validate false", async () => {
    class KlassHasFk extends Base {
      static {
        this.tableName = "fk_test_has_fk";
        // Declare fk_id so the constructor assignment is a known name under
        // strict writeFromUser (the raw-created FK table is not schema-warmed);
        // otherwise the value is dropped and the INSERT hits NOT NULL before FK.
        this.attribute("fk_id", "integer");
      }
    }
    const hasFk = new KlassHasFk({ fk_id: 1231231231 });
    const error = await hasFk.save({ validate: false }).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidForeignKey);
    expect(error.cause).toBeTruthy();
  });

  it("foreign key violations on insert are translated to specific exception", async () => {
    const error = (await insertIntoFkTestHasFk().catch((e) => e)) as { cause?: unknown };
    expect(error).toBeInstanceOf(InvalidForeignKey);
    expect(error.cause).toBeTruthy();
  });

  it("foreign key violations on delete are translated to specific exception", async () => {
    await Base.connection.executeMutation("INSERT INTO fk_test_has_pk (pk_id) VALUES (1)");
    await insertIntoFkTestHasFk(1);
    const error = await Base.connection
      .executeMutation("DELETE FROM fk_test_has_pk WHERE pk_id = 1")
      .catch((e) => e);
    expect(error).toBeInstanceOf(InvalidForeignKey);
    expect(error.cause).toBeTruthy();
  });

  it("disable referential integrity", async () => {
    const conn = Base.connection;
    // assert_nothing_raised: a throw inside the block fails the test.
    await conn.disableReferentialIntegrity(async () => {
      await insertIntoFkTestHasFk();
      // delete created record as otherwise disableReferentialIntegrity will
      // try to enable constraints after the block and fail.
      await conn.executeMutation("DELETE FROM fk_test_has_fk");
    });
  });
});

describe("AdapterTestWithoutTransaction", () => {
  registerModel("Author", Author);
  registerModel("Post", Post);
  registerModel("AuthorAddress", AuthorAddress);
  registerModel("Movie", Movie);
  registerModel("Subscriber", Subscriber);

  // Rails: `self.use_transactional_tests = false`. truncate commits (and on
  // MySQL implicitly commits as DDL), so these run un-wrapped; useFixtures
  // re-seeds each table in its beforeEach, standing in for `reset_fixtures`.
  const withoutTransaction = [
    "create with query cache",
    "truncate",
    "truncate with query cache",
    "truncate tables",
    "truncate tables with query cache",
    "reset empty table with custom pk",
    "reset table with non integer pk",
  ];
  const { posts } = fixtures(["posts", "authors", "authorAddresses", "movies", "subscribers"], {
    schema: canonicalSchema,
    usesTransaction: withoutTransaction,
  });

  it("create with query cache", async () => {
    const conn = Base.connection;
    conn.enableQueryCacheBang();
    try {
      // posts fixtures are loaded (e.g. "welcome"), so the count is fixture-backed.
      expect(posts("welcome").id).toBeGreaterThan(0);
      const count = (await Post.count()) as number;

      await conn.create("INSERT INTO posts(title, body) VALUES ('', '')");

      expect(await Post.count()).toBe(count + 1);
    } finally {
      conn.disableQueryCacheBang();
    }
  });

  it("truncate", async () => {
    const conn = Base.connection;
    expect(await Post.count()).toBeGreaterThan(0);

    await conn.truncate("posts");

    expect(await Post.count()).toBe(0);
  });

  it("truncate with query cache", async () => {
    const conn = Base.connection;
    conn.enableQueryCacheBang();
    try {
      expect(await Post.count()).toBeGreaterThan(0);

      await conn.truncate("posts");

      expect(await Post.count()).toBe(0);
    } finally {
      conn.disableQueryCacheBang();
    }
  });

  it("truncate tables", async () => {
    const conn = Base.connection;
    expect(await Post.count()).toBeGreaterThan(0);
    expect(await Author.count()).toBeGreaterThan(0);
    expect(await AuthorAddress.count()).toBeGreaterThan(0);

    await conn.truncateTables("author_addresses", "authors", "posts");

    expect(await Post.count()).toBe(0);
    expect(await Author.count()).toBe(0);
    expect(await AuthorAddress.count()).toBe(0);
  });

  it("truncate tables with query cache", async () => {
    const conn = Base.connection;
    conn.enableQueryCacheBang();
    try {
      expect(await Post.count()).toBeGreaterThan(0);
      expect(await Author.count()).toBeGreaterThan(0);
      expect(await AuthorAddress.count()).toBeGreaterThan(0);

      await conn.truncateTables("author_addresses", "authors", "posts");

      expect(await Post.count()).toBe(0);
      expect(await Author.count()).toBe(0);
      expect(await AuthorAddress.count()).toBe(0);
    } finally {
      conn.disableQueryCacheBang();
    }
  });

  // Rails gates these on `respond_to?(:reset_pk_sequence!)` — a method-presence
  // capability guard, not an adapter-fidelity gate (Rails runs the suite
  // unconditionally). PostgreSQL is the only adapter that defines
  // `resetPkSequenceBang` (exactly mirroring Rails, where only the PG adapter
  // defines `reset_pk_sequence!`), so this capability flag is the faithful gate.
  const respondsToResetPkSequence = adapterType === "postgres";
  it.skipIf(!respondsToResetPkSequence)("reset empty table with custom pk", async () => {
    const conn = Base.connection as DatabaseAdapter & {
      resetPkSequenceBang(table: string): Promise<void>;
    };
    await Movie.deleteAll();
    await conn.resetPkSequenceBang("movies");
    const movie = await Movie.create({ name: "fight club" });
    expect(Number(movie.id)).toBe(1);
  });

  it.skipIf(!respondsToResetPkSequence)("reset table with non integer pk", async () => {
    const conn = Base.connection as DatabaseAdapter & {
      resetPkSequenceBang(table: string): Promise<void>;
    };
    await Subscriber.deleteAll();
    await conn.resetPkSequenceBang("subscribers");
    const sub = new Subscriber({ name: "robert drake" });
    sub.id = "bob drake";
    // Rails: assert_nothing_raised { sub.save! }
    await sub.saveBang();
    const found = await Subscriber.find("bob drake");
    expect(found.id).toBe("bob drake");
  });
});

// Faithful port of Rails' AdapterConnectionTest (adapter_test.rb), gated
// `unless in_memory_db?`. These are integration tests against the real leased
// `Base.connection` (Rails' `@connection = ...lease_connection`) and ride the
// canonical schema + official Post/Author/AuthorAddress models and fixtures.
// The `remote_disconnect` / `kill_connection_from_server` helpers only work on
// MySQL/PostgreSQL (Rails `skip`s on SQLite), so the cases that depend on them
// stay gated on a non-SQLite adapter.
describe.skipIf(inMemoryDb())("AdapterConnectionTest", () => {
  registerModel("Post", Post);
  registerModel("Author", Author);
  registerModel("AuthorAddress", AuthorAddress);

  // Rails: `self.use_transactional_tests = false`; the disconnect/reconnect
  // lifecycle would be meaningless wrapped in a per-test transaction, so every
  // case runs un-wrapped and fixtures re-seed each table in their beforeEach.
  const nonTransactional = [
    "reconnect after a disconnect",
    "materialized transaction state is reset after a reconnect",
    "materialized transaction state can be restored after a reconnect",
    "materialized transaction state is reset after a disconnect",
    "unmaterialized transaction state is reset after a reconnect",
    "unmaterialized transaction state can be restored after a reconnect",
    "unmaterialized transaction state is reset after a disconnect",
    "active? detects remote disconnection",
    "verify! restores after remote disconnection",
    "reconnect! restores after remote disconnection",
    "querying a 'clean' long-failed connection restores and succeeds",
    "querying a 'clean' recently-used but now-failed connection skips verification",
    "quoting a string on a 'clean' failed connection will not prevent reconnecting",
    "querying after a failed non-retryable query restores and succeeds",
    "idempotent SELECT queries are retried and result in a reconnect",
    "#find and #find_by queries with known attributes are retried and result in a reconnect",
    "queries containing SQL fragments are not retried",
    "queries containing SQL functions are not retried",
    "transaction restores after remote disconnection",
    "active transaction is restored after remote disconnection",
    "dirty transaction cannot be restored after remote disconnection",
    "can reconnect and retry queries under limit when retry deadline is set",
    "does not reconnect and retry queries when retries are disabled",
    "does not reconnect and retry queries that exceed retry deadline",
    "#execute is retryable",
    "disconnect and recover on #configure_connection failure",
  ];
  fixtures(["posts", "authors", "authorAddresses"], {
    schema: canonicalSchema,
    usesTransaction: nonTransactional,
  });

  // remote_disconnect / kill_connection_from_server are MySQL/PG-only.
  const remoteSupported = adapterType !== "sqlite";

  // Cases blocked on genuine trails PG/MySQL adapter divergences that the faithful
  // port surfaced (checked in verbatim; un-skip once the adapters converge):
  //   - Connection-failure error classification + retryability
  //     (RFC 0023 story adapter-connection-failure-error-classification): trails
  //     maps a severed PG connection to ConnectionNotEstablished, not Rails'
  //     ConnectionFailed (node-pg has no libpq layer to reproduce Rails' split —
  //     postgresql-adapter.ts:4060-4072), which also makes it non-retryable; the
  //     mysql2 driver's "Can't add new command when connection is in closed
  //     state" is not translated to an ActiveRecord error at all.
  //   - No-bind unprepared SELECT does not materialize a pending lazy
  //     transaction on PG/MySQL (story thread-collector-preparable-for-
  //     statement-cache; see transactions.test.ts "unprepared statement
  //     materializes transaction"): "transaction restores after remote
  //     disconnection" relies on `Post.count` — a no-bind unprepared read —
  //     materializing (and thus retryably re-issuing BEGIN) to reconnect,
  //     exactly as Rails' with_raw_connection does for every query. trails
  //     skips materialize for such reads, so no BEGIN is issued, the read runs
  //     on the severed connection, and it is not retried. Un-skip once that
  //     read-materialization path converges.
  const itBlocked = it.skip;

  let connection: DatabaseAdapter;

  beforeEach(() => {
    connection = Base.connection;
    expect(connection.active).toBe(true);
  });

  afterEach(async () => {
    await connection.reconnectBang();
    expect(connection.active).toBe(true);
    expect(connection.isTransactionOpen()).toBe(false);
    expect(await rawTransactionOpen(connection)).toBe(false);
  });

  // Mirrors Rails' `@connection.stub(:retry_deadline, value) { ... }` — stub the
  // getter (not the backing `_config` field) to match the Rails idiom and the
  // project's vi.spyOn mocking convention.
  async function withRetryDeadline(value: number, body: () => Promise<void>): Promise<void> {
    vi.spyOn(connection, "retryDeadline", "get").mockReturnValue(value);
    try {
      await body();
    } finally {
      vi.restoreAllMocks();
    }
  }

  it("reconnect after a disconnect", async () => {
    connection.disconnectBang();
    expect(await activePredicate(connection)).toBe(false);
    await connection.reconnectBang();
    expect(connection.active).toBe(true);
  });

  it("materialized transaction state is reset after a reconnect", async () => {
    await connection.transactionManager.beginTransaction();
    expect(connection.isTransactionOpen()).toBe(true);
    await connection.materializeTransactions();
    expect(await rawTransactionOpen(connection)).toBe(true);
    await connection.reconnectBang();
    expect(connection.isTransactionOpen()).toBe(false);
    expect(await rawTransactionOpen(connection)).toBe(false);
  });

  it("materialized transaction state can be restored after a reconnect", async () => {
    await connection.transactionManager.beginTransaction();
    expect(connection.isTransactionOpen()).toBe(true);
    await connection.materializeTransactions();
    expect(await rawTransactionOpen(connection)).toBe(true);
    await connection.reconnectBang({ restoreTransactions: true });
    expect(connection.isTransactionOpen()).toBe(true);
    expect(await rawTransactionOpen(connection)).toBe(true);
  });

  it("materialized transaction state is reset after a disconnect", async () => {
    await connection.transactionManager.beginTransaction();
    expect(connection.isTransactionOpen()).toBe(true);
    await connection.materializeTransactions();
    expect(await rawTransactionOpen(connection)).toBe(true);
    connection.disconnectBang();
    expect(connection.isTransactionOpen()).toBe(false);
  });

  it("unmaterialized transaction state is reset after a reconnect", async () => {
    await connection.transactionManager.beginTransaction();
    expect(connection.isTransactionOpen()).toBe(true);
    expect(await rawTransactionOpen(connection)).toBe(false);
    await connection.reconnectBang();
    expect(connection.isTransactionOpen()).toBe(false);
    expect(await rawTransactionOpen(connection)).toBe(false);
    await connection.materializeTransactions();
    expect(await rawTransactionOpen(connection)).toBe(false);
  });

  it("unmaterialized transaction state can be restored after a reconnect", async () => {
    await connection.transactionManager.beginTransaction();
    expect(connection.isTransactionOpen()).toBe(true);
    expect(await rawTransactionOpen(connection)).toBe(false);
    await connection.reconnectBang({ restoreTransactions: true });
    expect(connection.isTransactionOpen()).toBe(true);
    expect(await rawTransactionOpen(connection)).toBe(false);
    await connection.materializeTransactions();
    expect(await rawTransactionOpen(connection)).toBe(true);
  });

  it("unmaterialized transaction state is reset after a disconnect", async () => {
    await connection.transactionManager.beginTransaction();
    expect(connection.isTransactionOpen()).toBe(true);
    expect(await rawTransactionOpen(connection)).toBe(false);
    connection.disconnectBang();
    expect(connection.isTransactionOpen()).toBe(false);
  });

  it.skipIf(!remoteSupported)("active? detects remote disconnection", async () => {
    await remoteDisconnect(connection);
    expect(await activePredicate(connection)).toBe(false);
  });

  it.skipIf(!remoteSupported)("verify! restores after remote disconnection", async () => {
    await remoteDisconnect(connection);
    await connection.verifyBang();
    expect(connection.active).toBe(true);
  });

  it.skipIf(!remoteSupported)("reconnect! restores after remote disconnection", async () => {
    await remoteDisconnect(connection);
    await connection.reconnectBang();
    expect(connection.active).toBe(true);
  });

  itBlocked("querying a 'clean' long-failed connection restores and succeeds", async () => {
    await remoteDisconnect(connection);

    connection.cleanBang(); // this simulates a fresh checkout from the pool

    // Backdate last activity to simulate a connection we haven't used in a while
    (connection as unknown as { _lastActivity: number })._lastActivity = Date.now() - 5 * 60 * 1000;

    // Clean did not verify / fix the connection
    expect(await activePredicate(connection)).toBe(false);

    // Because the connection hasn't been verified since checkout, and the
    // query cannot safely be retried, the connection is verified before
    // querying.
    await Post.deleteAll();

    expect(connection.active).toBe(true);
  });

  itBlocked(
    "querying a 'clean' recently-used but now-failed connection skips verification",
    async () => {
      await remoteDisconnect(connection);

      connection.cleanBang(); // this simulates a fresh checkout from the pool

      // Clean did not verify / fix the connection
      expect(await activePredicate(connection)).toBe(false);

      // Because the query cannot be retried, and we (mistakenly) believe the
      // connection is still good, the query fails — the alternative would be
      // excessive reverification.
      await expect(Post.deleteAll()).rejects.toBeInstanceOf(AdapterError);
    },
  );

  itBlocked(
    "quoting a string on a 'clean' failed connection will not prevent reconnecting",
    async () => {
      await remoteDisconnect(connection);

      connection.cleanBang(); // this simulates a fresh checkout from the pool

      (connection as unknown as { _lastActivity: number })._lastActivity =
        Date.now() - 5 * 60 * 1000;

      expect(await activePredicate(connection)).toBe(false);

      // Quote string will not verify a broken connection.
      connection.quoteString("");

      await Post.deleteAll();

      expect(connection.active).toBe(true);
    },
  );

  itBlocked("querying after a failed non-retryable query restores and succeeds", async () => {
    await Post.first(); // Connection verified (and prepared statement pool populated)

    await remoteDisconnect(connection);

    await expect(
      connection.execute("INSERT INTO posts(title, body) VALUES ('foo', 'bar')"),
    ).rejects.toBeInstanceOf(ConnectionFailed);

    expect(await Post.first()).toBeTruthy(); // Verifying causes a reconnect and the query succeeds
    expect(connection.active).toBe(true);
  });

  itBlocked("idempotent SELECT queries are retried and result in a reconnect", async () => {
    await Post.first();

    await remoteDisconnect(connection);

    expect(await Post.first()).toBeTruthy();
    expect(connection.active).toBe(true);

    await remoteDisconnect(connection);

    expect(await Post.where({ id: [1, 2] }).first()).toBeTruthy();
    expect(connection.active).toBe(true);
  });

  itBlocked(
    "#find and #find_by queries with known attributes are retried and result in a reconnect",
    async () => {
      await Post.first();

      await remoteDisconnect(connection);

      expect(await Post.find(1)).toBeTruthy();
      expect(connection.active).toBe(true);

      await remoteDisconnect(connection);

      expect(await Post.findBy({ title: "Welcome to the weblog" })).toBeTruthy();
      expect(connection.active).toBe(true);
    },
  );

  itBlocked("queries containing SQL fragments are not retried", async () => {
    await Post.first();

    await remoteDisconnect(connection);

    await expect(Post.where("1 = 1").toArray()).rejects.toBeInstanceOf(ConnectionFailed);
    expect(await activePredicate(connection)).toBe(false);

    await remoteDisconnect(connection);

    await expect(Post.select("title AS custom_title").first()).rejects.toBeInstanceOf(
      ConnectionFailed,
    );
    expect(await activePredicate(connection)).toBe(false);

    await remoteDisconnect(connection);

    // Rails: `Post.find_by("updated_at < ?", 2.weeks.ago)` — find_by(*args) is
    // `where(*args).take`, and trails' typed findBy only accepts a conditions
    // hash, so spell the raw-SQL-fragment form as where(...).first().
    await expect(Post.where("updated_at < ?", twoWeeksAgo()).first()).rejects.toBeInstanceOf(
      ConnectionFailed,
    );
    expect(await activePredicate(connection)).toBe(false);
  });

  itBlocked("queries containing SQL functions are not retried", async () => {
    await Post.first();

    await remoteDisconnect(connection);

    const tagsCountAttr = Post.arelTable.get("tags_count");
    const absTagsCount = new Nodes.NamedFunction("ABS", [tagsCountAttr]);

    // Rails: `Post.where(abs_tags_count.eq(2))` — where accepts a raw Arel node;
    // trails' typed overloads only model the Hash and (string, ...binds) forms.
    await expect(
      (Post.where as (node: unknown) => ReturnType<typeof Post.where>)(absTagsCount.eq(2)).first(),
    ).rejects.toBeInstanceOf(ConnectionFailed);
    expect(await activePredicate(connection)).toBe(false);
  });

  itBlocked("transaction restores after remote disconnection", async () => {
    await remoteDisconnect(connection);
    await Post.transaction(async () => {
      await Post.count();
    });
    expect(connection.active).toBe(true);
  });

  // Passes on PG; skipped on MySQL/MariaDB, where two separate tracked
  // divergences block it: (1) mysql2's `verifyBang` keys off the optimistic sync
  // `active` getter instead of an `active?`-style ping, so it does not detect the
  // server-side kill and never reconnects (unlike the PG `verifyBang` override);
  // and (2) the subsequent rollback then hits the mysql2 driver's "Can't add new
  // command when connection is in closed state", which trails does not translate
  // to an ActiveRecord error (story adapter-connection-failure-error-
  // classification). Un-skip on MySQL once those converge.
  it.skipIf(adapterType !== "postgres")(
    "active transaction is restored after remote disconnection",
    async () => {
      expect((await Post.count()) as number).toBeGreaterThan(0);
      await Post.transaction(async () => {
        await connection.materializeTransactions();
        await remoteDisconnect(connection);

        // Regular queries are not retryable, so the only abstract operation we
        // can perform here is a direct verify.
        await connection.verifyBang();

        await Post.deleteAll();

        expect(await Post.count()).toBe(0);
        throw new Rollback();
      });

      // The deletion occurred within the outer (rolled-back) transaction, not
      // directly on the freshly-reestablished connection, so the posts remain:
      expect((await Post.count()) as number).toBeGreaterThan(0);
    },
  );

  itBlocked("dirty transaction cannot be restored after remote disconnection", async () => {
    let invocations = 0;
    await expect(
      Post.transaction(async () => {
        invocations += 1;
        await Post.deleteAll();
        await remoteDisconnect(connection);
        await Post.count();
      }),
    ).rejects.toBeInstanceOf(ConnectionFailed);

    expect(invocations).toBe(1); // the whole transaction block is not retried

    // After the (outermost) transaction block failed, the connection is ready
    // to reconnect on next use, but hasn't done so yet.
    expect(await activePredicate(connection)).toBe(false);
    expect((await Post.count()) as number).toBeGreaterThan(0);
  });

  it("can reconnect and retry queries under limit when retry deadline is set", async () => {
    let attempts = 0;
    await withRetryDeadline(0.1, async () => {
      await connection.withRawConnection({ allowRetry: true }, async () => {
        if (attempts === 0) {
          attempts++;
          throw new ConnectionFailed("Something happened to the connection");
        }
      });
    });
  });

  it("does not reconnect and retry queries when retries are disabled", async () => {
    let attempts = 0;
    await expect(
      connection.withRawConnection(async () => {
        if (attempts === 0) {
          attempts++;
          throw new ConnectionFailed("Something happened to the connection");
        }
      }),
    ).rejects.toBeInstanceOf(ConnectionFailed);
  });

  it("does not reconnect and retry queries that exceed retry deadline", async () => {
    let attempts = 0;
    await withRetryDeadline(0.1, async () => {
      await expect(
        connection.withRawConnection({ allowRetry: true }, async () => {
          if (attempts === 0) {
            await sleep(200);
            attempts++;
            throw new ConnectionFailed("Something happened to the connection");
          }
        }),
      ).rejects.toBeInstanceOf(ConnectionFailed);
    });
  });

  itBlocked("#execute is retryable", async () => {
    const connectionIdSql =
      adapterType === "mysql" ? "SELECT CONNECTION_ID()" : "SELECT pg_backend_pid()";
    const connId = (await connection.execQuery(connectionIdSql)).rows[0][0];

    await killConnectionFromServer(connection, connId);

    await connection.execute("SELECT 1", [], "SQL", { allowRetry: true });
  });

  // SURFACED DEVIATION (RFC 0023, story
  // adapter-configure-connection-failure-propagation): when configure_connection
  // raises during a (re)connect, trails' abstract reconnect/verify lifecycle does
  // not surface the original ConnectionFailed — it leaves the raw handle closed
  // (attemptConfigureConnection disconnects) and the subsequent query then throws
  // `StatementInvalid: The database connection is not open`. Rails re-raises the
  // ConnectionFailed (adapter_test.rb:852). Un-skip once that propagation is fixed.
  it.skip("disconnect and recover on #configure_connection failure", async () => {
    const pool = (connection as unknown as { pool: { newConnection(): DatabaseAdapter } }).pool;
    const fresh = pool.newConnection();
    try {
      // The pool may hand back an already-connected adapter (sync drivers open
      // eagerly), which would have run configure_connection before our override
      // is installed. Disconnect so the first query reconnects and re-runs it.
      fresh.disconnectBang();
      // Rails relies on the default connection_retries (1); trails' getter
      // defaults to 1 too (abstract-adapter.ts:1581), so no explicit set needed.
      const failures: Error[] = [new ConnectionFailed("Oops"), new ConnectionFailed("Oops 2")];
      const original = fresh.configureConnection.bind(fresh);
      (
        fresh as unknown as { configureConnection: () => void | Promise<void> }
      ).configureConnection = () => {
        const error = failures.pop();
        if (error) throw error;
        return original();
      };

      await expect(fresh.execQuery("SELECT 1")).rejects.toBeInstanceOf(ConnectionFailed);

      expect((await fresh.execQuery("SELECT 1")).rows).toEqual([[1]]);
      expect(failures).toEqual([]);
    } finally {
      fresh.disconnectBang();
    }
  });
});

// Rails' `find_by("updated_at < ?", 2.weeks.ago)` raw-SQL fragment — a date two
// weeks in the past, formatted as an ISO timestamp the way the adapters bind it.
function twoWeeksAgo(): string {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

describe("AdapterThreadSafetyTest", () => {
  it.skip("#active? is synchronized", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — gvl
  });
  it.skip("#verify! is synchronized", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — gvl
  });
});

// MySQL-only: invalidateTransaction fires only when
// isSavepointErrorsInvalidateTransactions() is true (Mysql2Adapter override);
// the abstract/sqlite/pg default is false, matching Rails
// savepoint_errors_invalidate_transactions?.
describe("InvalidateTransactionTest", () => {
  setupFixtures();

  // Rails wraps this in `if connection.savepoint_errors_invalidate_transactions?`
  // — a capability guard (true only on MySQL), not an adapter-fidelity gate
  // (Rails runs the file unconditionally). MySQL is the only adapter whose
  // `isSavepointErrorsInvalidateTransactions()` returns true, mirroring Rails.
  const savepointErrorsInvalidateTransactions = adapterType === "mysql";
  it.skipIf(!savepointErrorsInvalidateTransactions)(
    "invalidates transaction on rollback error",
    async () => {
      let invalidated = false;
      const connection = Base.connection;

      await connection.transaction(async () => {
        try {
          await connection.withRawConnection(async () => {
            throw new Deadlocked("made-up deadlock");
          });
        } catch (error) {
          if (!(error instanceof Deadlocked) || error.message !== "made-up deadlock") {
            throw new Error("Rescuing wrong error", { cause: error });
          }
          invalidated = (
            connection.currentTransaction() as { isInvalidated(): boolean }
          ).isInvalidated();
        }
      });

      // asserting outside of the transaction to make sure we actually reach the
      // end of the test and perform the assertion
      expect(invalidated).toBe(true);
    },
  );
});

// MySQL-gated AdapterTest probes from Rails adapter_test.rb: the
// `current_database` case plus the cases wrapped in
// `if current_adapter?(:Mysql2Adapter)` (charset/collation/show-variable/
// cross-database-selects). SQLite/PG skip these via the current_adapter? gate;
// here the whole block is gated behind `describeIfMysql`, which is
// `describe.skip` when MYSQL_TEST_URL is absent.
describeIfMysql("AdapterTest", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  it("current database", async () => {
    expect(await adapter.currentDatabase()).toBe(databaseName(MYSQL_TEST_URL));
  });

  it("charset", async () => {
    // Rails' assert_not_nil; charset() collapses null → "" (the ?? "" fallback),
    // so the not-nil intent maps to non-empty here.
    expect(await adapter.charset()).not.toBe("");
    expect(await adapter.charset()).not.toBe("character_set_database");
    expect(await adapter.charset()).toBe(await adapter.showVariable("character_set_database"));
  });

  it("collation", async () => {
    expect(await adapter.collation()).not.toBe("");
    expect(await adapter.collation()).not.toBe("collation_database");
    expect(await adapter.collation()).toBe(await adapter.showVariable("collation_database"));
  });

  it("show nonexistent variable returns nil", async () => {
    expect(await adapter.showVariable("foo_bar_baz")).toBeNull();
  });

  it("not specifying database name for cross database selects", async () => {
    // Rails reads `arunit`/`arunit2` from `ARTest.test_configuration_hashes`
    // and selects `arunit.pirates` joined with `arunit2.courses`. We mirror
    // that two-database layout with the config-derived `ARUNIT_DATABASE` /
    // `ARUNIT2_DATABASE` names (see test-helper), seeding `pirates` in the
    // first and `courses` in the second using their canonical columns.
    await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT_DATABASE}`);
    await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT2_DATABASE}`);
    await adapter.execute(`CREATE DATABASE ${ARUNIT_DATABASE}`);
    await adapter.execute(`CREATE DATABASE ${ARUNIT2_DATABASE}`);
    await adapter.execute(
      `CREATE TABLE ${ARUNIT_DATABASE}.pirates (id INT AUTO_INCREMENT PRIMARY KEY, catchphrase VARCHAR(255), parrot_id INT, non_validated_parrot_id INT, created_on DATETIME, updated_on DATETIME)`,
    );
    await adapter.execute(
      `CREATE TABLE ${ARUNIT2_DATABASE}.courses (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, college_id INT)`,
    );

    // Mirrors Rails establishing a connection with the `:database` key removed:
    // a cross-database select must succeed without a default database set.
    const noDbUrl = new URL(MYSQL_TEST_URL);
    noDbUrl.pathname = "/";
    const noDbAdapter = new Mysql2Adapter(noDbUrl.toString());
    try {
      // assert_nothing_raised: the select resolves without throwing.
      await noDbAdapter.execute(
        `SELECT ${ARUNIT_DATABASE}.pirates.*, ${ARUNIT2_DATABASE}.courses.* ` +
          `FROM ${ARUNIT_DATABASE}.pirates, ${ARUNIT2_DATABASE}.courses`,
      );
    } finally {
      await noDbAdapter.close();
      await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT_DATABASE}`);
      await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT2_DATABASE}`);
    }
  });
});

describe("AdvisoryLocksEnabledTest", () => {
  // Literal port of Rails' AdvisoryLocksEnabledTest (adapter_test.rb): lease
  // the *global* connection and probe `advisory_locks_enabled?`, then toggle
  // the `:advisory_locks` config via establish_connection inside
  // `run_without_connection` so the worker's pool is restored afterward.
  // `supports_advisory_locks?` is true on PostgreSQL + MySQL, so the gate is
  // feature-only.
  beforeAll(async () => {
    await establishFromTestConfig();
  });

  itIfSupports("advisory_locks", "advisory locks enabled?", async () => {
    expect(Base.leaseConnection().isAdvisoryLocksEnabled()).toBe(true);

    await runWithoutConnection(async (origConnection) => {
      await Base.establishConnection({ ...origConnection, advisoryLocks: false });
      expect(Base.leaseConnection().isAdvisoryLocksEnabled()).toBe(false);

      await Base.establishConnection({ ...origConnection, advisoryLocks: true });
      expect(Base.leaseConnection().isAdvisoryLocksEnabled()).toBe(true);
    });
  });
});
