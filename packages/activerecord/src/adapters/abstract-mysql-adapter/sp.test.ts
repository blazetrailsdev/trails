/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/sp_test.rb
 */
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter } from "./test-helper.js";
import { Base } from "../../base.js";
import { Topic } from "../../test-helpers/models/topic.js";
import { useHandlerFixtures } from "../../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../../test-helpers/test-schema.js";

describeIfMysql("Mysql2Adapter", () => {
  describe("StoredProcedureTest", () => {
    // Rails `fixtures :topics` — load canonical topics via the handler connection.
    const { topics } = useHandlerFixtures(["topics"], { schema: canonicalSchema });

    beforeAll(async () => {
      await Base.connection.executeMutation("DROP PROCEDURE IF EXISTS ten");
      await Base.connection.executeMutation(
        `CREATE PROCEDURE ten() SQL SECURITY INVOKER BEGIN SELECT 10; END`,
      );
      await Base.connection.executeMutation("DROP PROCEDURE IF EXISTS topics");
      await Base.connection.executeMutation(
        `CREATE PROCEDURE topics(IN num INT) SQL SECURITY INVOKER` +
          ` BEGIN SELECT * FROM topics LIMIT num; END`,
      );
    });

    afterAll(async () => {
      await Base.connection.executeMutation("DROP PROCEDURE IF EXISTS ten");
      await Base.connection.executeMutation("DROP PROCEDURE IF EXISTS topics");
    });

    it("multi results", async () => {
      const rows = await Base.connection.selectRows("CALL ten();");
      expect(Number(rows[0]![0])).toBe(10);
      expect((Base.connection as Mysql2Adapter).active).toBe(true);
    });

    it("multi results from select one", async () => {
      const row = await Base.connection.selectOne("CALL topics(1);");
      expect(row?.["author_name"]).toBe(topics("first").author_name);
      expect((Base.connection as Mysql2Adapter).active).toBe(true);
    });

    it("multi results from find by sql", async () => {
      const result = await Topic.findBySql("CALL topics(3);");
      expect(result.length).toBe(3);
      expect(result[0]!["author_name"]).toBe(topics("first").author_name);
      expect((Base.connection as Mysql2Adapter).active).toBe(true);
    });
  });
});
