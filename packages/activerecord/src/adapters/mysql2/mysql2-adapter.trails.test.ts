/**
 * trails-only cases with no counterpart in Rails'
 * activerecord/test/cases/adapters/mysql2/mysql2_adapter_test.rb.
 *
 * The Rails-faithful mirror lives in mysql2-adapter.test.ts; anything here is
 * a trails-specific extension (fabricated translate_exception coverage that
 * needs no live server, DDL-driven error-translation probes drawn from the
 * abstract-adapter suite, the empty-result-set column-reporting guard, and the
 * extended database-timezone re-sync assertions) — kept out of the mirror so
 * test:compare maps cleanly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
  withDbWarningsAction,
} from "../abstract-mysql-adapter/test-helper.js";
import { withTimezoneConfig } from "../../test-helper.js";
import {
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseAlreadyExists,
  Deadlocked,
  InvalidForeignKey,
  LockWaitTimeout,
  NotNullViolation,
  QueryCanceled,
  RangeError as ARRangeError,
  RecordNotUnique,
  ValueTooLong,
} from "../../errors.js";
import { AbstractMysqlAdapter } from "../../connection-adapters/abstract-mysql-adapter.js";
import { Result } from "../../result.js";

// Fabricated-error translate_exception checks. These don't touch a live
// MySQL server (they feed Object.assign(new Error(...), { errno/code })
// straight into translateException), so they live outside describeIfMysql
// to keep coverage on dev machines without MySQL installed.
describe("Mysql2Adapter#translateException (fabricated errors)", () => {
  let adapter: Mysql2Adapter;
  beforeEach(() => {
    adapter = new Mysql2Adapter({ _fakeConnection: true });
  });
  afterEach(async () => {
    await adapter.close().catch(() => {});
  });

  it("translates connection-loss errnos to ConnectionFailed", () => {
    // Mirrors AbstractMysqlAdapter#translate_exception cases for
    // ER_CONNECTION_KILLED / ER_SERVER_SHUTDOWN / CR_SERVER_GONE_ERROR /
    // CR_SERVER_LOST / ER_CLIENT_INTERACTION_TIMEOUT.
    for (const errno of [
      AbstractMysqlAdapter.ER_CONNECTION_KILLED,
      AbstractMysqlAdapter.ER_SERVER_SHUTDOWN,
      AbstractMysqlAdapter.CR_SERVER_GONE_ERROR,
      AbstractMysqlAdapter.CR_SERVER_LOST,
      AbstractMysqlAdapter.ER_CLIENT_INTERACTION_TIMEOUT,
    ]) {
      const driverErr = Object.assign(new Error("conn lost"), { errno });
      const translated = adapter.translateException(driverErr, { sql: "SELECT 1", binds: [] });
      expect(translated).toBeInstanceOf(ConnectionFailed);
      expect((translated as ConnectionFailed).cause).toBe(driverErr);
    }
  });

  it("translates ER_LOCK_DEADLOCK / ER_LOCK_WAIT_TIMEOUT / ER_QUERY_INTERRUPTED / ER_OUT_OF_RANGE / ER_DB_CREATE_EXISTS", () => {
    const cases: Array<
      [
        number,
        (
          | typeof Deadlocked
          | typeof LockWaitTimeout
          | typeof QueryCanceled
          | typeof ARRangeError
          | typeof DatabaseAlreadyExists
        ),
      ]
    > = [
      [AbstractMysqlAdapter.ER_LOCK_DEADLOCK, Deadlocked],
      [AbstractMysqlAdapter.ER_LOCK_WAIT_TIMEOUT, LockWaitTimeout],
      [AbstractMysqlAdapter.ER_QUERY_INTERRUPTED, QueryCanceled],
      [AbstractMysqlAdapter.ER_OUT_OF_RANGE, ARRangeError],
      [AbstractMysqlAdapter.ER_DB_CREATE_EXISTS, DatabaseAlreadyExists],
    ];
    for (const [errno, klass] of cases) {
      const driverErr = Object.assign(new Error("fail"), { errno });
      const translated = adapter.translateException(driverErr, { sql: "SELECT 1", binds: [] });
      expect(translated).toBeInstanceOf(klass);
      expect((translated as Error & { cause?: unknown }).cause).toBe(driverErr);
    }
  });

  it("promotes 'MySQL client is not connected' to ConnectionNotEstablished", () => {
    // Mirrors Mysql2Adapter#translate_exception's ConnectionError branch
    // AND AbstractMysqlAdapter#translate_exception's `when nil` branch.
    const codedErr = Object.assign(new Error("MySQL client is not connected"), {
      code: "PROTOCOL_CONNECTION_LOST",
    });
    expect(adapter.translateException(codedErr, { sql: "SELECT 1", binds: [] })).toBeInstanceOf(
      ConnectionNotEstablished,
    );
    const plainErr = new Error("MySQL client is not connected");
    expect(adapter.translateException(plainErr, { sql: "SELECT 1", binds: [] })).toBeInstanceOf(
      ConnectionNotEstablished,
    );
  });

  it("translates node-mysql2 connection codes to ConnectionFailed", () => {
    for (const code of [
      "PROTOCOL_CONNECTION_LOST",
      "PROTOCOL_ENQUEUE_AFTER_QUIT",
      "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
      "PROTOCOL_ENQUEUE_HANDSHAKE_TWICE",
      "POOL_CLOSED",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EPIPE",
    ]) {
      const driverErr = Object.assign(new Error("connection lost"), { code });
      const translated = adapter.translateException(driverErr, { sql: "SELECT 1", binds: [] });
      expect(translated).toBeInstanceOf(ConnectionFailed);
    }
  });
});

describeIfMysql("Mysql2Adapter (trails extensions)", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close();
  });

  // Rails: activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_adapter_test.rb
  // translate_exception tests. Matches the PG adapter's equivalent suite.
  describe("translate_exception", () => {
    beforeEach(async () => {
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_child`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_parent`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_uniq`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_notnull`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_long`);
    });

    it("translates ER_DUP_ENTRY to RecordNotUnique", async () => {
      await adapter.executeMutation(
        `CREATE TABLE ex_uniq (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(20) UNIQUE)`,
      );
      await adapter.executeMutation(`INSERT INTO ex_uniq (name) VALUES ('Alice')`);
      await expect(
        adapter.executeMutation(`INSERT INTO ex_uniq (name) VALUES ('Alice')`),
      ).rejects.toBeInstanceOf(RecordNotUnique);
    });

    it("translates ER_NO_REFERENCED_ROW_2 to InvalidForeignKey", async () => {
      await adapter.executeMutation(
        `CREATE TABLE ex_parent (id INT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB`,
      );
      await adapter.executeMutation(
        `CREATE TABLE ex_child (id INT AUTO_INCREMENT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES ex_parent(id)) ENGINE=InnoDB`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO ex_child (parent_id) VALUES (999)`),
      ).rejects.toBeInstanceOf(InvalidForeignKey);
    });

    it("translates ER_NOT_NULL_VIOLATION to NotNullViolation", async () => {
      await adapter.executeMutation(
        `CREATE TABLE ex_notnull (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(20) NOT NULL)`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO ex_notnull (name) VALUES (NULL)`),
      ).rejects.toBeInstanceOf(NotNullViolation);
    });

    it("translates ER_DATA_TOO_LONG to ValueTooLong", async () => {
      // sql_mode is session-scoped, and our mysql2-adapter's pool checks
      // out / releases a connection per call — so a plain SET SESSION
      // wouldn't carry over to the CREATE + INSERT below. Pin a single
      // pool connection via beginTransaction so all three statements
      // run on the same session. (DDL in MySQL auto-commits, so the
      // table persists even though we roll back the transaction.)
      // Session variables aren't transactional, so rollback() won't revert the
      // SET SESSION below — capture and restore sql_mode explicitly.
      const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
      await adapter.beginTransaction();
      try {
        await adapter.executeMutation(
          `SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES')`,
        );
        await adapter.executeMutation(
          `CREATE TABLE ex_long (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(5))`,
        );
        await expect(
          adapter.executeMutation(`INSERT INTO ex_long (name) VALUES ('toolongvalue')`),
        ).rejects.toBeInstanceOf(ValueTooLong);
      } finally {
        await adapter.executeMutation(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
        await adapter.rollback().catch(() => {});
      }
    });
  });

  it("#exec_query queries with an empty result set still return the columns", async () => {
    // Mirrors adapter_test.rb: a zero-row SELECT must still report its
    // columns from the field descriptors, not collapse to an empty Result.
    // Rails runs this against the canonical `subscribers` fixture table; the
    // describeIfMysql suite does not bootstrap the canonical schema, so seed
    // the real `subscribers` table with its exact schema.rb shape (id: false;
    // nick/name/id/books_count/update_count; unique index on nick) before the
    // probe rather than inventing a scratch table name.
    await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");
    await adapter.executeMutation(
      "CREATE TABLE `subscribers` (" +
        "`nick` VARCHAR(255) NOT NULL, " +
        "`name` VARCHAR(255), " +
        "`id` INT, " +
        "`books_count` INT NOT NULL DEFAULT 0, " +
        "`update_count` INT NOT NULL DEFAULT 0, " +
        "UNIQUE KEY `index_subscribers_on_nick` (`nick`)" +
        ") ENGINE=InnoDB",
    );
    try {
      const result = await adapter.execQuery("SELECT * FROM subscribers WHERE 1=0");
      expect(result).toBeInstanceOf(Result);
      expect(result.rows).toEqual([]);
      expect(result.columns).toEqual(["nick", "name", "id", "books_count", "update_count"]);
    } finally {
      await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");
    }
  });

  it("database timezone changes synced to connection (extended re-sync paths)", async () => {
    // Extends Rails' test_database_timezone_changes_synced_to_connection: the
    // mirror only checks execute(); here we guard that every perform-query path
    // (execQuery / executeMutation / exec / explain) re-syncs the timezone too.
    await adapter.execute("SELECT 1");
    expect(adapter.databaseTimezone).toBe("utc");
    await withTimezoneConfig({ default: "local" }, async () => {
      adapter.databaseTimezone = "utc";
      await adapter.execQuery("SELECT 1");
      expect(adapter.databaseTimezone).toBe("local");
      adapter.databaseTimezone = "utc";
      await adapter.executeMutation("DO 1");
      expect(adapter.databaseTimezone).toBe("local");
      adapter.databaseTimezone = "utc";
      await adapter.exec("DO 1");
      expect(adapter.databaseTimezone).toBe("local");
      adapter.databaseTimezone = "utc";
      await adapter.explain("SELECT 1");
      expect(adapter.databaseTimezone).toBe("local");
    });
    await adapter.execute("SELECT 1");
    expect(adapter.databaseTimezone).toBe("utc");
  });

  it("configure connection seeds database timezone from default", async () => {
    // Mirrors Rails' `Mysql2Adapter#configure_connection` which assigns
    // `@raw_connection.query_options[:database_timezone] = default_timezone`
    // up front. Asserts the seed lands immediately — the per-query re-sync
    // is covered by the mirror's timezone test.
    adapter.databaseTimezone = "utc";
    await withTimezoneConfig({ default: "local" }, () => {
      adapter.configureConnection();
      expect(adapter.databaseTimezone).toBe("local");
    });
    await withTimezoneConfig({ default: "utc" }, () => {
      adapter.configureConnection();
      expect(adapter.databaseTimezone).toBe("utc");
    });
  });

  it("warnings handler actually fires on exec update", async () => {
    // Guards that the warning handler is wired into executeMutation — the
    // Rails mirror only asserts the returned row count is unaffected; this
    // extension asserts the warning was actually surfaced (regression catch).
    // Capture/restore sql_mode (mirrors Rails' ensure) — session variables are
    // not transactional, so rollback() does not revert SET SESSION.
    const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
    await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`);
    await adapter.beginTransaction();
    try {
      await adapter.executeMutation(
        `CREATE TABLE warn_posts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
      );
      await adapter.executeMutation(`SET SESSION sql_mode=''`);
      await adapter.executeMutation(`INSERT INTO warn_posts (title) VALUES ('Title')`);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await withDbWarningsAction("log", async () => {
        await adapter.executeMutation(
          `UPDATE warn_posts SET title = 'Updated' WHERE id > (0+'foo') LIMIT 1`,
        );
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      await adapter.executeMutation(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollback().catch(() => {});
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`).catch(() => {});
    }
  });
});
