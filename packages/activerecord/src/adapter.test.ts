import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { Notifications } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { Process } from "@blazetrails/ruby-compat";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { AdapterError, ConnectionFailed } from "./errors.js";
import {
  ActiveRecord,
  Base,
  NotNullViolation,
  RecordNotUnique,
  StatementInvalid,
  Deadlocked,
  InvalidForeignKey,
  RangeError,
  ValueTooLong,
  Rollback,
} from "./index.js";
import { Result } from "./result.js";
import { fixtures } from "./test-fixtures.js";
import { adapterType } from "./test-adapter.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { itIfSupports } from "./support/supports.js";
import { runWithoutConnection } from "./support/connection-helper.js";
import "./support/canonical-model-index.js";
import { Book } from "./test-helpers/models/book.js";
import { Post } from "./test-helpers/models/post.js";
import { Author, AuthorAddress } from "./test-helpers/models/author.js";
import { Movie } from "./test-helpers/models/movie.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { Event } from "./test-helpers/models/event.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { Mysql2Adapter } from "./connection-adapters/mysql2-adapter.js";
import {
  leaseMysqlAdapter,
  ARUNIT_DATABASE,
  ARUNIT2_DATABASE,
} from "./adapters/abstract-mysql-adapter/test-helper.js";

async function roundTripBinds(conn: DatabaseAdapter, binds: unknown[]): Promise<void> {
  const qm = new Nodes.BindParam(null).toSql({ connection: conn });
  const id = await conn.insert(
    `INSERT INTO events(id) VALUES (${qm})`,
    null,
    null,
    null,
    null,
    binds,
  );
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

async function rawTransactionOpen(conn: DatabaseAdapter): Promise<boolean> {
  if (adapterType === "postgres") {
    return Boolean((conn as unknown as { _inTransaction?: boolean })._inTransaction);
  }
  if (adapterType === "mysql") {
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
  const sqlite = conn as unknown as { exec(sql: string): Promise<void> };
  try {
    await sqlite.exec("BEGIN");
  } catch {
    return true;
  }
  try {
    await sqlite.exec("ROLLBACK");
  } catch {}
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function remoteDisconnect(conn: DatabaseAdapter): Promise<void> {
  if (adapterType === "postgres") {
    if (!(await activePredicate(conn))) {
      await conn.verifyBang();
    }
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
          binds?: unknown[],
          opts?: { materializeTransactions?: boolean },
        ): Promise<unknown>;
      }
    ).internalExecute("set @@wait_timeout=1", "SQL", [], { materializeTransactions: false });
    await sleep(1200);
  }
}

async function killConnectionFromServer(
  conn: DatabaseAdapter,
  connectionId: unknown,
): Promise<void> {
  const pool = (
    conn as unknown as { pool: { checkout(): DatabaseAdapter; checkin(c: DatabaseAdapter): void } }
  ).pool;
  const killer = await pool.checkout();
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
  return conn.active();
}

