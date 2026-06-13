import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";
import type { DatabaseAdapter } from "./adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { AbstractSQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
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
} from "./index.js";
import { Result } from "./result.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { adapterType } from "./test-adapter.js";
import { Book } from "./test-helpers/models/book.js";
import { Post } from "./test-helpers/models/post.js";
import { Author, AuthorAddress } from "./test-helpers/models/author.js";
import { Movie } from "./test-helpers/models/movie.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { Event } from "./test-helpers/models/event.js";
import { QueryAttribute } from "./relation/query-attribute.js";

// Rails renders the placeholder via `Arel::Nodes::BindParam.new(nil).to_sql`,
// which collects a "?" marker; our default Node#toSql inlines the value, so the
// placeholder is written literally here. Drives the same insert/update/select/
// delete bind round-trip as Rails' AdapterTest casted/non-casted bind probes.
async function roundTripBinds(conn: AbstractSQLite3Adapter, binds: unknown[]): Promise<void> {
  const id = await conn.insert("INSERT INTO events(id) VALUES (?)", null, null, null, null, binds);
  expect(id).toBe(1);

  const updated = await conn.update("UPDATE events SET title = 'foo' WHERE id = ?", null, binds);
  expect(updated).toBe(1);

  const found = await conn.selectAll("SELECT * FROM events WHERE id = ?", null, binds);
  expect(found.first()).toEqual({ id: 1, title: "foo" });

  const deleted = await conn.delete("DELETE FROM events WHERE id = ?", null, binds);
  expect(deleted).toBe(1);

  const empty = await conn.selectAll("SELECT * FROM events WHERE id = ?", null, binds);
  expect(empty.first()).toBeUndefined();
}

// Spin up a fresh in-memory adapter with the given DDL applied, run the body,
// then close. Mirrors AdapterTest's per-test `@connection` against the schema
// the corresponding Rails fixtures (accounts/authors/tasks/topics/subscribers/
// posts) materialize — created inline here so the suite stays self-contained
// rather than leaning on a shared handler DB.
async function withSchema(
  ddl: string[],
  body: (conn: AbstractSQLite3Adapter) => Promise<void>,
): Promise<void> {
  const conn = new BetterSQLite3Adapter(":memory:");
  try {
    for (const stmt of ddl) await conn.executeMutation(stmt);
    await body(conn);
  } finally {
    await conn.close();
  }
}

// Open a fresh in-memory adapter (no schema), run the body, then close.
// Used by the connection/transaction-state tests, which only exercise
// transaction bookkeeping and need no tables.
async function withConnection(
  body: (conn: AbstractSQLite3Adapter) => Promise<void>,
): Promise<void> {
  const conn = new BetterSQLite3Adapter(":memory:");
  try {
    await body(conn);
  } finally {
    if (conn.active) await conn.close();
  }
}

// Mirrors Rails' `raw_transaction_open?` SQLite branch: whether a BEGIN is
// actually live on the raw connection (tracked by the adapter's _inTransaction
// flag, flipped by begin/commit/rollback DbTransaction).
function rawTransactionOpen(conn: AbstractSQLite3Adapter): boolean {
  return conn.inTransaction;
}

class LifecycleTestAdapter extends AbstractAdapter {
  private _connected = false;

  // The abstract quoteColumnName raises NotImplementedError (mirrors Rails —
  // every adapter must define its own). These test adapters compile real SQL
  // through Arel, so provide an ANSI quoter like a concrete adapter would.
  override quoteColumnName(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  simulateConnect(): void {
    this._connected = true;
    this._connection = this;
    this.verifiedBang();
  }

  remoteDisconnect(): void {
    this._connected = false;
  }

  override get active(): boolean {
    return this._connected;
  }

  override reconnectBang(opts: { restoreTransactions?: boolean } = {}): Promise<void> {
    this._connected = true;
    this._connection = this;
    // Base reconnectBang resolves asynchronously (it runs the reconfigure
    // lifecycle); return its Promise so awaiting callers see reconfiguration
    // complete before proceeding. Setting `_connected` here (rather than in a
    // `reconnect()` override) keeps the synchronous `reconnectBang()` call in
    // "reconnect! restores after remote disconnection" observing `active`
    // immediately, matching Rails' synchronous `reconnect!`.
    return super.reconnectBang(opts);
  }
}

// Adapter that intercepts selectAll to capture allowRetry and simulate reconnects.
class QueryTestAdapter extends LifecycleTestAdapter {
  capturedAllowRetry: boolean | undefined;
  failOnce = false;

  override async selectAll(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean },
  ): Promise<Result> {
    this.capturedAllowRetry = opts?.allowRetry ?? false;
    return this.withRawConnection({ allowRetry: opts?.allowRetry ?? false }, async () => {
      if (this.failOnce) {
        this.failOnce = false;
        throw new ConnectionFailed("remote disconnect");
      }
      return Result.fromRowHashes([]);
    });
  }
}

// Adapter whose execute() wires the allowRetry option through to
// withRawConnection exactly as the real adapters do — so the test exercises
// the public execute() API end-to-end (not withRawConnection directly).
class ExecuteRetryAdapter extends LifecycleTestAdapter {
  attempts = 0;

  override async execute(
    _sql: string,
    _binds?: unknown[],
    _name?: string,
    opts?: { allowRetry?: boolean },
  ): Promise<Record<string, unknown>[]> {
    return this.withRawConnection({ allowRetry: opts?.allowRetry ?? false }, async () => {
      this.attempts++;
      if (this.attempts === 1) throw new ConnectionFailed("remote disconnect");
      return [];
    });
  }
}

