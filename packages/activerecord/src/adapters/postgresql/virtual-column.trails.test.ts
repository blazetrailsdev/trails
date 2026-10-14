import { describe, it, expect, beforeEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
import { Base } from "../../index.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });

  describe("PostgresqlVirtualColumnTest", () => {
    it("non persisted column via createTable", async () => {
      await expect(
        adapter.createTable("bad_virtual", { force: true }, (t) => {
          t.virtual("invalid", { type: "string", as: "LOWER(name)" });
        }),
      ).rejects.toThrow(/does not support VIRTUAL.*Specify 'stored: true'/s);
      // eslint-disable-next-line blazetrails/require-table-teardown
      await adapter.dropTable("bad_virtual", { ifExists: true }).catch(() => {});
    });
  });
});
