/**
 * trails-specific invariant with no verbatim Rails counterpart.
 *
 * Rails runs DDL through the public `execute` (`add_column` is
 * `execute schema_creation.accept(add_column_def)`,
 * abstract/schema_statements.rb:636-641). trails used to route it through the
 * lower-level `executeMutation`; schema-statements now calls `execute`, matching
 * Rails.
 *
 * `executeMutation` enforced the readonly guard (`check_if_write_query`, raising
 * `ReadOnlyError` while writes are prevented) via `preprocessQuery`. `execute`
 * runs the same `preprocessQuery`, so the guard survives the swap — this pins
 * that, since a primitive swap that silently dropped it would let DDL through on
 * a replica.
 */
import { describe, it, expect } from "vitest";

import { Base } from "./index.js";
import { ReadOnlyError } from "./errors.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("DDL through execute (trails)", () => {
  // Real DDL: run non-transactionally so MySQL's implicit commit on DDL cannot
  // commit the fixture transaction mid-test (see query-cache-ddl-dirties).
  fixtures([], { useTransactionalTests: false });

  it("DDL raises if preventing writes", async () => {
    const conn = (await Base.leaseConnection()) as never as {
      addColumn(t: string, c: string, ty: string): Promise<void>;
    };
    const error = await Base.whilePreventingWrites(async () => {
      await conn.addColumn("posts", "readonlyDdlProbe", "string");
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: ALTER TABLE /,
    );
  });
});
