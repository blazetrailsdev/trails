import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysqlAdapter,
  isMariaDb,
  leaseMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
  withDbWarningsAction,
} from "../abstract-mysql-adapter/test-helper.js";
import { withTimezoneConfig } from "../../test-helper.js";
import {
  AdapterTimeout,
  ConnectionNotEstablished,
  MismatchedForeignKey,
  QueryAborted,
  StatementTimeout,
} from "../../errors.js";
import { AbstractMysqlAdapter } from "../../connection-adapters/abstract-mysql-adapter.js";
import { NullPool } from "../../connection-adapters/abstract/connection-pool.js";
import { Result } from "../../result.js";
import { Base } from "../../base.js";
import { Logger } from "@blazetrails/activesupport";
import * as Arel from "@blazetrails/arel";

describeIfMysqlAdapter("Mysql2AdapterTest", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connection error", async () => {
    const badAdapter = new Mysql2Adapter({ socketPath: "/dev/null", preparedStatements: false });
    try {
      const error = await badAdapter
        .connectBang()
        .then(() => null)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConnectionNotEstablished);
      expect(error.connectionPool).toBeInstanceOf(NullPool);
    } finally {
      await badAdapter.close();
    }
  });

  it("reconnection error", async () => {
    const badAdapter = new Mysql2Adapter({ socketPath: "/dev/null", preparedStatements: false });
    try {
      const error = await badAdapter
        .reconnectBang()
        .then(() => null)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConnectionNotEstablished);
      expect(error.connectionPool).toBe(badAdapter.pool);
    } finally {
      await badAdapter.close();
    }
  });

  it("mysql2 default prepared statements", () => {
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
    Arel.Table.engine = null;
    try {
      const order = new Arel.Nodes.Descending(Arel.sql("posts.created_at"));
      expect(adapter.columnsForDistinct("posts.id", [order])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    } finally {
      Arel.Table.engine = prevEngine;
    }
  });

  it("errors for bigint fks on integer pk table in alter table", async () => {
    try {
      const error = await adapter
        .addReference("engines", "old_car")
        .then(() => adapter.addForeignKey("engines", "old_cars"))
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
    } finally {
      await adapter.executeMutation("ALTER TABLE engines DROP COLUMN old_car_id").catch(() => null);
    }
  });

  it.skipIf(isMariaDb)(
    "errors for multiple fks on mismatched types for pk table in alter table",
    async () => {
      try {
        const error = await adapter
          .addReference("engines", "person", { foreignKey: true })
          .then(() => adapter.addReference("engines", "old_car", { foreignKey: true }))
          .then(() => null)
          .catch((e) => e);

        expect(error).toBeInstanceOf(MismatchedForeignKey);
        expect(error.message).toMatch(
          /Column `old_car_id` on table `engines` does not match column `id` on `old_cars`/,
        );
        expect(error.message).toMatch(/which has type `int/i);
        expect(error.cause).toBeInstanceOf(Error);
        expect(error.connectionPool).toBe(adapter.pool);
      } finally {
        await adapter.removeReference("engines", "person");
        await adapter.removeReference("engines", "old_car");
      }
    },
  );

  it("errors for bigint fks on integer pk table in create table", async () => {
    try {
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
    } finally {
      await adapter.dropTable("foos", { ifExists: true });
    }
  });

  it("errors for integer fks on bigint pk table in create table", async () => {
    try {
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
    } finally {
      await adapter.dropTable("foos", { ifExists: true });
    }
  });

  it("errors for bigint fks on string pk table in create table", async () => {
    try {
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
    } finally {
      await adapter.dropTable("foos", { ifExists: true });
    }
  });

  it("read timeout exception", () => {
    const driverErr = Object.assign(new Error("read ETIMEDOUT"), {
      code: "PROTOCOL_SEQUENCE_TIMEOUT",
    });
    const translated = adapter.translateExceptionClass(driverErr, "SELECT SLEEP(2)", []);
    expect(translated).toBeInstanceOf(AdapterTimeout);
    expect(translated).toBeInstanceOf(QueryAborted);
    expect((translated as AdapterTimeout).cause).toBe(driverErr);
    expect((translated as AdapterTimeout).connectionPool).toBe(adapter.pool);
  });

  it("statement timeout error codes", () => {
    for (const errno of [
      AbstractMysqlAdapter.ER_QUERY_TIMEOUT,
      AbstractMysqlAdapter.ER_FILSORT_ABORT,
    ]) {
      const driverErr = Object.assign(new Error("fail"), { errno });
      const translated = adapter.translateExceptionClass(driverErr, "SELECT 1", []);
      expect(translated).toBeInstanceOf(StatementTimeout);
      expect((translated as StatementTimeout).cause).toBe(driverErr);
      expect((translated as StatementTimeout).connectionPool).toBe(adapter.pool);
    }
  });

  it("database timezone changes synced to connection", async () => {
    await adapter.execute("SELECT 1");
    expect(adapter._databaseTimezone).toBe("utc");
    await withTimezoneConfig({ default: "local" }, async () => {
      await adapter.execute("SELECT 1");
      expect(adapter._databaseTimezone).toBe("local");
    });
    await adapter.execute("SELECT 1");
    expect(adapter._databaseTimezone).toBe("utc");
  });

  it("warnings do not change returned value of exec update", async () => {
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
      await withDbWarningsAction("log", async () => {
        Base.logger = new Logger(null);
        const affected = await adapter.executeMutation(
          `UPDATE warn_posts SET title = 'Updated' WHERE id > (0+'foo') LIMIT 1`,
        );
        expect(affected).toBe(1);
      });
    } finally {
      await adapter.executeMutation(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollbackTransaction().catch(() => {});
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts`).catch(() => {});
      Base.logger = previousLogger;
    }
  });

  it("warnings do not change returned value of exec delete", async () => {
    const previousLogger = Base.logger;
    const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
    await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts_d`);
    await adapter.beginTransaction({ _lazy: false });
    try {
      await adapter.executeMutation(
        `CREATE TABLE warn_posts_d (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
      );
      await adapter.executeMutation(`SET SESSION sql_mode=''`);
      await adapter.executeMutation(`INSERT INTO warn_posts_d (title) VALUES ('Title')`);
      await withDbWarningsAction("log", async () => {
        Base.logger = new Logger(null);
        const affected = await adapter.executeMutation(
          `DELETE FROM warn_posts_d WHERE id > (0+'foo') LIMIT 1`,
        );
        expect(affected).toBe(1);
      });
    } finally {
      await adapter.executeMutation(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollbackTransaction().catch(() => {});
      await adapter.executeMutation(`DROP TABLE IF EXISTS warn_posts_d`).catch(() => {});
      Base.logger = previousLogger;
    }
  });
});
