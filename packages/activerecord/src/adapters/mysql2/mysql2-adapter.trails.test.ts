import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
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
import { Base } from "../../base.js";

describe("Mysql2Adapter#translateException (fabricated errors)", () => {
  let adapter: Mysql2Adapter;
  beforeEach(() => {
    adapter = new Mysql2Adapter({ _fakeConnection: true });
  });
  afterEach(async () => {
    await adapter.close().catch(() => {});
  });

  it("active is false for a never-connected / fake adapter", async () => {
    expect(await adapter.active()).toBe(false);
    expect(adapter.isConnected()).toBe(false);
    const fresh = new Mysql2Adapter(MYSQL_TEST_URL);
    expect(await fresh.active()).toBe(false);
    expect(fresh.isConnected()).toBe(false);
  });

  it("translates connection-loss errnos to ConnectionFailed", () => {
    for (const errno of [
      AbstractMysqlAdapter.ER_CONNECTION_KILLED,
      AbstractMysqlAdapter.ER_SERVER_SHUTDOWN,
      AbstractMysqlAdapter.CR_SERVER_GONE_ERROR,
      AbstractMysqlAdapter.CR_SERVER_LOST,
      AbstractMysqlAdapter.ER_CLIENT_INTERACTION_TIMEOUT,
    ]) {
      const driverErr = Object.assign(new Error("conn lost"), { errno });
      const translated = adapter.translateExceptionClass(driverErr, "SELECT 1", []);
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
      const translated = adapter.translateExceptionClass(driverErr, "SELECT 1", []);
      expect(translated).toBeInstanceOf(klass);
      expect((translated as Error & { cause?: unknown }).cause).toBe(driverErr);
    }
  });

  it("promotes 'MySQL client is not connected' to ConnectionNotEstablished", () => {
    const codedErr = Object.assign(new Error("MySQL client is not connected"), {
      code: "PROTOCOL_CONNECTION_LOST",
    });
    expect(adapter.translateExceptionClass(codedErr, "SELECT 1", [])).toBeInstanceOf(
      ConnectionNotEstablished,
    );
    const plainErr = new Error("MySQL client is not connected");
    expect(adapter.translateExceptionClass(plainErr, "SELECT 1", [])).toBeInstanceOf(
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
      const translated = adapter.translateExceptionClass(driverErr, "SELECT 1", []);
      expect(translated).toBeInstanceOf(ConnectionFailed);
    }
  });
});

describeIfMysqlAdapter("Mysql2Adapter (trails extensions)", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("#active sync getter reflects connection state", () => {
    it("is false before any connection and true after the first query", async () => {
      const fresh = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        expect(await fresh.active()).toBe(false);
        expect(fresh.isConnected()).toBe(false);
        await fresh.execQuery("SELECT 1");
        expect(await fresh.active()).toBe(true);
        expect(fresh.isConnected()).toBe(true);
        fresh.disconnectBang();
        expect(await fresh.active()).toBe(false);
        expect(fresh.isConnected()).toBe(false);
      } finally {
        await fresh.close();
      }
    });
  });

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
      const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
      await adapter.beginTransaction({ _lazy: false });
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
        await adapter.rollbackTransaction().catch(() => {});
      }
    });
  });

  it("#exec_query queries with an empty result set still return the columns", async () => {
    const result = await adapter.execQuery("SELECT * FROM subscribers WHERE 1=0");
    expect(result).toBeInstanceOf(Result);
    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual(["nick", "name", "id", "books_count", "update_count"]);
  });

  it("database timezone changes synced to connection (extended re-sync paths)", async () => {
    await adapter.execute("SELECT 1");
    expect(adapter._databaseTimezone).toBe("utc");
    await withTimezoneConfig({ default: "local" }, async () => {
      adapter._databaseTimezone = "utc";
      await adapter.execQuery("SELECT 1");
      expect(adapter._databaseTimezone).toBe("local");
      adapter._databaseTimezone = "utc";
      await adapter.executeMutation("DO 1");
      expect(adapter._databaseTimezone).toBe("local");
      adapter._databaseTimezone = "utc";
      await adapter.execute("DO 1");
      expect(adapter._databaseTimezone).toBe("local");
      adapter._databaseTimezone = "utc";
      await adapter.explain("SELECT 1");
      expect(adapter._databaseTimezone).toBe("local");
    });
    await adapter.execute("SELECT 1");
    expect(adapter._databaseTimezone).toBe("utc");
  });

  it("configure connection seeds database timezone from default", async () => {
    adapter._databaseTimezone = "utc";
    await withTimezoneConfig({ default: "local" }, async () => {
      await adapter.configureConnection();
      expect(adapter._databaseTimezone).toBe("local");
    });
    await withTimezoneConfig({ default: "utc" }, async () => {
      await adapter.configureConnection();
      expect(adapter._databaseTimezone).toBe("utc");
    });
  });

  it("warnings handler actually fires on exec update", async () => {
    const previousLogger = Base.logger;
    const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
    await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`);
    await adapter.beginTransaction({ _lazy: false });
    try {
      await adapter.executeMutation(
        `CREATE TABLE warn_posts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
      );
      await adapter.executeMutation(`SET SESSION sql_mode=''`);
      await adapter.executeMutation(`INSERT INTO warn_posts (title) VALUES ('Title')`);
      const logger = { warn: vi.fn() };
      Base.logger = logger as never;
      await withDbWarningsAction("log", async () => {
        await adapter.executeMutation(
          `UPDATE warn_posts SET title = 'Updated' WHERE id > (0+'foo') LIMIT 1`,
        );
      });
      expect(logger.warn).toHaveBeenCalled();
    } finally {
      await adapter.executeMutation(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollbackTransaction().catch(() => {});
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`).catch(() => {});
      Base.logger = previousLogger;
    }
  });
});
