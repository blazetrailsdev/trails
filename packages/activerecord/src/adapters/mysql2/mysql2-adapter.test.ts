/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_adapter_test.rb
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
  AdapterTimeout,
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseAlreadyExists,
  Deadlocked,
  InvalidForeignKey,
  LockWaitTimeout,
  MismatchedForeignKey,
  NotNullViolation,
  QueryAborted,
  QueryCanceled,
  RangeError as ARRangeError,
  RecordNotUnique,
  StatementTimeout,
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
    const cases: Array<[number, new (...a: any[]) => Error]> = [
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

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    // Restore any console / logger spies installed by the warning-handler
    // tests so a throw before the inner mockRestore() can't leak the stub
    // into subsequent suites — matches the cleanup pattern in
    // adapters/abstract-mysql-adapter/warnings.test.ts.
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
        await adapter.rollback();
      }
    });
  });

  describe("Mysql2AdapterTest", () => {
    it("mysql2 default prepared statements", () => {
      // Mirrors: test_mysql2_default_prepared_statements
      // Instantiate with _fakeConnection:true to skip pool creation — mirrors
      // Rails' fake_connection constructor path.
      const fakeAdapter = new Mysql2Adapter({ _fakeConnection: true });
      expect(fakeAdapter.preparedStatements).toBe(false);
    });
    it("exec query with prepared statements", async () => {
      // Mirrors: test_exec_query_with_prepared_statements
      const result = await adapter.execQuery("SELECT 1", "SQL", [], { prepare: true });
      expect(result).toBeInstanceOf(Result);
      expect(result.toArray()).toEqual([{ "1": 1 }]);
    });
    it("exec query nothing raises with no result queries", async () => {
      // Mirrors: test_exec_query_nothing_raises_with_no_result_queries
      await adapter.executeMutation("CREATE TABLE IF NOT EXISTS `ex` (`number` INT) ENGINE=InnoDB");
      try {
        await expect(
          adapter.execQuery("INSERT INTO `ex` (number) VALUES (1)"),
        ).resolves.toBeInstanceOf(Result);
        await expect(
          adapter.execQuery("DELETE FROM `ex` WHERE number = 1"),
        ).resolves.toBeInstanceOf(Result);
      } finally {
        await adapter.executeMutation("DROP TABLE IF EXISTS `ex`");
      }
    });
    it("database exists returns false if database does not exist", async () => {
      // Mirrors: test_database_exists_returns_false_if_database_does_not_exist
      const url = new URL(MYSQL_TEST_URL);
      url.pathname = "/inexistent_activerecord_unittest";
      const exists = await Mysql2Adapter.databaseExists(url.toString());
      expect(exists).toBe(false);
    });
    it("database exists returns true when the database exists", async () => {
      // Mirrors: test_database_exists_returns_true_when_the_database_exists
      const exists = await Mysql2Adapter.databaseExists(MYSQL_TEST_URL);
      expect(exists).toBe(true);
    });

    // FK type-mismatch fixture tables — created/dropped around each test so
    // the FK tests are self-contained. beforeEach/afterEach live directly in
    // Mysql2AdapterTest so test paths match Rails (no extra describe level).
    // Mirrors Rails: test/cases/adapters/mysql2/mysql2_adapter_test.rb:136–270
    //
    //   old_cars    — integer PK  (Rails' old_cars fixture)
    //   cars        — bigint PK   (Rails' cars fixture)
    //   subscribers — varchar PK  (Rails' subscribers fixture)
    //   engines     — bigint PK, used as the referencing table
    beforeEach(async () => {
      await adapter.executeMutation("DROP TABLE IF EXISTS `engines`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `old_cars`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `cars`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");
      await adapter.executeMutation(
        "CREATE TABLE `old_cars` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB",
      );
      await adapter.executeMutation(
        "CREATE TABLE `cars` (`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB",
      );
      await adapter.executeMutation(
        "CREATE TABLE `subscribers` (`nick` VARCHAR(255) NOT NULL PRIMARY KEY) ENGINE=InnoDB",
      );
      await adapter.executeMutation(
        "CREATE TABLE `engines` (`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, `old_car_id` BIGINT) ENGINE=InnoDB",
      );
    });

    afterEach(async () => {
      await adapter.executeMutation("DROP TABLE IF EXISTS `engines`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `foos`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `old_cars`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `cars`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");
    });

    it("errors for bigint fks on integer pk table in alter table", async () => {
      // engines.old_car_id is BIGINT but old_cars.id is INT — type mismatch
      const error = await adapter
        .executeMutation(
          "ALTER TABLE `engines` ADD CONSTRAINT `fk_test` FOREIGN KEY (`old_car_id`) REFERENCES `old_cars` (`id`)",
        )
        .then(() => null)
        .catch((e) => e);

      expect(error).toBeInstanceOf(MismatchedForeignKey);
      expect(error.message).toMatch(
        /Column `old_car_id` on table `engines` does not match column `id` on `old_cars`/,
      );
      expect(error.message).toMatch(/which has type `int/i);
      expect(error.message).toMatch(
        /To resolve this issue, change the type of the `old_car_id` column on `engines` to be :integer/,
      );
      expect(error.cause).toBeInstanceOf(Error);
    });

    it("errors for multiple fks on mismatched types for pk table in alter table", async () => {
      // MariaDB does not include mismatched FK details in error message
      const isMariaDb = adapter.isMariadb();
      if (isMariaDb) return;

      // Add matching FK first (cars.id is BIGINT, engines.id is BIGINT — OK)
      await adapter.executeMutation(
        "ALTER TABLE `engines` ADD COLUMN `car_id` BIGINT, ADD CONSTRAINT `fk_car` FOREIGN KEY (`car_id`) REFERENCES `cars` (`id`)",
      );

      // Then add mismatched FK (old_cars.id is INT but old_car_id is BIGINT)
      const error = await adapter
        .executeMutation(
          "ALTER TABLE `engines` ADD CONSTRAINT `fk_old_car` FOREIGN KEY (`old_car_id`) REFERENCES `old_cars` (`id`)",
        )
        .then(() => null)
        .catch((e) => e);

      expect(error).toBeInstanceOf(MismatchedForeignKey);
      expect(error.message).toMatch(
        /Column `old_car_id` on table `engines` does not match column `id` on `old_cars`/,
      );
      expect(error.message).toMatch(/which has type `int/i);
      expect(error.cause).toBeInstanceOf(Error);
    });

    it("errors for bigint fks on integer pk table in create table", async () => {
      // foos.old_car_id is BIGINT but old_cars.id is INT
      const error = await adapter
        .executeMutation(
          `
            CREATE TABLE \`foos\` (
              \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              \`old_car_id\` BIGINT,
              INDEX \`idx_old_car_id\` (\`old_car_id\`),
              CONSTRAINT \`fk_foos_old_car\` FOREIGN KEY (\`old_car_id\`) REFERENCES \`old_cars\` (\`id\`)
            ) ENGINE=InnoDB
          `,
        )
        .then(() => null)
        .catch((e) => e);

      expect(error).toBeInstanceOf(MismatchedForeignKey);
      expect(error.message).toMatch(
        /Column `old_car_id` on table `foos` does not match column `id` on `old_cars`/,
      );
      expect(error.message).toMatch(/which has type `int/i);
      expect(error.message).toMatch(
        /To resolve this issue, change the type of the `old_car_id` column on `foos` to be :integer/,
      );
      expect(error.cause).toBeInstanceOf(Error);
    });

    it("errors for integer fks on bigint pk table in create table", async () => {
      // foos.car_id is INT but cars.id is BIGINT
      const error = await adapter
        .executeMutation(
          `
            CREATE TABLE \`foos\` (
              \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              \`car_id\` INT,
              INDEX \`idx_car_id\` (\`car_id\`),
              CONSTRAINT \`fk_foos_car\` FOREIGN KEY (\`car_id\`) REFERENCES \`cars\` (\`id\`)
            ) ENGINE=InnoDB
          `,
        )
        .then(() => null)
        .catch((e) => e);

      expect(error).toBeInstanceOf(MismatchedForeignKey);
      expect(error.message).toMatch(
        /Column `car_id` on table `foos` does not match column `id` on `cars`/,
      );
      expect(error.message).toMatch(/which has type `bigint/i);
      expect(error.message).toMatch(
        /To resolve this issue, change the type of the `car_id` column on `foos` to be :bigint/,
      );
      expect(error.cause).toBeInstanceOf(Error);
    });

    it("errors for bigint fks on string pk table in create table", async () => {
      // foos.subscriber_id is BIGINT but subscribers.nick is VARCHAR
      const error = await adapter
        .executeMutation(
          `
            CREATE TABLE \`foos\` (
              \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              \`subscriber_id\` BIGINT,
              INDEX \`idx_subscriber_id\` (\`subscriber_id\`),
              CONSTRAINT \`fk_foos_subscriber\` FOREIGN KEY (\`subscriber_id\`) REFERENCES \`subscribers\` (\`nick\`)
            ) ENGINE=InnoDB
          `,
        )
        .then(() => null)
        .catch((e) => e);

      expect(error).toBeInstanceOf(MismatchedForeignKey);
      expect(error.message).toMatch(
        /Column `subscriber_id` on table `foos` does not match column `nick` on `subscribers`/,
      );
      expect(error.message).toMatch(/which has type `varchar/i);
      expect(error.message).toMatch(
        /To resolve this issue, change the type of the `subscriber_id` column on `foos` to be :string/,
      );
      expect(error.cause).toBeInstanceOf(Error);
    });

    it("read timeout exception", () => {
      // Mirrors: test_read_timeout_exception. The node-mysql2 driver surfaces
      // a read_timeout-tripped query as an Error with code
      // 'PROTOCOL_SEQUENCE_TIMEOUT' and no MySQL errno. Fabricate the same
      // shape and feed it through translateException to assert the mapping.
      const driverErr = Object.assign(new Error("read ETIMEDOUT"), {
        code: "PROTOCOL_SEQUENCE_TIMEOUT",
      });
      const translated = adapter.translateException(driverErr, {
        sql: "SELECT SLEEP(2)",
        binds: [],
      });
      expect(translated).toBeInstanceOf(AdapterTimeout);
      expect(translated).toBeInstanceOf(QueryAborted);
      expect((translated as AdapterTimeout).cause).toBe(driverErr);
      expect((translated as AdapterTimeout).sql).toBe("SELECT SLEEP(2)");
    });
    it("statement timeout error codes", () => {
      // Mirrors: test_statement_timeout_error_codes. ER_QUERY_TIMEOUT (3024)
      // and ER_FILSORT_ABORT (1028) both map to StatementTimeout.
      for (const errno of [
        AbstractMysqlAdapter.ER_QUERY_TIMEOUT,
        AbstractMysqlAdapter.ER_FILSORT_ABORT,
      ]) {
        const driverErr = Object.assign(new Error("fail"), { errno });
        const translated = adapter.translateException(driverErr, {
          sql: "SELECT 1",
          binds: [],
        });
        expect(translated).toBeInstanceOf(StatementTimeout);
        expect(translated).toBeInstanceOf(QueryAborted);
        expect((translated as StatementTimeout).cause).toBe(driverErr);
      }
    });
    it("database timezone changes synced to connection", async () => {
      // Mirrors: test_database_timezone_changes_synced_to_connection. The Ruby
      // mysql2 driver carries `query_options[:database_timezone]` on the raw
      // socket; trails surfaces the same via `adapter.databaseTimezone`,
      // re-synced from the global default in the perform-query path so a
      // runtime `withTimezoneConfig` flip takes effect on the next statement.
      await adapter.execute("SELECT 1");
      expect(adapter.databaseTimezone).toBe("utc");
      await withTimezoneConfig({ default: "local" }, async () => {
        await adapter.execute("SELECT 1");
        expect(adapter.databaseTimezone).toBe("local");
        // execQuery and executeMutation are also on the perform-query path
        // and must re-sync — guard against accidental removal.
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

    it("warnings do not change returned value of exec update", async () => {
      // Mirrors: test_warnings_do_not_change_returned_value_of_exec_update.
      // Pin a single pool connection via beginTransaction so SET SESSION
      // sql_mode='' carries over to the warning-producing UPDATE (DDL on
      // MySQL auto-commits, so the table persists even on rollback).
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`);
      await adapter.beginTransaction();
      try {
        await adapter.executeMutation(
          `CREATE TABLE warn_posts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
        );
        await adapter.executeMutation(`SET SESSION sql_mode=''`);
        await adapter.executeMutation(`INSERT INTO warn_posts (title) VALUES ('Title')`);
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        // Spy is restored by the outer afterEach via vi.restoreAllMocks().
        await withDbWarningsAction("log", async () => {
          // `id > (0+'foo')` triggers a "Truncated incorrect DOUBLE value" warning;
          // under db_warnings_action=:log that warning is logged, not raised, and
          // must not corrupt the affected-row count returned by executeMutation.
          const affected = await adapter.executeMutation(
            `UPDATE warn_posts SET title = 'Updated' WHERE id > (0+'foo') LIMIT 1`,
          );
          expect(affected).toBe(1);
        });
        // The warning handler must have actually fired — otherwise this
        // test would silently still pass on a regression that disconnected
        // executeMutation from _handleWarningsOn.
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        await adapter.rollback().catch(() => {});
        await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`).catch(() => {});
      }
    });

    it("warnings do not change returned value of exec delete", async () => {
      // Mirrors: test_warnings_do_not_change_returned_value_of_exec_delete.
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts_d`);
      await adapter.beginTransaction();
      try {
        await adapter.executeMutation(
          `CREATE TABLE warn_posts_d (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
        );
        await adapter.executeMutation(`SET SESSION sql_mode=''`);
        await adapter.executeMutation(`INSERT INTO warn_posts_d (title) VALUES ('Title')`);
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        // Spy is restored by the outer afterEach via vi.restoreAllMocks().
        await withDbWarningsAction("log", async () => {
          const affected = await adapter.executeMutation(
            `DELETE FROM warn_posts_d WHERE id > (0+'foo') LIMIT 1`,
          );
          expect(affected).toBe(1);
        });
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        await adapter.rollback().catch(() => {});
        await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts_d`).catch(() => {});
      }
    });
  });
});
