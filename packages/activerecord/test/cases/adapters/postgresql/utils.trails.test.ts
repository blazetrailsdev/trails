import { describe, it, expect, beforeEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { Base } from "../../../../lib/base.js";
import { fixtures } from "../../../support/use-fixtures.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures(["movies"], { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });

  describe("PostgreSQLUtilsTest", () => {
    it("reset pk sequence with custom pk", async () => {
      await adapter.execute("DELETE FROM movies");
      await adapter.execute(`INSERT INTO movies (movieid, name) VALUES (1, 'a')`);
      await adapter.execute(`INSERT INTO movies (movieid, name) VALUES (2, 'b')`);
      await adapter.execute(`SELECT setval('movies_movieid_seq', 100)`);
      await adapter.resetPkSequenceBang("movies");
      const rows = Array.from(await adapter.execute(`SELECT nextval('movies_movieid_seq') AS val`));
      expect(Number(rows[0].val)).toBe(3);
    });
  });
});
