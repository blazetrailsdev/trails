import pg from "pg";
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { StatementInvalid } from "./errors.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { adapterType } from "./test-adapter.js";

class MockDatabaseError extends Error {}

// Rails' MockDatabaseError defines `result` (PG) and `error_number` (MySQL) so
// each adapter's translate_exception recognizes it as a driver error and wraps
// it in StatementInvalid. trails' adapters key off driver-native shapes instead:
// PG wraps a pg.DatabaseError, MySQL wraps a positive errno, SQLite wraps any
// error. Build the shape the active adapter recognizes so the translation path
// is exercised on every adapter, exactly as in Rails.
function mockDatabaseError(): Error {
  if (adapterType === "postgres") return new pg.DatabaseError("MockDatabaseError", 0, "error");
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
          throw mockDatabaseError();
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
          throw mockDatabaseError();
        }),
      )
      .catch((e: unknown) => e);
    expect(error.sql).toEqual(sql);
    expect(error.binds).toEqual(binds);
  });
});
