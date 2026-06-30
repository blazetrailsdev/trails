/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_adapter_test.rb
 *
 * Faithful, word-for-word port: describe/it names match the Rails test method
 * names verbatim and the bodies reproduce the Rails assertions. trails-only
 * extensions (fabricated translate_exception coverage, DDL error-translation
 * probes, the empty-result-set guard, extended timezone re-sync) live in the
 * sibling mysql2-adapter.trails.test.ts.
 *
 * Tracked deviations (RFC 0023 surfaced-deviations,
 * converge-mysql2-adapter-rails-port follow-ups):
 *   - test_connection_error / test_reconnection_error assert
 *     `error.connection_pool` is a NullPool. A standalone trails adapter
 *     carries a ConnectionPool (pool-config.ts `get pool`), never NullPool, so
 *     those two cases are deferred rather than bent.
 *   - The FK type-mismatch tests build their fixture tables via raw DDL with
 *     Rails' own table names (old_cars: int PK, cars: bigint PK,
 *     subscribers: varchar nick PK) instead of `add_reference` /
 *     `add_foreign_key`: trails' `addReference` defaults the ref column to
 *     :integer (Rails defaults to :bigint), and the canonical `old_cars`
 *     widens its PK to bigint, so neither path reproduces the
 *     integer-vs-bigint mismatch the test exercises. The error message,
 *     cause, and MismatchedForeignKey class are asserted faithfully.
 */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysql,
  isMariaDb,
  Mysql2Adapter,
  MYSQL_TEST_URL,
  withDbWarningsAction,
} from "../abstract-mysql-adapter/test-helper.js";
import { withTimezoneConfig } from "../../test-helper.js";
import {
  AdapterTimeout,
  MismatchedForeignKey,
  QueryAborted,
  StatementTimeout,
} from "../../errors.js";
import { AbstractMysqlAdapter } from "../../connection-adapters/abstract-mysql-adapter.js";
import { Result } from "../../result.js";
import * as Arel from "@blazetrails/arel";

