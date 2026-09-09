import { describe, it, expect, beforeAll } from "vitest";
import { describeIfMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { Base } from "../../index.js";
import { ReadOnlyError, QueryCanceled } from "../../errors.js";
import { fixtures } from "../../test-fixtures.js";
import type { Mysql2RawResult } from "../../connection-adapters/mysql2/database-statements.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  fixtures([]);

  let conn: Mysql2Adapter;
  beforeAll(async () => {
    conn = Base.connection as Mysql2Adapter;
    await conn.getDatabaseVersion();
  });

  describe("AdapterPreventWritesTest", () => {
    it("errors when an insert query is called while preventing writes", async () => {
      const error = await Base.whilePreventingWrites(async () => {
        await conn.insert("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");
      }).catch((e) => e);
      expect(error).toBeInstanceOf(ReadOnlyError);
    });

    it("errors when an update query is called while preventing writes", async () => {
      await conn.insert("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      const error = await Base.whilePreventingWrites(async () => {
        await conn.update(
          "UPDATE `engines` SET `engines`.`car_id` = '9989' WHERE `engines`.`car_id` = '138853948594'",
        );
      }).catch((e) => e);
      expect(error).toBeInstanceOf(ReadOnlyError);
    });

    it("errors when a delete query is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      const error = await Base.whilePreventingWrites(async () => {
        await conn.execute("DELETE FROM `engines` where `engines`.`car_id` = '138853948594'");
      }).catch((e) => e);
      expect(error).toBeInstanceOf(ReadOnlyError);
    });

    it("errors when a replace query is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      const error = await Base.whilePreventingWrites(async () => {
        await conn.execute("REPLACE INTO `engines` SET `engines`.`car_id` = '249823948'");
      }).catch((e) => e);
      expect(error).toBeInstanceOf(ReadOnlyError);
    });

    it("doesnt error when a select query is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute(
          "SELECT `engines`.* FROM `engines` WHERE `engines`.`car_id` = '138853948594'",
        )) as Mysql2RawResult;
        expect(result.rows).toHaveLength(1);
      });
    });

    it("doesnt error when a show query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute("SHOW FULL FIELDS FROM `engines`")) as Mysql2RawResult;
        expect(result.rows).toHaveLength(2);
      });
    });

    it("doesnt error when a set query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        await expect(
          conn.execute("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"),
        ).resolves.toBeDefined();
      });
    });

    it("doesnt error when a describe query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute("DESCRIBE engines")) as Mysql2RawResult;
        expect(result.rows).toHaveLength(2);
      });
    });

    it("doesnt error when a desc query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute("DESC engines")) as Mysql2RawResult;
        expect(result.rows).toHaveLength(2);
      });
    });

    it("doesnt error when a read query with leading chars is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute(
          "/*action:index*/(\n( SELECT `engines`.* FROM `engines` WHERE `engines`.`car_id` = '138853948594' ) )",
        )) as Mysql2RawResult;
        expect(result.rows).toHaveLength(1);
      });
    });

    it("doesnt error when a use query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const dbResult = (await conn.execute("SELECT DATABASE() AS db")) as Mysql2RawResult;
        const dbName = dbResult.rows![0][0] as string;
        await expect(conn.execute(`USE \`${dbName}\``)).resolves.toBeDefined();
      });
    });

    it("doesnt error when a kill query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute(
          "SELECT CONNECTION_ID() as connection_id",
        )) as Mysql2RawResult;
        const connId = result.rows![0][0];
        await expect(conn.execute(`KILL QUERY ${connId}`)).rejects.toBeInstanceOf(QueryCanceled);
      });
    });
  });
});
