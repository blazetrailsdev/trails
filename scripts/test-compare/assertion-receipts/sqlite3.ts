import type { AssertionReceipt } from "../assertion-receipts.js";

const ractor =
  "test_statement.rb:28-31 `assert Ractor.shareable?(...)` runs only `if defined?(Ractor)`; JavaScript has no Ractor, so no shareability fact exists to assert";

const errorOffset =
  "test_integration.rb:110-172 asserts one message per `HAVE_SQLITE_ERROR_OFFSET` arm; Node's SQLite bindings expose no `sqlite3_error_offset`, so `sql_offset` is always -1 and only the no-offset arm runs";

export const sqlite3: Record<string, AssertionReceipt[]> = {
  "sqlite3:test_statement.rb › TestStatement › rows should be frozen": [
    { kind: "assert", value: null, as: null, reason: ractor },
    { kind: "assert", value: null, as: null, reason: ractor },
  ],
  "sqlite3:test_integration.rb › IntegrationTestCase › prepare exception shows error position": [
    { kind: "assert_equal", value: null, as: null, reason: errorOffset },
  ],
  "sqlite3:test_integration.rb › IntegrationTestCase › prepare exception shows error position newline1":
    [{ kind: "assert_equal", value: null, as: null, reason: errorOffset }],
  "sqlite3:test_integration.rb › IntegrationTestCase › prepare exception shows error position newline2":
    [{ kind: "assert_equal", value: null, as: null, reason: errorOffset }],
};
