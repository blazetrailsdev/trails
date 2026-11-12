import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll } from "vitest";
import {
  describeIfMysqlAdapter,
  isMariaDb,
  Mysql2Adapter,
} from "../../../../lib/adapters/abstract-mysql-adapter/test-helper.js";
import { Version } from "../../../../lib/connection-adapters/abstract-adapter.js";
import { fixtures } from "../../../../lib/test-helpers/use-fixtures.js";
import { Base } from "../../../../lib/index.js";
import { Author } from "../../../models/author.js";
import { Post } from "../../../models/post.js";

fixtures({}, { useTransactionalTests: false });

describeIfMysqlAdapter("Mysql2Adapter", () => {
  constSet(TopLevel, "Author", Author);
  constSet(TopLevel, "Post", Post);

  let adapter: Mysql2Adapter;
  beforeAll(async () => {
    adapter = (await Base.leaseConnection()) as Mysql2Adapter;
    await adapter.getDatabaseVersion();
  });

  describe("MySQLExplainTest", () => {
    fixtures(["authors", "authorAddresses", "posts"], { useTransactionalTests: true });

    let explainOpt: string;
    let expectedClause: string;
    beforeAll(async () => {
      const ver = await adapter.databaseVersion;
      const supportsAnalyze = isMariaDb && ver.compare("10.1.0") >= 0;
      const supportsExplainAnalyze = isMariaDb
        ? new Version("10.0").compare(String(ver)) >= 0
        : ver.compare("6.0") >= 0;
      explainOpt = supportsAnalyze || supportsExplainAnalyze ? ":analyze" : ":extended";
      expectedClause = supportsAnalyze
        ? "ANALYZE"
        : supportsExplainAnalyze
          ? "EXPLAIN ANALYZE"
          : "EXPLAIN EXTENDED";
    });

    it("explain for one query", async () => {
      const explain = await Author.where({ id: 1 }).explain().inspect();
      expect(explain).toMatch("EXPLAIN SELECT `authors`.* FROM `authors` WHERE `authors`.`id` = 1");
      expect(explain).toMatch(/authors \|.* const/);
    });

    it("explain with eager loading", async () => {
      const explain = await Author.where({ id: 1 }).includes(":posts").explain().inspect();
      expect(explain).toMatch("EXPLAIN SELECT `authors`.* FROM `authors` WHERE `authors`.`id` = 1");
      expect(explain).toMatch(/authors |.* const/);
      expect(explain).toMatch(
        "EXPLAIN SELECT `posts`.* FROM `posts` WHERE `posts`.`author_id` = 1",
      );
      expect(explain).toMatch(/posts |.* ALL/);
    });

    it("explain with options as symbol", async () => {
      const explain = await Author.where({ id: 1 }).explain(explainOpt).inspect();
      expect(explain).toMatch(
        `${expectedClause} SELECT \`authors\`.* FROM \`authors\` WHERE \`authors\`.\`id\` = 1`,
      );
    });

    it("explain with options as strings", async () => {
      const explain = await Author.where({ id: 1 })
        .explain(explainOpt.slice(1).toUpperCase())
        .inspect();
      expect(explain).toMatch(
        `${expectedClause} SELECT \`authors\`.* FROM \`authors\` WHERE \`authors\`.\`id\` = 1`,
      );
    });

    it("explain options with eager loading", async () => {
      const explain = await Author.where({ id: 1 })
        .includes(":posts")
        .explain(explainOpt)
        .inspect();
      expect(explain).toMatch(
        `${expectedClause} SELECT \`authors\`.* FROM \`authors\` WHERE \`authors\`.\`id\` = 1`,
      );
      expect(explain).toMatch(
        `${expectedClause} SELECT \`posts\`.* FROM \`posts\` WHERE \`posts\`.\`author_id\` = 1`,
      );
    });
  });
});
