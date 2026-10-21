import { describe, it, expect, beforeAll } from "vitest";
import { assertNot, assertRaises } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { StatementInvalid } from "./errors.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { adapterType } from "./test-adapter.js";

class MockDatabaseError extends Error {}

function mockDatabaseError(): Error {
  if (adapterType === "postgres") return Object.assign(new MockDatabaseError(), { result: 0 });
  if (adapterType === "mysql") return Object.assign(new MockDatabaseError(), { errno: 1 });
  return new MockDatabaseError();
}

class Book extends Base {
  static override _tableName = "books";
  static {
    this.attribute("author_id", "integer");
    this.attribute("cover", "string");
  }
}

describe("StatementInvalidTest", () => {
  fixtures({}, { useTransactionalTests: false });
  beforeAll(async () => {
    await Book.loadSchema();
  });

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
