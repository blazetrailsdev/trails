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
import { Base } from "../../base.js";
import {
  assert,
  assertChanges,
  assertIncludes,
  assertNot,
  assertNothingRaised,
  assertRaises,
  Logger,
} from "@blazetrails/activesupport";
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
      const error = (await assertRaises([ConnectionNotEstablished], {}, () =>
        badAdapter.connectBang(),
      )) as ConnectionNotEstablished;
      expect(error.connectionPool).toBeInstanceOf(NullPool);
    } finally {
      await badAdapter.disconnectBang();
    }
  });

  it("reconnection error", async () => {
    const badAdapter = new Mysql2Adapter({ socketPath: "/dev/null", preparedStatements: false });
    try {
      const error = (await assertRaises([ConnectionNotEstablished], {}, () =>
        badAdapter.reconnectBang(),
      )) as ConnectionNotEstablished;
      expect(error.connectionPool).toBe(badAdapter.pool);
    } finally {
      await badAdapter.disconnectBang();
    }
  });

  it("mysql2 default prepared statements", () => {
    const fakeAdapter = new Mysql2Adapter({ _fakeConnection: true });
    expect(fakeAdapter.preparedStatements).toBe(false);
  });

  it("exec query with prepared statements", async () => {
    const result = await adapter.execQuery("SELECT 1", "SQL", [], { prepare: true });
    expect(result.toArray()).toEqual([{ "1": 1 }]);
  });

  it("exec query nothing raises with no result queries", async () => {
    await adapter.execute("CREATE TABLE IF NOT EXISTS `ex` (`number` INT) ENGINE=InnoDB");
    try {
      await assertNothingRaised(async () => {
        await adapter.execQuery("INSERT INTO `ex` (number) VALUES (1)");
        await adapter.execQuery("DELETE FROM `ex` WHERE number = 1");
      });
    } finally {
      await adapter.execute("DROP TABLE IF EXISTS `ex`");
    }
  });

  it("database exists returns false if database does not exist", async () => {
    const url = new URL(MYSQL_TEST_URL);
    url.pathname = "/inexistent_activerecord_unittest";
    assertNot(await Mysql2Adapter.databaseExists(url.toString()), "expected database to not exist");
  });

  it("database exists returns true when the database exists", async () => {
    assert(await Mysql2Adapter.databaseExists(MYSQL_TEST_URL), "expected database to exist");
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
      const error = await assertRaises([MismatchedForeignKey], {}, async () => {
        await adapter.addReference("engines", "old_car");
        await adapter.addForeignKey("engines", "old_cars");
      });
      expect(error.message).toMatch(
        /Column `old_car_id` on table `engines` does not match column `id` on `old_cars`, which has type `int(\(11\))?`\./,
      );
      expect(error.message).toMatch(
        /To resolve this issue, change the type of the `old_car_id` column on `engines` to be :integer\. \(For example `t.integer :old_car_id`\)\./,
      );
      expect(error.cause ?? null).not.toBeNull();
      expect((error as MismatchedForeignKey).connectionPool).toBe(adapter.pool);
    } finally {
      await adapter.execute("ALTER TABLE engines DROP COLUMN old_car_id").catch(() => null);
    }
  });

  it.skipIf(isMariaDb)(
    "errors for multiple fks on mismatched types for pk table in alter table",
    async () => {
      try {
        const error = await assertRaises([MismatchedForeignKey], {}, async () => {
          await adapter.addReference("engines", "person", { foreignKey: true });
          await adapter.addReference("engines", "old_car", { foreignKey: true });
        });
        expect(error.message).toMatch(
          /Column `old_car_id` on table `engines` does not match column `id` on `old_cars`, which has type `int(\(11\))?`\./,
        );
        expect(error.message).toMatch(
          /To resolve this issue, change the type of the `old_car_id` column on `engines` to be :integer\. \(For example `t.integer :old_car_id`\)\./,
        );
        expect(error.cause ?? null).not.toBeNull();
        expect((error as MismatchedForeignKey).connectionPool).toBe(adapter.pool);
      } finally {
        await adapter.removeReference("engines", "person");
        await adapter.removeReference("engines", "old_car");
      }
    },
  );

  it("errors for bigint fks on integer pk table in create table", async () => {
    try {
      const error = await assertRaises([MismatchedForeignKey], {}, () =>
        adapter.execute(
          `
            CREATE TABLE \`foos\` (
              \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              \`old_car_id\` BIGINT,
              INDEX \`idx_old_car_id\` (\`old_car_id\`),
              CONSTRAINT \`fk_foos_old_car\` FOREIGN KEY (\`old_car_id\`) REFERENCES \`old_cars\` (\`id\`)
            ) ENGINE=InnoDB
          `,
        ),
      );
      expect(error.message).toMatch(
        /Column `old_car_id` on table `foos` does not match column `id` on `old_cars`, which has type `int(\(11\))?`\./,
      );
      expect(error.message).toMatch(
        /To resolve this issue, change the type of the `old_car_id` column on `foos` to be :integer\. \(For example `t.integer :old_car_id`\)\./,
      );
      expect(error.cause ?? null).not.toBeNull();
      expect((error as MismatchedForeignKey).connectionPool).toBe(adapter.pool);
    } finally {
      await adapter.dropTable("foos", { ifExists: true });
    }
  });

  it("errors for integer fks on bigint pk table in create table", async () => {
    try {
      const error = await assertRaises([MismatchedForeignKey], {}, () =>
        adapter.execute(
          `
            CREATE TABLE \`foos\` (
              \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              \`car_id\` INT,
              INDEX \`idx_car_id\` (\`car_id\`),
              CONSTRAINT \`fk_foos_car\` FOREIGN KEY (\`car_id\`) REFERENCES \`cars\` (\`id\`)
            ) ENGINE=InnoDB
          `,
        ),
      );
      expect(error.message).toMatch(
        /Column `car_id` on table `foos` does not match column `id` on `cars`, which has type `bigint(\(20\))?`\./,
      );
      expect(error.message).toMatch(
        /To resolve this issue, change the type of the `car_id` column on `foos` to be :bigint\. \(For example `t.bigint :car_id`\)\./,
      );
      expect(error.cause ?? null).not.toBeNull();
      expect((error as MismatchedForeignKey).connectionPool).toBe(adapter.pool);
    } finally {
      await adapter.dropTable("foos", { ifExists: true });
    }
  });

  it("errors for bigint fks on string pk table in create table", async () => {
    try {
      const error = await assertRaises([MismatchedForeignKey], {}, () =>
        adapter.execute(
          `
            CREATE TABLE \`foos\` (
              \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              \`subscriber_id\` BIGINT,
              INDEX \`idx_subscriber_id\` (\`subscriber_id\`),
              CONSTRAINT \`fk_foos_subscriber\` FOREIGN KEY (\`subscriber_id\`) REFERENCES \`subscribers\` (\`nick\`)
            ) ENGINE=InnoDB
          `,
        ),
      );
      assertIncludes(
        error.message,
        "Column `subscriber_id` on table `foos` does not match column `nick` on `subscribers`, " +
          "which has type `varchar(255)`. To resolve this issue, change the type of the `subscriber_id` " +
          "column on `foos` to be :string. (For example `t.string :subscriber_id`).",
      );
      expect(error.cause ?? null).not.toBeNull();
      expect((error as MismatchedForeignKey).connectionPool).toBe(adapter.pool);
    } finally {
      await adapter.dropTable("foos", { ifExists: true });
    }
  });

  it("read timeout exception", async () => {
    const connection = new Mysql2Adapter({ uri: MYSQL_TEST_URL, readTimeout: 1 });
    try {
      const error = (await assertRaises([AdapterTimeout], {}, () =>
        connection.execute("SELECT SLEEP(2)"),
      )) as AdapterTimeout;
      expect(error).toBeInstanceOf(QueryAborted);
      expect((error.cause as { code?: string }).code).toBe("PROTOCOL_SEQUENCE_TIMEOUT");
      expect(error.connectionPool).toBe(connection.pool);
    } finally {
      await connection.disconnectBang();
    }
  });

  it("statement timeout error codes", async () => {
    await adapter.execute("SELECT 1");
    const rawConn = adapter._clientForTest()!;
    vi.spyOn(rawConn, "query").mockRejectedValueOnce(
      Object.assign(new Error("fail"), { errno: AbstractMysqlAdapter.ER_FILSORT_ABORT }),
    );
    let error = (await assertRaises([StatementTimeout], {}, () =>
      adapter.execute("SELECT 1"),
    )) as StatementTimeout;
    expect(error.connectionPool).toBe(adapter.pool);

    vi.spyOn(rawConn, "query").mockRejectedValueOnce(
      Object.assign(new Error("fail"), { errno: AbstractMysqlAdapter.ER_QUERY_TIMEOUT }),
    );
    error = (await assertRaises([StatementTimeout], {}, () =>
      adapter.execute("SELECT 1"),
    )) as StatementTimeout;
    expect(error.connectionPool).toBe(adapter.pool);
  });

  it("database timezone changes synced to connection", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      await assertChanges(
        () => adapter._databaseTimezone,
        null,
        { from: "utc", to: "local" },
        () => adapter.execute("SELECT 1"),
      );
    });
  });

  it("warnings do not change returned value of exec update", async () => {
    const previousLogger = Base.logger;
    const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
    await adapter.execute(`DROP TABLE IF EXISTS warn_posts`);
    await adapter.beginTransaction({ _lazy: false });
    try {
      await adapter.execute(
        `CREATE TABLE warn_posts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
      );
      await adapter.execute(`SET SESSION sql_mode=''`);
      await adapter.execute(`INSERT INTO warn_posts (title) VALUES ('Title')`);
      await withDbWarningsAction("log", async () => {
        Base.logger = new Logger(null);
        const affected = await adapter.update(
          `UPDATE warn_posts SET title = 'Updated' WHERE id > (0+'foo') LIMIT 1`,
        );
        expect(affected).toBe(1);
      });
    } finally {
      await adapter.execute(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollbackTransaction().catch(() => {});
      await adapter.execute(`DROP TABLE IF EXISTS warn_posts`).catch(() => {});
      Base.logger = previousLogger;
    }
  });

  it("warnings do not change returned value of exec delete", async () => {
    const previousLogger = Base.logger;
    const oldSqlMode = await adapter.queryValue("SELECT @@SESSION.sql_mode");
    await adapter.execute(`DROP TABLE IF EXISTS warn_posts_d`);
    await adapter.beginTransaction({ _lazy: false });
    try {
      await adapter.execute(
        `CREATE TABLE warn_posts_d (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20))`,
      );
      await adapter.execute(`SET SESSION sql_mode=''`);
      await adapter.execute(`INSERT INTO warn_posts_d (title) VALUES ('Title')`);
      await withDbWarningsAction("log", async () => {
        Base.logger = new Logger(null);
        const affected = await adapter.delete(
          `DELETE FROM warn_posts_d WHERE id > (0+'foo') LIMIT 1`,
        );
        expect(affected).toBe(1);
      });
    } finally {
      await adapter.execute(`SET SESSION sql_mode='${oldSqlMode}'`).catch(() => {});
      await adapter.rollbackTransaction().catch(() => {});
      await adapter.execute(`DROP TABLE IF EXISTS warn_posts_d`).catch(() => {});
      Base.logger = previousLogger;
    }
  });
});
