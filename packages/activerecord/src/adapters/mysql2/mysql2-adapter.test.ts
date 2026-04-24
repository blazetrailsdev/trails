/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_adapter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";
import {
  InvalidForeignKey,
  MismatchedForeignKey,
  NotNullViolation,
  RecordNotUnique,
  ValueTooLong,
} from "../../errors.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
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
    it.skip("mysql2 default prepared statements", () => {});
    it.skip("exec query with prepared statements", () => {});
    it.skip("exec query nothing raises with no result queries", () => {});
    it.skip("database exists returns false if database does not exist", () => {});

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

    it.skip("read timeout exception", () => {});
    it.skip("statement timeout error codes", () => {});
    it.skip("database timezone changes synced to connection", () => {});
    it.skip("warnings do not change returned value of exec update", () => {});
    it.skip("warnings do not change returned value of exec delete", () => {});
  });
});