// Adapter whose configureConnection() raises a queued ConnectionFailed until
// the queue drains — drives the reconnect! retry loop (connection_retries) the
// way Rails' "disconnect and recover on #configure_connection failure" does.
class ConfigureFailureAdapter extends AbstractAdapter {
  failures: Error[] = [];
  private _live = false;

  override get active(): boolean {
    return this._live;
  }
  override reconnect(): void {
    this._live = true;
    this._connection = this;
  }
  override disconnectBang(): void {
    this._live = false;
    super.disconnectBang();
  }
  override configureConnection(): void {
    const err = this.failures.shift();
    if (err) throw err;
  }
  override clearCacheBang(): void {}

  override async execute(_sql?: string): Promise<Record<string, unknown>[]> {
    return this.withRawConnection(async () => [{ "1": 1 }]);
  }
}

// Minimal Post model for retryable-classification tests.
class PostForRetryTest extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("tags_count", "integer");
  }
}

describe("AdapterTest", () => {
  it("valid column", async () => {
    const conn = new BetterSQLite3Adapter(":memory:");
    try {
      for (const type of Object.keys(conn.nativeDatabaseTypes())) {
        expect(conn.isValidType(type)).toBe(true);
      }
    } finally {
      await conn.close();
    }
  });
  it("invalid column", async () => {
    const conn = new BetterSQLite3Adapter(":memory:");
    try {
      expect(conn.isValidType("foobar")).toBe(false);
    } finally {
      await conn.close();
    }
  });
  it("table exists?", async () => {
    await withSchema(
      ["CREATE TABLE accounts (id integer PRIMARY KEY, firm_id integer)"],
      async (conn) => {
        expect(await conn.tableExists("accounts")).toBe(true);
        expect(await conn.tableExists("nonexistingtable")).toBe(false);
        expect(await conn.tableExists("'")).toBe(false);
        expect(await conn.tableExists(null as unknown as string)).toBe(false);
      },
    );
  });
  it("data sources", async () => {
    await withSchema(
      [
        "CREATE TABLE accounts (id integer PRIMARY KEY)",
        "CREATE TABLE authors (id integer PRIMARY KEY)",
        "CREATE TABLE tasks (id integer PRIMARY KEY)",
        "CREATE TABLE topics (id integer PRIMARY KEY)",
      ],
      async (conn) => {
        const dataSources = await conn.dataSources();
        expect(dataSources).toContain("accounts");
        expect(dataSources).toContain("authors");
        expect(dataSources).toContain("tasks");
        expect(dataSources).toContain("topics");
      },
    );
  });
  it("indexes", async () => {
    const idxName = "accounts_idx";
    await withSchema(
      ["CREATE TABLE accounts (id integer PRIMARY KEY, firm_id integer)"],
      async (conn) => {
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
      },
    );
  });
  it("returns empty indexes for non existing table", async () => {
    const conn = new BetterSQLite3Adapter(":memory:");
    try {
      expect(await conn.indexes("nonexistingtable")).toEqual([]);
    } finally {
      await conn.close();
    }
  });
  it("remove index when name and wrong column name specified", async () => {
    await withSchema(
      ["CREATE TABLE accounts (id integer PRIMARY KEY, firm_id integer)"],
      async (conn) => {
        await conn.addIndex("accounts", "firm_id", { name: "accounts_idx" });
        await expect(
          conn.removeIndex("accounts", { name: "accounts_idx", column: "wrong_column_name" }),
        ).rejects.toBeInstanceOf(ArgumentError);
        // ensure: the real index is still removable by name
        await conn.removeIndex("accounts", { name: "accounts_idx" });
      },
    );
  });
  it("remove index when name and wrong column name specified positional argument", async () => {
    await withSchema(
      ["CREATE TABLE accounts (id integer PRIMARY KEY, firm_id integer)"],
      async (conn) => {
        await conn.addIndex("accounts", "firm_id", { name: "accounts_idx" });
        await expect(
          conn.removeIndex("accounts", "wrong_column_name", { name: "accounts_idx" }),
        ).rejects.toBeInstanceOf(ArgumentError);
        await conn.removeIndex("accounts", { name: "accounts_idx" });
      },
    );
  });
  it("#exec_query queries with no result set return an empty ActiveRecord::Result", async () => {
    await withSchema(
      ["CREATE TABLE subscribers (nick varchar PRIMARY KEY, name varchar)"],
      async (conn) => {
        const result = await conn.execQuery("INSERT INTO subscribers(nick) VALUES('me')");
        expect(result).toBeInstanceOf(Result);
        expect(result.rows).toEqual([]);
        expect(result.columns).toEqual([]);
      },
    );
  });
  it("#exec_query queries with an empty result set still return the columns", async () => {
    await withSchema(
      ["CREATE TABLE subscribers (nick varchar PRIMARY KEY, name varchar)"],
      async (conn) => {
        const result = await conn.execQuery("SELECT * FROM subscribers WHERE 1=0");
        expect(result).toBeInstanceOf(Result);
        expect(result.rows).toEqual([]);
        expect(result.columns.length).toBeGreaterThan(0);
      },
    );
  });
  // charset / show nonexistent variable returns nil / not specifying database
  // name for cross database selects (MySQL-only) live in
  // adapters/abstract-mysql-adapter/adapter.test.ts behind describeIfMysql.
  it("disable prepared statements", async () => {
    // Rails establishes a connection with `prepared_statements: true` and
    // asserts `lease_connection.prepared_statements?` flips false once the
    // global `ActiveRecord.disable_prepared_statements` toggle is set. Rails
    // gates this `unless in_memory_db?`; our default test DB is sqlite
    // `:memory:`, so we exercise the same setter chokepoint by constructing
    // the adapter with `preparedStatements: true` on each side of the toggle.
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
    await withSchema(
      ["CREATE TABLE subscribers (nick varchar PRIMARY KEY, name varchar)"],
      async (conn) => {
        await conn.executeMutation("INSERT INTO subscribers(nick) VALUES('me')");
        const error = await conn
          .executeMutation("INSERT INTO subscribers(nick) VALUES('me')")
          .catch((e) => e);
        expect(error).toBeInstanceOf(RecordNotUnique);
        expect(error.cause).toBeTruthy();
      },
    );
  });
  it("not null violations are translated to specific exception", async () => {
    await withSchema(
      ["CREATE TABLE posts (id integer PRIMARY KEY, title varchar NOT NULL)"],
      async (conn) => {
        const error = await conn.executeMutation("INSERT INTO posts(id) VALUES(1)").catch((e) => e);
        expect(error).toBeInstanceOf(NotNullViolation);
        expect(error.cause).toBeTruthy();
      },
    );
  });
  // `value limit violations` and `numeric value out of ranges` are translated
  // only on non-SQLite backends (Rails gates them `unless
  // current_adapter?(:SQLite3Adapter)`), so they live in the model-backed
  // `AdapterTest` block below where Base.connection resolves to the
  // ARCONN-configured adapter.
  it.skip("exceptions from notifications are not translated", () => {
    // BLOCKED: notifications
    // ROOT-CAUSE: activesupport Notifications._notify swallows subscriber errors on the
    // instrument()/instrumentAsync() path (only the publish() propagate=true path re-raises),
    // so a subscriber raising inside sql.active_record never bubbles to the caller the way
    // Rails' instrumenter lets it. Reproducing the test needs Notifications to re-raise
    // subscriber errors from instrumented blocks — a cross-cutting change out of scope here.
    // SCOPE: ~5 LOC test once Notifications propagates; affects ~1 test
  });
  it("database related exceptions are translated to statement invalid", async () => {
    await withSchema([], async (conn) => {
      const error = await conn.execute("This is a syntax error").catch((e) => e);
      expect(error).toBeInstanceOf(StatementInvalid);
      expect(error.cause).toBeInstanceOf(Error);
    });
  });
  it("select all always return activerecord result", async () => {
    await withSchema(
      ["CREATE TABLE posts (id integer PRIMARY KEY, title varchar)"],
      async (conn) => {
        const result = await conn.selectAll("SELECT * FROM posts");
        expect(result).toBeInstanceOf(Result);
      },
    );
  });
  it("select all insert update delete with casted binds", async () => {
    await withSchema(
      ["CREATE TABLE events (id integer PRIMARY KEY, title varchar(5))"],
      async (conn) => {
        const binds = [Event.typeForAttribute("id").serialize(1)];
        await roundTripBinds(conn, binds);
      },
    );
  });
  it("select all insert update delete with binds", async () => {
    await withSchema(
      ["CREATE TABLE events (id integer PRIMARY KEY, title varchar(5))"],
      async (conn) => {
        const binds = [new QueryAttribute("id", 1, Event.typeForAttribute("id"))];
        await roundTripBinds(conn, binds);
      },
    );
  });
  it("type_to_sql returns a String for unmapped types", () => {
    expect(new SchemaCreation("sqlite").typeToSql("special_db_type" as any)).toBe(
      "special_db_type",
    );
  });
  // current database (MySQL/PG, gated by respond_to?(:current_database)) lives
  // in the adapters/{abstract-mysql-adapter,postgresql}/adapter.test.ts suites
  // behind describeIfMysql/describeIfPg.
});

