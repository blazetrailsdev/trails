import { describe, it, expect, beforeAll } from "vitest";
import { assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { describeIfMysqlAdapter, Mysql2Adapter, ARUNIT_DATABASE } from "./test-helper.js";
import { Base } from "../../index.js";
import { ReadOnlyError, QueryCanceled } from "../../errors.js";
import { fixtures } from "../../test-fixtures.js";
import type { Mysql2RawResult } from "../../connection-adapters/mysql2/database-statements.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  fixtures([]);

  let conn: Mysql2Adapter;
  beforeAll(async () => {
    conn = (await Base.leaseConnection()) as Mysql2Adapter;
    await conn.getDatabaseVersion();
  });

  describe("AdapterPreventWritesTest", () => {
    it("errors when an insert query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        await assertRaises([ReadOnlyError], {}, async () => {
          await conn.insert("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");
        });
      });
    });

    it("errors when an update query is called while preventing writes", async () => {
      await conn.insert("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        await assertRaises([ReadOnlyError], {}, async () => {
          await conn.update(
            "UPDATE `engines` SET `engines`.`car_id` = '9989' WHERE `engines`.`car_id` = '138853948594'",
          );
        });
      });
    });

    it("errors when a delete query is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        await assertRaises([ReadOnlyError], {}, async () => {
          await conn.execute("DELETE FROM `engines` where `engines`.`car_id` = '138853948594'");
        });
      });
    });

    it("errors when a replace query is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        await assertRaises([ReadOnlyError], {}, async () => {
          await conn.execute("REPLACE INTO `engines` SET `engines`.`car_id` = '249823948'");
        });
      });
    });

    it("doesnt error when a select query is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute(
          "SELECT `engines`.* FROM `engines` WHERE `engines`.`car_id` = '138853948594'",
        )) as Mysql2RawResult;
        expect(result.rows!.length).toEqual(1);
      });
    });

    it("doesnt error when a show query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute("SHOW FULL FIELDS FROM `engines`")) as Mysql2RawResult;
        expect(result.rows!.length).toEqual(2);
      });
    });

    it("doesnt error when a set query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        await assertNothingRaised(async () => {
          await conn.execute("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        });
      });
    });

    it("doesnt error when a describe query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute("DESCRIBE engines")) as Mysql2RawResult;
        expect(result.rows!.length).toEqual(2);
      });
    });

    it("doesnt error when a desc query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute("DESC engines")) as Mysql2RawResult;
        expect(result.rows!.length).toEqual(2);
      });
    });

    it("doesnt error when a read query with leading chars is called while preventing writes", async () => {
      await conn.execute("INSERT INTO `engines` (`car_id`) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute(
          "/*action:index*/(\n( SELECT `engines`.* FROM `engines` WHERE `engines`.`car_id` = '138853948594' ) )",
        )) as Mysql2RawResult;
        expect(result.rows!.length).toEqual(1);
      });
    });

    it("doesnt error when a use query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const dbName = ARUNIT_DATABASE;
        await assertNothingRaised(async () => {
          await conn.execute(`USE \`${dbName}\``);
        });
      });
    });

    it("doesnt error when a kill query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const result = (await conn.execute(
          "SELECT CONNECTION_ID() as connection_id",
        )) as Mysql2RawResult;
        const connId = result.rows![0][0];
        await assertRaises([QueryCanceled], {}, async () => {
          await conn.execute(`KILL QUERY ${connId}`);
        });
      });
    });
  });
});
