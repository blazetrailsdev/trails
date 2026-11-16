import { describe, it, expect } from "vitest";
import { assertNot, assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "../../lib/index.js";
import { StatementInvalid } from "../../lib/errors.js";
import { Book } from "../models/book.js";
import { fixtures } from "../support/use-fixtures.js";
import { adapterType } from "../support/test-adapter.js";

class MockDatabaseError extends Error {}

function mockDatabaseError(): Error {
  if (adapterType === "postgres") return Object.assign(new MockDatabaseError(), { result: 0 });
  if (adapterType === "mysql") return Object.assign(new MockDatabaseError(), { errno: 1 });
  return new MockDatabaseError();
}

describe("StatementInvalidTest", () => {
  fixtures(["books"], { useTransactionalTests: false });

  it("message contains no sql", async () => {
    const conn = (await Base.leaseConnection()) as any;
    const sql = Book.where({ author_id: 96, cover: "hard" }).toSql();
    const error = await assertRaises([StatementInvalid], {}, () =>
      conn.log(sql, "Book", [], [], false, () =>
        conn.withRawConnection({}, () => {
          throw mockDatabaseError();
        }),
      ),
    );
    assertNot(error.message.includes("SELECT"));
  });

  it("statement and binds are set on select", async () => {
    const conn = (await Base.leaseConnection()) as any;
    const sql = Book.where({ author_id: 96, cover: "hard" }).toSql();
    const binds = [{}, {}];
    const error = await assertRaises([StatementInvalid], {}, () =>
      conn.log(sql, "Book", binds, [], false, () =>
        conn.withRawConnection({}, () => {
          throw mockDatabaseError();
        }),
      ),
    );
    expect(error.sql).toEqual(sql);
    expect(error.binds).toEqual(binds);
  });
});