describe("AdapterTest", () => {
  fixtures(["accounts", "authors", "tasks", "topics", "subscribers", "posts", "books"], {
    usesTransaction: [
      "value limit violations are translated to specific exception",
      "numeric value out of ranges are translated to specific exception",
      "uniqueness violations are translated to specific exception",
      "not null violations are translated to specific exception",
      "database related exceptions are translated to statement invalid",
      "indexes",
      "remove index when name and wrong column name specified",
      "remove index when name and wrong column name specified positional argument",
      "disable prepared statements",
    ],
  });

  it.skipIf(adapterType === "postgres")("update prepared statement", async () => {
    const b = await Book.create({ name: "my \x00 book" });
    await b.reload();
    expect(b.name).toBe("my \x00 book");

    await b.update({ name: "my other \x00 book" });
    await b.reload();
    expect(b.name).toBe("my other \x00 book");
  });

  it("create record with pk as zero", async () => {
    await Book.create({ id: 0 });
    expect((await Book.find(0)).id).toBe(0);
    await Book.destroy(0);
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
    expect(await conn.tableExists("accounts")).toBe(true);
    expect(await conn.tableExists("nonexistingtable")).toBe(false);
    expect(await conn.tableExists("'")).toBe(false);
    expect(await conn.tableExists(null as unknown as string)).toBeFalsy();
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
    expect(await conn.dataSourceExists("accounts")).toBe(true);
    expect(await conn.dataSourceExists("nonexistingtable")).toBe(false);
    expect(await conn.dataSourceExists("'")).toBe(false);
    expect(await conn.dataSourceExists(null as unknown as string)).toBeFalsy();
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

  it.skipIf(inMemoryDb())("disable prepared statements", async () => {
    const original = ActiveRecord.disablePreparedStatements;
    try {
      await runWithoutConnection(async (origConnection) => {
        await Base.establishConnection({ ...origConnection, preparedStatements: true });
        expect((await Base.leaseConnection()).preparedStatements).toBe(true);

        ActiveRecord.disablePreparedStatements = true;
        await Base.establishConnection({ ...origConnection, preparedStatements: true });
        expect((await Base.leaseConnection()).preparedStatements).toBe(false);
      });
    } finally {
      ActiveRecord.disablePreparedStatements = original;
    }
  });

  it("table alias", () => {
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

  it("exceptions from notifications are not translated", async () => {
    const originalError = new Error("This StandardError shouldn't get translated");
    const subscriber = Notifications.subscribe("sql.active_record", () => {
      throw originalError;
    });
    try {
      const actualError = await Base.connection.execute("SELECT * FROM posts").catch((e) => e);
      expect(actualError).toBe(originalError);
    } finally {
      Notifications.unsubscribe(subscriber);
    }
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

  it("select all insert update delete with casted binds", async () => {
    const binds = [Event.typeForAttribute("id")!.serialize(1)];
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

  it("type_to_sql returns a String for unmapped types", async () => {
    const conn = await Base.leaseConnection();
    expect((conn as never as { typeToSql(t: string): string }).typeToSql("special_db_type")).toBe(
      "special_db_type",
    );
  });

  it("inspect does not show secrets", () => {
    const output = Base.connection.inspect();
    expect(output).toMatch(/\w*Adapter:0x[\da-f]+ env_name="\w+" role="writing">/);
  });
});

describe("AdapterForeignKeyTest", () => {
  fixtures({}, { useTransactionalTests: false });

  const cleanup = async (): Promise<void> => {
    await Base.connection.executeMutation("DELETE FROM fk_test_has_fk");
    await Base.connection.executeMutation("DELETE FROM fk_test_has_pk");
  };

  beforeEach(cleanup);
  afterEach(cleanup);

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
      }
    }
    const hasFk = new KlassHasFk();
    (hasFk as unknown as { fk_id: number }).fk_id = 1231231231;
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
    await conn.disableReferentialIntegrity(async () => {
      await insertIntoFkTestHasFk();
      await conn.executeMutation("DELETE FROM fk_test_has_fk");
    });
  });
});

describe("AdapterTestWithoutTransaction", () => {
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
    usesTransaction: withoutTransaction,
  });

  it("create with query cache", async () => {
    const conn = Base.connection;
    conn.enableQueryCacheBang();
    try {
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
    await sub.saveBang();
    const found = await Subscriber.find("bob drake");
    expect(found.id).toBe("bob drake");
  });
});

describe.skipIf(inMemoryDb())("AdapterConnectionTest", () => {
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
    usesTransaction: nonTransactional,
  });

  const remoteSupported = adapterType !== "sqlite";

  const itBlocked = it.skip;

  let connection: DatabaseAdapter;

  beforeEach(async () => {
    connection = Base.connection;
    expect(await connection.active()).toBe(true);
  });

  afterEach(async () => {
    await connection.reconnectBang();
    expect(await connection.active()).toBe(true);
    expect(connection.isTransactionOpen()).toBe(false);
    expect(await rawTransactionOpen(connection)).toBe(false);
  });

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
    expect(await connection.active()).toBe(true);
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
    expect(await connection.active()).toBe(true);
  });

  it.skipIf(!remoteSupported)("reconnect! restores after remote disconnection", async () => {
    await remoteDisconnect(connection);
    await connection.reconnectBang();
    expect(await connection.active()).toBe(true);
  });

  it.skipIf(!remoteSupported)(
    "querying a 'clean' long-failed connection restores and succeeds",
    async () => {
      await remoteDisconnect(connection);

      connection.cleanBang();

      (connection as unknown as { _lastActivity: number })._lastActivity =
        Process.clockGettime(Process.CLOCK_MONOTONIC) - 5 * 60;

      expect(await activePredicate(connection)).toBe(false);

      await Post.deleteAll();

      expect(await connection.active()).toBe(true);
    },
  );

  it.skipIf(!remoteSupported)(
    "querying a 'clean' recently-used but now-failed connection skips verification",
    async () => {
      await remoteDisconnect(connection);

      connection.cleanBang();

      expect(await activePredicate(connection)).toBe(false);

      await expect(Post.deleteAll()).rejects.toBeInstanceOf(AdapterError);
    },
  );

  it.skipIf(!remoteSupported)(
    "quoting a string on a 'clean' failed connection will not prevent reconnecting",
    async () => {
      await remoteDisconnect(connection);

      connection.cleanBang();

      (connection as unknown as { _lastActivity: number })._lastActivity =
        Process.clockGettime(Process.CLOCK_MONOTONIC) - 5 * 60;

      expect(await activePredicate(connection)).toBe(false);

      connection.quoteString("");

      await Post.deleteAll();

      expect(await connection.active()).toBe(true);
    },
  );

  it.skipIf(!remoteSupported)(
    "querying after a failed non-retryable query restores and succeeds",
    async () => {
      await Post.first();

      await remoteDisconnect(connection);

      await expect(
        connection.execute("INSERT INTO posts(title, body) VALUES ('foo', 'bar')"),
      ).rejects.toBeInstanceOf(ConnectionFailed);

      expect(await Post.first()).toBeTruthy();
      expect(await connection.active()).toBe(true);
    },
  );

  it.skipIf(!remoteSupported)(
    "idempotent SELECT queries are retried and result in a reconnect",
    async () => {
      await Post.first();

      await remoteDisconnect(connection);

      expect(await Post.first()).toBeTruthy();
      expect(await connection.active()).toBe(true);

      await remoteDisconnect(connection);

      expect(await Post.where({ id: [1, 2] }).first()).toBeTruthy();
      expect(await connection.active()).toBe(true);
    },
  );

  it.skipIf(!remoteSupported)(
    "#find and #find_by queries with known attributes are retried and result in a reconnect",
    async () => {
      await Post.first();

      await remoteDisconnect(connection);

      expect(await Post.find(1)).toBeTruthy();
      expect(await connection.active()).toBe(true);

      await remoteDisconnect(connection);

      expect(await Post.findBy({ title: "Welcome to the weblog" })).toBeTruthy();
      expect(await connection.active()).toBe(true);
    },
  );

  it.skipIf(!remoteSupported)("queries containing SQL fragments are not retried", async () => {
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

    await expect(Post.where("updated_at < ?", twoWeeksAgo()).first()).rejects.toBeInstanceOf(
      ConnectionFailed,
    );
    expect(await activePredicate(connection)).toBe(false);
  });

  it.skipIf(!remoteSupported)("queries containing SQL functions are not retried", async () => {
    await Post.first();

    await remoteDisconnect(connection);

    const tagsCountAttr = Post.arelTable.get("tags_count");
    const absTagsCount = new Nodes.NamedFunction("ABS", [tagsCountAttr]);

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
    expect(await connection.active()).toBe(true);
  });

  it.skipIf(!remoteSupported)(
    "active transaction is restored after remote disconnection",
    async () => {
      expect((await Post.count()) as number).toBeGreaterThan(0);
      await Post.transaction(async () => {
        await connection.materializeTransactions();
        await remoteDisconnect(connection);

        await connection.verifyBang();

        await Post.deleteAll();

        expect(await Post.count()).toBe(0);
        throw new Rollback();
      });

      expect((await Post.count()) as number).toBeGreaterThan(0);
    },
  );

  it.skipIf(!remoteSupported)(
    "dirty transaction cannot be restored after remote disconnection",
    async () => {
      let invocations = 0;
      await expect(
        Post.transaction(async () => {
          invocations += 1;
          await Post.deleteAll();
          await remoteDisconnect(connection);
          await Post.count();
        }),
      ).rejects.toBeInstanceOf(ConnectionFailed);

      expect(invocations).toBe(1);

      expect(await activePredicate(connection)).toBe(false);
      expect((await Post.count()) as number).toBeGreaterThan(0);
    },
  );

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
      connection.withRawConnection({}, async () => {
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

  it.skipIf(!remoteSupported)("#execute is retryable", async () => {
    const connectionIdSql =
      adapterType === "mysql" ? "SELECT CONNECTION_ID()" : "SELECT pg_backend_pid()";
    const connId = (await connection.execQuery(connectionIdSql)).rows[0][0];

    await killConnectionFromServer(connection, connId);

    await connection.execute("SELECT 1", "SQL", { allowRetry: true });
  });

  it("disconnect and recover on #configure_connection failure", async () => {
    const pool = (connection as unknown as { pool: { newConnection(): DatabaseAdapter } }).pool;
    const fresh = pool.newConnection();
    try {
      fresh.disconnectBang();
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

function twoWeeksAgo(): string {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

describe("InvalidateTransactionTest", () => {
  fixtures({}, { useTransactionalTests: false });

  const savepointErrorsInvalidateTransactions = adapterType === "mysql";
  it.skipIf(!savepointErrorsInvalidateTransactions)(
    "invalidates transaction on rollback error",
    async () => {
      let invalidated = false;
      const connection = Base.connection;

      await connection.transaction(async () => {
        try {
          await connection.withRawConnection({}, async () => {
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

      expect(invalidated).toBe(true);
    },
  );
});

describe.runIf(adapterType === "mysql")("AdapterTest", () => {
  let adapter: Mysql2Adapter;

  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  it("current database", async () => {
    expect(await adapter.currentDatabase()).toBe(Base.connectionDbConfig()?.database);
  });

  it("charset", async () => {
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
    await runWithoutConnection(async ({ database: _database, ...exceptDatabase }) => {
      await Base.establishConnection(exceptDatabase);
      const connection = await leaseMysqlAdapter();
      await connection.execute(
        `SELECT ${ARUNIT_DATABASE}.pirates.*, ${ARUNIT2_DATABASE}.courses.* ` +
          `FROM ${ARUNIT_DATABASE}.pirates, ${ARUNIT2_DATABASE}.courses`,
      );
    });
  });
});

describe("AdvisoryLocksEnabledTest", () => {
  itIfSupports("advisory_locks", "advisory locks enabled?", async () => {
    expect((await Base.leaseConnection()).isAdvisoryLocksEnabled()).toBe(true);

    await runWithoutConnection(async (origConnection) => {
      await Base.establishConnection({ ...origConnection, advisoryLocks: false });
      expect((await Base.leaseConnection()).isAdvisoryLocksEnabled()).toBe(false);

      await Base.establishConnection({ ...origConnection, advisoryLocks: true });
      expect((await Base.leaseConnection()).isAdvisoryLocksEnabled()).toBe(true);
    });
  });
});
