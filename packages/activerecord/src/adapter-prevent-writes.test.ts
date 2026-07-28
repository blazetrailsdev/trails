/**
 * Mirrors Rails activerecord/test/cases/adapter_prevent_writes_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./index.js";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { ReadOnlyError, StatementInvalid } from "./errors.js";
import { itIfSupports } from "./support/supports.js";
import { adapterType } from "./test-adapter.js";
import { fixtures } from "./test-fixtures.js";

let connection: AbstractAdapter;

describe("AdapterPreventWritesTest", () => {
  fixtures([]);

  beforeEach(async () => {
    connection = await Base.leaseConnection();
  });

  it("preventing writes predicate", async () => {
    expect(connection.isPreventingWrites()).toBe(false);

    await Base.whilePreventingWrites(async () => {
      expect(connection.isPreventingWrites()).toBe(true);
    });

    expect(connection.isPreventingWrites()).toBe(false);
  });

  it("errors when an insert query is called while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.insert("INSERT INTO subscribers(nick) VALUES ('138853948594')"),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when an update query is called while preventing writes", async () => {
    await connection.insert("INSERT INTO subscribers(nick) VALUES ('138853948594')");

    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.update("UPDATE subscribers SET nick = '9989' WHERE nick = '138853948594'"),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when a delete query is called while preventing writes", async () => {
    await connection.insert("INSERT INTO subscribers(nick) VALUES ('138853948594')");

    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.delete("DELETE FROM subscribers WHERE nick = '138853948594'"),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  // Rails defines two variants of this test in the same class: one for PostgreSQL
  // (raises StatementInvalid on encoding errors before the write-prevention check) and
  // one for all other adapters (assert_nothing_raised). This first occurrence is the
  // PostgreSQL variant.
  it.skipIf(adapterType !== "postgres")(
    "doesnt error when a select query has encoding errors",
    async () => {
      // Rails sends Ruby's `'\xC8'` literal as a raw 0xC8 byte, which PG's client
      // eagerly rejects as invalid UTF-8 (StatementInvalid). JS strings can't carry
      // a raw 0xC8 byte — node-pg always emits valid UTF-8 — so we provoke the same
      // UTF8 encoding error server-side via a bytea literal. The key assertion holds:
      // the write-prevention check (a read) doesn't pre-empt the encoding failure.
      await Base.whilePreventingWrites(async () => {
        await expect(
          connection.selectAll(`SELECT convert_from('\\xc8'::bytea, 'UTF8')`),
        ).rejects.toThrow(StatementInvalid);
      });
    },
  );

  // Non-PostgreSQL variant (Rails' `else` branch): the extractor records it as
  // unconditional, so this stays ungated to pair with that variant.
  it("doesnt error when a select query has encoding errors", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(connection.selectAll(`SELECT '\xC8'`)).resolves.toBeDefined();
    });
  });

  it("doesnt error when a select query is called while preventing writes", async () => {
    await connection.insert("INSERT INTO subscribers(nick) VALUES ('138853948594')");

    await Base.whilePreventingWrites(async () => {
      const result = await connection.selectAll(
        "SELECT subscribers.* FROM subscribers WHERE nick = '138853948594'",
      );
      expect(result.length).toBe(1);
    });
  });

  itIfSupports(
    "common_table_expressions",
    "doesnt error when a read query with a cte is called while preventing writes",
    async () => {
      await connection.insert("INSERT INTO subscribers(nick) VALUES ('138853948594')");

      await Base.whilePreventingWrites(async () => {
        const result = await connection.selectAll(`
          WITH matching_subscribers AS (SELECT subscribers.* FROM subscribers WHERE nick = '138853948594')
          SELECT * FROM matching_subscribers
        `);
        expect(result.length).toBe(1);
      });
    },
  );

  it("doesnt error when a select query starting with a slash star comment is called while preventing writes", async () => {
    await connection.insert("INSERT INTO subscribers(nick) VALUES ('138853948594')");

    await Base.whilePreventingWrites(async () => {
      const result = await connection.selectAll(
        "/* some comment */ SELECT subscribers.* FROM subscribers WHERE nick = '138853948594'",
      );
      expect(result.length).toBe(1);
    });
  });

  it("errors when an insert query prefixed by a slash star comment is called while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.insert(
          "/* some comment */ INSERT INTO subscribers(nick) VALUES ('138853948594')",
        ),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("doesnt error when a select query starting with double dash comments is called while preventing writes", async () => {
    await connection.insert("INSERT INTO subscribers(nick) VALUES ('138853948594')");

    await Base.whilePreventingWrites(async () => {
      const result = await connection.selectAll(
        "-- some comment\n-- comment about INSERT\nSELECT subscribers.* FROM subscribers WHERE nick = '138853948594'",
      );
      expect(result.length).toBe(1);
    });
  });

  it("errors when an insert query prefixed by a double dash comment is called while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.insert("-- some comment\nINSERT INTO subscribers(nick) VALUES ('138853948594')"),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when an insert query prefixed by a multiline double dash comment is called while preventing writes", async () => {
    const manyComments = "-- comment\n".repeat(50);
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.insert(`${manyComments}INSERT INTO subscribers(nick) VALUES ('138853948594')`),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when an insert query prefixed by a slash star comment containing read command is called while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.insert("/* SELECT */ INSERT INTO subscribers(nick) VALUES ('138853948594')"),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  it("errors when an insert query prefixed by a double dash comment containing read command is called while preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.insert("-- SELECT\nINSERT INTO subscribers(nick) VALUES ('138853948594')"),
      ).rejects.toThrow(ReadOnlyError);
    });
  });
});