// Model-backed AdapterTest cases. Same Rails class (AdapterTest) as the
// inline-DDL block above, kept in a second describe so it can wire the handler
// suite + canonical Book/Post/Author models + fixtures (Rails'
// `@connection = ActiveRecord::Base.lease_connection`), since these exercise
// create/reload/update/find and relation-typed select methods.
describe("AdapterTest", () => {
  registerModel("Author", Author);
  registerModel("Post", Post);
  registerModel("Book", Book);
  registerModel("Event", Event);
  useHandlerFixtures(["posts", "authors", "books"], {
    schema: canonicalSchema,
    // These two intentionally raise a DB error mid-INSERT, which aborts an open
    // PG transaction and would poison transactional-fixtures teardown. Run them
    // outside the shared transaction; the failed INSERT persists nothing, so no
    // manual cleanup is needed.
    usesTransaction: [
      "value limit violations are translated to specific exception",
      "numeric value out of ranges are translated to specific exception",
    ],
  });

  // The Event-backed `events` table is not among the fixtures wired above, so
  // ensure it exists (mirrors schema.rb `t.string :title, limit: 5`).
  beforeAll(async () => {
    if (adapterType === "sqlite") return;
    await defineSchema({ events: canonicalSchema.events });
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
      const error = (await (Base.connection as AbstractAdapter)
        .insert("INSERT INTO books(author_id) VALUES (9223372036854775808)")
        .catch((e) => e)) as { cause?: unknown };
      expect(error).toBeInstanceOf(RangeError);
      expect(error.cause).toBeTruthy();
    },
  );

  it.skip("update prepared statement", () => {
    // BLOCKED: binds-inlining
    // ROOT-CAUSE: trails inlines string literals into INSERT SQL rather than binding
    // them as prepared-statement parameters, so an embedded null byte (\x00) truncates
    // the SQL at the C-string boundary ("unrecognized token: 'my "). Rails gates this
    // test off precisely for SQLite-without-prepared-statements; reproducing it requires
    // the write path to round-trip binds through a prepared statement.
    // SCOPE: ~8 LOC test once INSERT binds are prepared; affects ~1 test
  });

  it.skip("create record with pk as zero", () => {
    // BLOCKED: schema-gen
    // ROOT-CAUSE: trails' defineSchema emits the canonical `books` primary key as the
    // adapter-default auto-increment/identity column. On PostgreSQL that is GENERATED
    // ... AS IDENTITY (and on MySQL AUTO_INCREMENT treats an inserted 0 as "next value"),
    // so an explicit `id: 0` is overridden and `Book.find(0)` misses. Rails' schema
    // declares `books` with `id: :integer` (a plain integer PK that honours explicit 0).
    // Passes on SQLite (INTEGER PRIMARY KEY accepts 0) but not cross-adapter, so it stays
    // skipped until defineSchema can mirror Rails' integer-PK declaration.
    // SCOPE: ~4 LOC test once the books PK mirrors Rails' `id: :integer`; affects ~1 test
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
});

// Rails declares `fixtures :fk_test_has_pk` and a real `foreign_key` on
// fk_test_has_fk. defineSchema can't express FK constraints (see test-schema.ts
// header), so we add it via raw DDL once per worker and tear it down after,
// then drive the tables directly (Rails sets `use_transactional_tests = false`).
describe("AdapterForeignKeyTest", () => {
  setupHandlerSuite();

  const addFkSql = (): string =>
    "ALTER TABLE fk_test_has_fk ADD CONSTRAINT fk_name " +
    "FOREIGN KEY (fk_id) REFERENCES fk_test_has_pk (pk_id)";
  const dropFkSql = (): string =>
    adapterType === "mysql"
      ? "ALTER TABLE fk_test_has_fk DROP FOREIGN KEY fk_name"
      : "ALTER TABLE fk_test_has_fk DROP CONSTRAINT IF EXISTS fk_name";

  const cleanup = async (): Promise<void> => {
    await Base.connection.execute("DELETE FROM fk_test_has_fk");
    await Base.connection.execute("DELETE FROM fk_test_has_pk");
  };

  beforeAll(async () => {
    if (adapterType === "sqlite") return;
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
    if (adapterType === "sqlite") return;
    await Base.connection.execute(dropFkSql()).catch(() => {});
  });
  beforeEach(async () => {
    if (adapterType !== "sqlite") await cleanup();
  });
  afterEach(async () => {
    if (adapterType !== "sqlite") await cleanup();
  });

  const insertIntoFkTestHasFk = (fkId = 0): Promise<unknown> =>
    (Base.connection as AbstractAdapter).insert(
      `INSERT INTO fk_test_has_fk (fk_id) VALUES (${fkId})`,
    );

  it.skipIf(adapterType === "sqlite")(
    "foreign key violations are translated to specific exception with validate false",
    async () => {
      class KlassHasFk extends Base {
        static {
          this.tableName = "fk_test_has_fk";
        }
      }
      const hasFk = new KlassHasFk({ fk_id: 1231231231 });
      const error = await hasFk.save({ validate: false }).catch((e) => e);
      expect(error).toBeInstanceOf(InvalidForeignKey);
      expect(error.cause).toBeTruthy();
    },
  );

  it.skipIf(adapterType === "sqlite")(
    "foreign key violations on insert are translated to specific exception",
    async () => {
      const error = (await insertIntoFkTestHasFk().catch((e) => e)) as { cause?: unknown };
      expect(error).toBeInstanceOf(InvalidForeignKey);
      expect(error.cause).toBeTruthy();
    },
  );

  it.skipIf(adapterType === "sqlite")(
    "foreign key violations on delete are translated to specific exception",
    async () => {
      await Base.connection.execute("INSERT INTO fk_test_has_pk (pk_id) VALUES (1)");
      await insertIntoFkTestHasFk(1);
      const error = await Base.connection
        .execute("DELETE FROM fk_test_has_pk WHERE pk_id = 1")
        .catch((e) => e);
      expect(error).toBeInstanceOf(InvalidForeignKey);
      expect(error.cause).toBeTruthy();
    },
  );

  it.skipIf(adapterType === "sqlite")("disable referential integrity", async () => {
    const conn = Base.connection as AbstractAdapter;
    // assert_nothing_raised: a throw inside the block fails the test.
    await conn.disableReferentialIntegrity(async () => {
      await insertIntoFkTestHasFk();
      // delete created record as otherwise disableReferentialIntegrity will
      // try to enable constraints after the block and fail.
      await conn.execute("DELETE FROM fk_test_has_fk");
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
    "truncate",
    "truncate with query cache",
    "truncate tables",
    "truncate tables with query cache",
    "reset empty table with custom pk",
    "reset table with non integer pk",
  ];
  useHandlerFixtures(["posts", "authors", "authorAddresses", "movies", "subscribers"], {
    schema: canonicalSchema,
    usesTransaction: withoutTransaction,
  });

  beforeAll(async () => {
    // Rails' schema.rb declares `movies` with `primary_key: "movieid"`, making
    // movieid a serial column. The canonical-schema `defineSchema` path creates
    // a custom-named integer PK without a sequence on PostgreSQL, so a
    // sequence-less `movieid` rejects the `reset empty table with custom pk`
    // insert. Recreate it with an auto-increment PK (PG-only; the test is
    // PG-gated). Mirrors the keyboards recreation in primary-keys.test.ts.
    if (adapterType !== "postgres") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = Base.connection as any;
    await conn.dropTable("movies", { ifExists: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await conn.createTable("movies", { primaryKey: "movieid" }, (t: any) => {
      t.string("name");
    });
    Movie.resetColumnInformation();
    await Movie.loadSchema();
  });

  it("truncate", async () => {
    const conn = Base.connection as AbstractAdapter;
    expect(await Post.count()).toBeGreaterThan(0);

    await conn.truncate("posts");

    expect(await Post.count()).toBe(0);
  });

  it("truncate with query cache", async () => {
    const conn = Base.connection as AbstractAdapter;
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
    const conn = Base.connection as AbstractAdapter;
    expect(await Post.count()).toBeGreaterThan(0);
    expect(await Author.count()).toBeGreaterThan(0);
    expect(await AuthorAddress.count()).toBeGreaterThan(0);

    await conn.truncateTables("author_addresses", "authors", "posts");

    expect(await Post.count()).toBe(0);
    expect(await Author.count()).toBe(0);
    expect(await AuthorAddress.count()).toBe(0);
  });

  it("truncate tables with query cache", async () => {
    const conn = Base.connection as AbstractAdapter;
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

  // Rails gates these on `respond_to?(:reset_pk_sequence!)` — PostgreSQL only.
  it.skipIf(adapterType !== "postgres")("reset empty table with custom pk", async () => {
    const conn = Base.connection as DatabaseAdapter & {
      resetPkSequenceBang(table: string): Promise<void>;
    };
    await Movie.deleteAll();
    await conn.resetPkSequenceBang("movies");
    const movie = await Movie.create({ name: "fight club" });
    expect(movie.id).toBe(1);
  });

  it.skipIf(adapterType !== "postgres")("reset table with non integer pk", async () => {
    const conn = Base.connection as DatabaseAdapter & {
      resetPkSequenceBang(table: string): Promise<void>;
    };
    await Subscriber.deleteAll();
    await conn.resetPkSequenceBang("subscribers");
    const sub = new Subscriber({ name: "robert drake" });
    sub.id = "bob drake";
    // Rails: assert_nothing_raised { sub.save! }
    await sub.saveBang();
    const found = (await Subscriber.find("bob drake")) as Subscriber;
    expect(found.id).toBe("bob drake");
  });
});

describe("AdapterConnectionTest", () => {
  it("reconnect after a disconnect", async () => {
    await withConnection(async (conn) => {
      conn.disconnectBang();
      expect(conn.active).toBe(false);
      await conn.reconnectBang();
      expect(conn.active).toBe(true);
    });
  });
  it("materialized transaction state is reset after a reconnect", async () => {
    await withConnection(async (conn) => {
      await conn.transactionManager.beginTransaction();
      expect(conn.isTransactionOpen()).toBe(true);
      await conn.materializeTransactions();
      expect(rawTransactionOpen(conn)).toBe(true);
      await conn.reconnectBang();
      expect(conn.isTransactionOpen()).toBe(false);
      expect(rawTransactionOpen(conn)).toBe(false);
    });
  });
  it("materialized transaction state can be restored after a reconnect", async () => {
    await withConnection(async (conn) => {
      await conn.transactionManager.beginTransaction();
      expect(conn.isTransactionOpen()).toBe(true);
      await conn.materializeTransactions();
      expect(rawTransactionOpen(conn)).toBe(true);
      await conn.reconnectBang({ restoreTransactions: true });
      expect(conn.isTransactionOpen()).toBe(true);
      expect(rawTransactionOpen(conn)).toBe(true);
    });
  });
  it("materialized transaction state is reset after a disconnect", async () => {
    await withConnection(async (conn) => {
      await conn.transactionManager.beginTransaction();
      expect(conn.isTransactionOpen()).toBe(true);
      await conn.materializeTransactions();
      expect(rawTransactionOpen(conn)).toBe(true);
      conn.disconnectBang();
      expect(conn.isTransactionOpen()).toBe(false);
    });
  });
  it("unmaterialized transaction state is reset after a reconnect", async () => {
    await withConnection(async (conn) => {
      await conn.transactionManager.beginTransaction();
      expect(conn.isTransactionOpen()).toBe(true);
      expect(rawTransactionOpen(conn)).toBe(false);
      await conn.reconnectBang();
      expect(conn.isTransactionOpen()).toBe(false);
      expect(rawTransactionOpen(conn)).toBe(false);
      await conn.materializeTransactions();
      expect(rawTransactionOpen(conn)).toBe(false);
    });
  });
  it("unmaterialized transaction state can be restored after a reconnect", async () => {
    await withConnection(async (conn) => {
      await conn.transactionManager.beginTransaction();
      expect(conn.isTransactionOpen()).toBe(true);
      expect(rawTransactionOpen(conn)).toBe(false);
      await conn.reconnectBang({ restoreTransactions: true });
      expect(conn.isTransactionOpen()).toBe(true);
      expect(rawTransactionOpen(conn)).toBe(false);
      await conn.materializeTransactions();
      expect(rawTransactionOpen(conn)).toBe(true);
    });
  });
  it("unmaterialized transaction state is reset after a disconnect", async () => {
    await withConnection(async (conn) => {
      await conn.transactionManager.beginTransaction();
      expect(conn.isTransactionOpen()).toBe(true);
      expect(rawTransactionOpen(conn)).toBe(false);
      conn.disconnectBang();
      expect(conn.isTransactionOpen()).toBe(false);
    });
  });
  it("active? detects remote disconnection", () => {
    const a = new LifecycleTestAdapter();
    a.simulateConnect();
    a.remoteDisconnect();
    expect(a.active).toBe(false);
  });
  it("verify! restores after remote disconnection", async () => {
    const a = new LifecycleTestAdapter();
    a.simulateConnect();
    a.remoteDisconnect();
    await a.verifyBang();
    expect(a.active).toBe(true);
  });
  it("reconnect! restores after remote disconnection", () => {
    const a = new LifecycleTestAdapter();
    a.simulateConnect();
    a.remoteDisconnect();
    a.reconnectBang();
    expect(a.active).toBe(true);
  });
  it("querying a 'clean' long-failed connection restores and succeeds", async () => {
    const a = new LifecycleTestAdapter();
    a.simulateConnect();
    a.remoteDisconnect();
    a.cleanBang();
    (a as any)._lastActivity = Date.now() - 5 * 60 * 1000;
    expect(a.active).toBe(false);
    let blockCalled = false;
    await a.withRawConnection(async () => {
      blockCalled = true;
    });
    expect(blockCalled).toBe(true);
    expect(a.active).toBe(true);
  });
  it("querying a 'clean' recently-used but now-failed connection skips verification", async () => {
    const a = new LifecycleTestAdapter();
    a.simulateConnect();
    a.remoteDisconnect();
    a.cleanBang();
    expect(a.active).toBe(false);
    await expect(
      a.withRawConnection(async () => {
        if (!a.active) throw new AdapterError("remote connection lost");
      }),
    ).rejects.toBeInstanceOf(AdapterError);
  });
  it("quoting a string on a 'clean' failed connection will not prevent reconnecting", async () => {
    const a = new LifecycleTestAdapter();
    a.simulateConnect();
    a.remoteDisconnect();
    a.cleanBang();
    (a as any)._lastActivity = Date.now() - 5 * 60 * 1000;
    expect(a.active).toBe(false);
    a.quoteString("");
    expect(a.active).toBe(false);
    let blockCalled = false;
    await a.withRawConnection(async () => {
      blockCalled = true;
    });
    expect(blockCalled).toBe(true);
    expect(a.active).toBe(true);
  });
  // eslint-disable-next-line blazetrails/test-fixture-parity -- tests abstract loop directly; no AR model / DB needed
  it("querying after a failed non-retryable query restores and succeeds", async () => {
    const adapter = new LifecycleTestAdapter();
    adapter.simulateConnect();
    adapter.remoteDisconnect();

    // Non-retryable query (allowRetry: false) fails; marks connection unverified.
    await expect(
      adapter.withRawConnection({ allowRetry: false, materializeTransactions: false }, async () => {
        throw new ConnectionFailed("remote disconnect");
      }),
    ).rejects.toBeInstanceOf(ConnectionFailed);

    // Verifying the connection causes a reconnect and the query succeeds.
    let reconnected = false;
    await adapter.withRawConnection(
      { allowRetry: false, materializeTransactions: false },
      async () => {
        reconnected = adapter.active;
      },
    );
    expect(reconnected).toBe(true);
    expect(adapter.active).toBe(true);
  });
  it("idempotent SELECT queries are retried and result in a reconnect", async () => {
    const adapter = new LifecycleTestAdapter();
    adapter.simulateConnect();
    adapter.remoteDisconnect();

    // allowRetry: true — ConnectionFailed triggers a reconnect and re-run.
    await adapter.withRawConnection(
      { allowRetry: true, materializeTransactions: false },
      async () => {
        if (!adapter.active) throw new ConnectionFailed("remote disconnect");
      },
    );
    expect(adapter.active).toBe(true);

    adapter.remoteDisconnect();

    await adapter.withRawConnection(
      { allowRetry: true, materializeTransactions: false },
      async () => {
        if (!adapter.active) throw new ConnectionFailed("remote disconnect");
      },
    );
    expect(adapter.active).toBe(true);
  });
  it("#find and #find_by queries with known attributes are retried and result in a reconnect", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as any;

    adapter.failOnce = true;
    await PostForRetryTest.where({ id: 1 }).limit(1).toArray();
    expect(adapter.capturedAllowRetry).toBe(true);
    expect(adapter.active).toBe(true);

    adapter.failOnce = true;
    await PostForRetryTest.where({ title: "Welcome to the weblog" }).limit(1).toArray();
    expect(adapter.capturedAllowRetry).toBe(true);
    expect(adapter.active).toBe(true);
  });
  it("queries containing SQL fragments are not retried", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as any;

    adapter.failOnce = true;
    await expect(PostForRetryTest.where("1 = 1").limit(1).toArray()).rejects.toBeInstanceOf(
      ConnectionFailed,
    );
    expect(adapter.capturedAllowRetry).toBe(false);

    adapter.simulateConnect();
    adapter.failOnce = true;
    await expect(
      PostForRetryTest.select("title AS custom_title").limit(1).toArray(),
    ).rejects.toBeInstanceOf(ConnectionFailed);
    expect(adapter.capturedAllowRetry).toBe(false);
  });
  it("queries containing SQL functions are not retried", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as any;

    const tagsCountAttr = PostForRetryTest.arelTable.get("tags_count");
    const absTagsCount = new Nodes.NamedFunction("ABS", [tagsCountAttr]);

    adapter.failOnce = true;
    await expect(
      (PostForRetryTest as any).where(absTagsCount.eq(2)).limit(1).toArray(),
    ).rejects.toBeInstanceOf(ConnectionFailed);
    expect(adapter.capturedAllowRetry).toBe(false);
  });
  it("a from(Arel node) clause does not reset the SELECT's retryable classification", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as any;

    // The raw-SQL WHERE makes the SELECT non-retryable. from() takes a
    // retryable Arel node, which _toSqlWithoutSetOp compiles a second time
    // through the shared visitor — that compile must not clobber the
    // already-captured classification (regression: collector reset).
    const fromNode = new Nodes.SqlLiteral("posts", { retryable: true });
    await PostForRetryTest.where("1 = 1").from(fromNode).limit(1).toArray();
    expect(adapter.capturedAllowRetry).toBe(false);

    // A fully retryable query with a from(Arel node) stays retryable.
    await PostForRetryTest.where({ id: 1 }).from(fromNode).limit(1).toArray();
    expect(adapter.capturedAllowRetry).toBe(true);

    // A non-retryable FROM node lowers the classification even when the rest
    // of the SELECT is retryable — Rails compiles the whole arel through one
    // collector, so the raw FROM fragment makes allow_retry false.
    const rawFromNode = new Nodes.SqlLiteral("posts");
    await PostForRetryTest.where({ id: 1 }).from(rawFromNode).limit(1).toArray();
    expect(adapter.capturedAllowRetry).toBe(false);

    // from(Relation) compiles its subquery separately too — a non-retryable
    // fragment inside the subquery must lower the outer classification.
    const rawSubquery = PostForRetryTest.where("1 = 1");
    await PostForRetryTest.where({ id: 1 }).from(rawSubquery, "sub").limit(1).toArray();
    expect(adapter.capturedAllowRetry).toBe(false);

    // A set-operation subquery compiles each side separately, so its captured
    // flag reflects only one side; treat it as non-retryable like toArray does.
    const setOpSubquery = PostForRetryTest.where({ id: 1 }).union(
      PostForRetryTest.where({ id: 2 }),
    );
    await PostForRetryTest.where({ id: 1 }).from(setOpSubquery, "sub").limit(1).toArray();
    expect(adapter.capturedAllowRetry).toBe(false);
  });
  it("findBySql tolerates a null opts argument without throwing", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as any;

    await expect(PostForRetryTest.findBySql("SELECT * FROM posts", [], null)).resolves.toEqual([]);
  });
  it("execQuery options type accepts allowRetry alongside prepare", () => {
    const opts: NonNullable<Parameters<DatabaseAdapter["execQuery"]>[3]> = {
      prepare: true,
      allowRetry: true,
    };
    expect(opts.allowRetry).toBe(true);
  });
  it("can reconnect and retry queries under limit when retry deadline is set", async () => {
    let attempts = 0;
    const a = new AbstractAdapter();
    (a as any)._config.retryDeadline = 0.1;
    await a.withRawConnection({ allowRetry: true }, async () => {
      if (attempts === 0) {
        attempts++;
        throw new ConnectionFailed("Something happened to the connection");
      }
    });
  });
  it("does not reconnect and retry queries when retries are disabled", async () => {
    await expect(async () => {
      let attempts = 0;
      const a = new AbstractAdapter();
      await a.withRawConnection(async () => {
        if (attempts === 0) {
          attempts++;
          throw new ConnectionFailed("Something happened to the connection");
        }
      });
    }).rejects.toBeInstanceOf(ConnectionFailed);
  });
  it("does not reconnect and retry queries that exceed retry deadline", async () => {
    await expect(async () => {
      let attempts = 0;
      const a = new AbstractAdapter();
      (a as any)._config.retryDeadline = 0.01; // 10ms — expires before the 20ms sleep
      await a.withRawConnection({ allowRetry: true }, async () => {
        if (attempts === 0) {
          await new Promise<void>((r) => setTimeout(r, 20));
          attempts++;
          throw new ConnectionFailed("Something happened to the connection");
        }
      });
    }).rejects.toBeInstanceOf(ConnectionFailed);
  });

  it("withRawConnection is reentrant", async () => {
    // Rails' with_raw_connection runs under a reentrant Monitor and is
    // documented to re-enter (abstract_adapter.rb:972-981): materialize_
    // transactions re-enters, and the yielded block can too (e.g. a write
    // path's exec_restart_db_transaction → execute). A nested call on the same
    // chain must run directly, not queue behind the held lock and deadlock.
    const a = new AbstractAdapter();
    let innerRan = false;
    const result = await a.withRawConnection(async () => {
      await a.withRawConnection(async () => {
        innerRan = true;
      });
      return "outer";
    });
    expect(innerRan).toBe(true);
    expect(result).toBe("outer");
  });

  it("#execute is retryable", async () => {
    const adapter = new ExecuteRetryAdapter();
    adapter.simulateConnect();
    adapter.remoteDisconnect();

    // Calling execute() with allowRetry: true must reconnect and re-run the
    // query transparently (mirrors Rails adapter_test.rb:835 — kill the server
    // connection, then execute("SELECT 1", allow_retry: true) succeeds).
    await adapter.execute("SELECT 1", [], "SQL", { allowRetry: true });
    expect(adapter.attempts).toBe(2);
    expect(adapter.active).toBe(true);
  });
  it("disconnect and recover on #configure_connection failure", async () => {
    // Mirrors adapter_test.rb:852 — a connection whose configure_connection
    // fails twice (raising ConnectionFailed) makes the first query raise after
    // the reconnect! retry loop (connection_retries) is exhausted; once the
    // failures drain, the next query reconfigures cleanly and succeeds.
    const adapter = new ConfigureFailureAdapter();
    (adapter as any)._config.connectionRetries = 1;
    (adapter as any).backoff = () => Promise.resolve();
    adapter.failures = [new ConnectionFailed("Oops"), new ConnectionFailed("Oops 2")];

    await expect(adapter.execute("SELECT 1")).rejects.toBeInstanceOf(ConnectionFailed);

    expect(await adapter.execute("SELECT 1")).toEqual([{ "1": 1 }]);
    expect(adapter.failures).toEqual([]);
  });
});

// Drives AbstractAdapter#reconnectBang / #verifyBang lifecycle directly,
// independent of a concrete adapter's raw-connection wiring. Mirrors the
// observable effects of Rails' `reconnect!` / `verify!` / `configure_connection`
// chain (abstract_adapter.rb) — the integration-level Rails tests in
// AdapterConnectionTest additionally need a base-controlled reconnect retry
// loop and non-in-memory adapter, so they stay skipped.
class ReconnectLifecycleAdapter extends AbstractAdapter {
  configureCalls = 0;
  clearCacheCalls = 0;
  disconnectCalls = 0;
  failConfigure = false;
  reconnectCalls = 0;
  // Number of leading reconnect() calls that should throw before succeeding.
  reconnectFailures = 0;
  // Error thrown by the failing reconnect() attempts.
  reconnectError: () => Error = () => new ConnectionFailed("connection reset");

  override reconnect(): void {
    this.reconnectCalls++;
    if (this.reconnectFailures > 0) {
      this.reconnectFailures--;
      throw this.reconnectError();
    }
  }

  override configureConnection(): void {
    this.configureCalls++;
    if (this.failConfigure) throw new ConnectionFailed("configure_connection failed");
  }
  override clearCacheBang(): void {
    this.clearCacheCalls++;
  }
  override disconnectBang(): void {
    this.disconnectCalls++;
    super.disconnectBang();
  }
  attachRawConnection(): void {
    this._connection = this;
  }
}

describe("AbstractAdapter reconnect/verify lifecycle", () => {
  it("reconnectBang re-enables lazy transactions, clears the cache, and reconfigures", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    await a.transactionManager.disableLazyTransactionsBang();
    expect(a.transactionManager.isLazyTransactionsEnabled()).toBe(false);

    await a.reconnectBang();

    expect(a.transactionManager.isLazyTransactionsEnabled()).toBe(true);
    expect(a.clearCacheCalls).toBe(1);
    expect(a.configureCalls).toBe(1);
    expect((a as any)._verified).toBe(true);
    expect((a as any)._rawConnectionDirty).toBe(false);
  });

  it("reconnectBang with restoreTransactions keeps an open transaction open", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    await a.transactionManager.beginTransaction();
    expect(a.isTransactionOpen()).toBe(true);

    await a.reconnectBang({ restoreTransactions: true });
    expect(a.isTransactionOpen()).toBe(true);
  });

  it("reconnectBang without restoreTransactions discards open transactions", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    await a.transactionManager.beginTransaction();
    expect(a.isTransactionOpen()).toBe(true);

    await a.reconnectBang();
    expect(a.isTransactionOpen()).toBe(false);
  });

  it("reconnectBang clears verified/last-activity state when reconfigure fails", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    a.failConfigure = true;

    await expect(a.reconnectBang()).rejects.toBeInstanceOf(ConnectionFailed);
    expect((a as any)._verified).toBe(false);
    expect((a as any)._lastActivity).toBe(0);
  });

  it("reconnect! retries a transient connection failure and succeeds", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    (a as any)._config.connectionRetries = 2;
    (a as any).backoff = () => Promise.resolve();
    a.reconnectFailures = 1;

    await a.reconnectBang();

    expect(a.reconnectCalls).toBe(2);
    expect((a as any)._verified).toBe(true);
    expect(a.configureCalls).toBe(1);
  });

  it("reconnect! gives up after exhausting connection retries", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    (a as any)._config.connectionRetries = 2;
    (a as any).backoff = () => Promise.resolve();
    a.reconnectFailures = 99;

    await expect(a.reconnectBang()).rejects.toBeInstanceOf(ConnectionFailed);
    // Initial attempt plus connectionRetries (2) retries.
    expect(a.reconnectCalls).toBe(3);
    expect((a as any)._verified).toBe(false);
    expect((a as any)._lastActivity).toBe(0);
  });

  it("reconnect! does not retry a non-retryable error", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    (a as any)._config.connectionRetries = 3;
    (a as any).backoff = () => Promise.resolve();
    a.reconnectFailures = 1;
    a.reconnectError = () => new AdapterError("syntax error");

    await expect(a.reconnectBang()).rejects.toBeInstanceOf(AdapterError);
    expect(a.reconnectCalls).toBe(1);
    expect((a as any)._verified).toBe(false);
  });

  it("verifyBang promotes an unconfigured connection instead of reconnecting", async () => {
    const a = new ReconnectLifecycleAdapter();
    const raw = {} as any;
    (a as any)._unconfiguredConnection = raw;

    await a.verifyBang();

    expect((a as any)._connection).toBe(raw);
    expect((a as any)._unconfiguredConnection).toBeNull();
    expect(a.configureCalls).toBe(1);
    expect((a as any)._verified).toBe(true);
  });

  it("verifyBang disconnects and raises when configuring an unconfigured connection fails", async () => {
    const a = new ReconnectLifecycleAdapter();
    (a as any)._unconfiguredConnection = {} as any;
    a.failConfigure = true;

    await expect(a.verifyBang()).rejects.toBeInstanceOf(ConnectionFailed);
    expect(a.disconnectCalls).toBe(1);
    expect((a as any)._verified).toBe(false);
  });
});

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
  setupHandlerSuite();

  it.skipIf(adapterType !== "mysql")("invalidates transaction on rollback error", async () => {
    let invalidated = false;
    const connection = Base.connection as AbstractAdapter;

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
  });
});
