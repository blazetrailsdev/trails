import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { StatementInvalid } from "./errors.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

class MockDatabaseError extends Error {}

class Book extends Base {
  static override _tableName = "books";
  static {
    this.attribute("author_id", "integer");
    this.attribute("cover", "string");
  }
}

describe("StatementInvalidTest", () => {
  setupHandlerSuite();
  beforeAll(async () => {
    await defineSchema({ books: TEST_SCHEMA.books });
    await Book.loadSchema();
  });

  it("message contains no sql", async () => {
    const conn = Base.connection as any;
    const sql = Book.where({ author_id: 96, cover: "hard" }).toSql();
    const error: StatementInvalid = await conn
      .log(sql, "Book", [], [], false, () =>
        conn.withRawConnection(() => {
          throw new MockDatabaseError();
        }),
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StatementInvalid);
    expect(error.message.includes("SELECT")).toBe(false);
  });

  it("statement and binds are set on select", async () => {
    const conn = Base.connection as any;
    const sql = Book.where({ author_id: 96, cover: "hard" }).toSql();
    const binds = [{}, {}];
    const error: StatementInvalid = await conn
      .log(sql, "Book", binds, [], false, () =>
        conn.withRawConnection(() => {
          throw new MockDatabaseError();
        }),
      )
      .catch((e: unknown) => e);
    expect(error.sql).toEqual(sql);
    expect(error.binds).toEqual(binds);
  });
});
