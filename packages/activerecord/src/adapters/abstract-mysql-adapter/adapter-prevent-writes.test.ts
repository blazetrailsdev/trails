/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/adapter_prevent_writes_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { ReadOnlyError, QueryCanceled } from "../../errors.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    await adapter.exec("DROP TABLE IF EXISTS `engines`");
    await adapter.exec(
      "CREATE TABLE `engines` (`id` int auto_increment primary key, `car_id` bigint)",
    );
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS `engines`").catch(() => {});
    await adapter.close();
  });

  // isPreventingWrites() checks pool.preventWrites before _config, and pool
  // is a public property — safer than reaching into protected _config.
  function preventWrites(a: Mysql2Adapter): void {
    (a as Mysql2Adapter & { pool: { preventWrites?: boolean } }).pool = { preventWrites: true };
  }

  function allowWrites(a: Mysql2Adapter): void {
    (a as Mysql2Adapter & { pool: { preventWrites?: boolean } }).pool = { preventWrites: false };
  }

  describe("AdapterPreventWritesTest", () => {
    it("errors when an insert query is called while preventing writes", async () => {
      preventWrites(adapter);
      await expect(
        adapter.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')"),
      ).rejects.toBeInstanceOf(ReadOnlyError);
    });

    it("errors when an update query is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");
      preventWrites(adapter);
      await expect(
        adapter.execute(
          "UPDATE `engines` SET `engines`.`car_id` = '9989' WHERE `engines`.`car_id` = '138853948594'",
        ),
      ).rejects.toBeInstanceOf(ReadOnlyError);
    });

    it("errors when a delete query is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");
      preventWrites(adapter);
      await expect(
        adapter.execute("DELETE FROM `engines` where `engines`.`car_id` = '138853948594'"),
      ).rejects.toBeInstanceOf(ReadOnlyError);
    });

    it("errors when a replace query is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");
      preventWrites(adapter);
      await expect(
        adapter.execute("REPLACE INTO `engines` SET `engines`.`car_id` = '249823948'"),
      ).rejects.toBeInstanceOf(ReadOnlyError);
    });

    it("doesnt error when a select query is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");
      preventWrites(adapter);
      const rows = await adapter.execute(
        "SELECT `engines`.* FROM `engines` WHERE `engines`.`car_id` = '138853948594'",
      );
      expect(rows).toHaveLength(1);
    });

    it("doesnt error when a show query is called while preventing writes", async () => {
      preventWrites(adapter);
      const rows = await adapter.execute("SHOW FULL FIELDS FROM `engines`");
      expect(rows).toHaveLength(2);
    });

    it("doesnt error when a set query is called while preventing writes", async () => {
      preventWrites(adapter);
      await expect(
        adapter.execute("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"),
      ).resolves.toBeDefined();
    });

    it("doesnt error when a describe query is called while preventing writes", async () => {
      preventWrites(adapter);
      const rows = await adapter.execute("DESCRIBE engines");
      expect(rows).toHaveLength(2);
    });

    it("doesnt error when a desc query is called while preventing writes", async () => {
      preventWrites(adapter);
      const rows = await adapter.execute("DESC engines");
      expect(rows).toHaveLength(2);
    });

    it("doesnt error when a read query with leading chars is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");
      preventWrites(adapter);
      const rows = await adapter.execute(
        "/*action:index*/(\n( SELECT `engines`.* FROM `engines` WHERE `engines`.`car_id` = '138853948594' ) )",
      );
      expect(rows).toHaveLength(1);
    });

    it("doesnt error when a use query is called while preventing writes", async () => {
      const dbRows = await adapter.execute("SELECT DATABASE() AS db");
      const dbName = dbRows[0]!.db as string;
      preventWrites(adapter);
      await expect(adapter.execute(`USE \`${dbName}\``)).resolves.toBeDefined();
    });

    it("doesnt error when a kill query is called while preventing writes", async () => {
      preventWrites(adapter);
      const rows = await adapter.execute("SELECT CONNECTION_ID() as connection_id");
      const connId = rows[0]!.connection_id;
      await expect(adapter.execute(`KILL QUERY ${connId}`)).rejects.toBeInstanceOf(QueryCanceled);
    });
  });
});