describeIfMysql("Mysql2AdapterTest", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    // Restore any console / logger spies installed by the warning-handler
    // tests so a throw before the inner mockRestore() can't leak the stub
    // into subsequent suites.
    vi.restoreAllMocks();
    await adapter.close();
  });

  it("mysql2 default prepared statements", () => {
    // Instantiate with _fakeConnection:true to skip pool creation — mirrors
    // Rails' fake_connection constructor path.
    const fakeAdapter = new Mysql2Adapter({ _fakeConnection: true });
    expect(fakeAdapter.preparedStatements).toBe(false);
  });

  it("exec query with prepared statements", async () => {
    const result = await adapter.execQuery("SELECT 1", "SQL", [], { prepare: true });
    expect(result).toBeInstanceOf(Result);
    expect(result.toArray()).toEqual([{ "1": 1 }]);
  });

  it("exec query nothing raises with no result queries", async () => {
    await adapter.executeMutation("CREATE TABLE IF NOT EXISTS `ex` (`number` INT) ENGINE=InnoDB");
    try {
      await expect(
        adapter.execQuery("INSERT INTO `ex` (number) VALUES (1)"),
      ).resolves.toBeInstanceOf(Result);
      await expect(adapter.execQuery("DELETE FROM `ex` WHERE number = 1")).resolves.toBeInstanceOf(
        Result,
      );
    } finally {
      await adapter.executeMutation("DROP TABLE IF EXISTS `ex`");
    }
  });

  it("database exists returns false if database does not exist", async () => {
    const url = new URL(MYSQL_TEST_URL);
    url.pathname = "/inexistent_activerecord_unittest";
    const exists = await Mysql2Adapter.databaseExists(url.toString());
    expect(exists).toBe(false);
  });

  it("database exists returns true when the database exists", async () => {
    const exists = await Mysql2Adapter.databaseExists(MYSQL_TEST_URL);
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
    const prevEngine = Arel.Table.engine;
    Arel.Table.engine = null; // should not rely on the global Arel::Table.engine
    try {
      const order = new Arel.Nodes.Descending(Arel.sql("posts.created_at"));
      expect(adapter.columnsForDistinct("posts.id", [order])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    } finally {
      Arel.Table.engine = prevEngine;
    }
  });

  // FK type-mismatch fixture tables — created/dropped around each test so the
  // FK tests are self-contained, with Rails' own table names and PK types:
  //   old_cars    — integer PK  (Rails: `create_table :old_cars, id: :integer`)
  //   cars        — bigint PK   (Rails: `create_table :cars`)
  //   subscribers — varchar PK  (Rails: `create_table :subscribers, id: false` w/ nick)
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
    expect(error.connectionPool).toBe(adapter.pool);
  });

  // Rails: `skip "MariaDB does not return mismatched foreign key in error message" if @conn.mariadb?`
  it.skipIf(isMariaDb)(
    "errors for multiple fks on mismatched types for pk table in alter table",
    async () => {
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
      expect(error.connectionPool).toBe(adapter.pool);
    },
  );

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
    expect(error.connectionPool).toBe(adapter.pool);
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
    expect(error.connectionPool).toBe(adapter.pool);
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
    expect(error.connectionPool).toBe(adapter.pool);
  });

  it("read timeout exception", () => {
    // The node-mysql2 driver surfaces a read_timeout-tripped query as an Error
    // with code 'PROTOCOL_SEQUENCE_TIMEOUT' and no MySQL errno. Fabricate the
    // same shape and feed it through translateException to assert the mapping
    // onto AdapterTimeout (a QueryAborted), mirroring Rails' assert_kind_of.
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
    expect((translated as AdapterTimeout).connectionPool).toBe(adapter.pool);
  });

  it("statement timeout error codes", () => {
    // ER_QUERY_TIMEOUT and ER_FILSORT_ABORT both map to StatementTimeout.
    for (const errno of [
      AbstractMysqlAdapter.ER_QUERY_TIMEOUT,
      AbstractMysqlAdapter.ER_FILSORT_ABORT,
    ]) {
      const driverErr = Object.assign(new Error("fail"), { errno });
      const translated = adapter.translateException(driverErr, { sql: "SELECT 1", binds: [] });
      expect(translated).toBeInstanceOf(StatementTimeout);
      expect((translated as StatementTimeout).cause).toBe(driverErr);
      expect((translated as StatementTimeout).connectionPool).toBe(adapter.pool);
    }
  });

  it("database timezone changes synced to connection", async () => {
    // Mirrors test_database_timezone_changes_synced_to_connection: with the
    // default timezone flipped to :local, executing a statement re-syncs the
    // connection's database_timezone from :utc to :local.
    await adapter.execute("SELECT 1");
    expect(adapter.databaseTimezone).toBe("utc");
    await withTimezoneConfig({ default: "local" }, async () => {
      await adapter.execute("SELECT 1");
      expect(adapter.databaseTimezone).toBe("local");
    });
    await adapter.execute("SELECT 1");
    expect(adapter.databaseTimezone).toBe("utc");
  });

  it("warnings do not change returned value of exec update", async () => {
    // Pin a single pool connection via beginTransaction so SET SESSION
    // sql_mode='' carries over to the warning-producing UPDATE (DDL on MySQL
    // auto-commits, so the table persists even on rollback). Capture sql_mode
    // up front and restore it in `finally` (mirrors Rails' ensure): session
    // variables are NOT transactional, so rollback() would otherwise leak the
    // weakened sql_mode onto the pooled connection.
    const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
    await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`);
    await adapter.beginTransaction();
    try {
      await adapter.executeMutation(
        `CREATE TABLE warn_posts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
      );
      await adapter.executeMutation(`SET SESSION sql_mode=''`);
      await adapter.executeMutation(`INSERT INTO warn_posts (title) VALUES ('Title')`);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await withDbWarningsAction("log", async () => {
        // `id > (0+'foo')` triggers a "Truncated incorrect DOUBLE value" warning;
        // under db_warnings_action=:log that warning is logged, not raised, and
        // must not corrupt the affected-row count returned by executeMutation.
        const affected = await adapter.executeMutation(
          `UPDATE warn_posts SET title = 'Updated' WHERE id > (0+'foo') LIMIT 1`,
        );
        expect(affected).toBe(1);
      });
    } finally {
      // Restore on the still-pinned connection before rollback releases it.
      await adapter.executeMutation(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollback().catch(() => {});
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`).catch(() => {});
    }
  });

  it("warnings do not change returned value of exec delete", async () => {
    // Capture/restore sql_mode (mirrors Rails' ensure) — session variables are
    // not transactional, so rollback() does not revert SET SESSION.
    const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
    await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts_d`);
    await adapter.beginTransaction();
    try {
      await adapter.executeMutation(
        `CREATE TABLE warn_posts_d (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
      );
      await adapter.executeMutation(`SET SESSION sql_mode=''`);
      await adapter.executeMutation(`INSERT INTO warn_posts_d (title) VALUES ('Title')`);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await withDbWarningsAction("log", async () => {
        const affected = await adapter.executeMutation(
          `DELETE FROM warn_posts_d WHERE id > (0+'foo') LIMIT 1`,
        );
        expect(affected).toBe(1);
      });
    } finally {
      await adapter.executeMutation(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollback().catch(() => {});
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts_d`).catch(() => {});
    }
  });
});
