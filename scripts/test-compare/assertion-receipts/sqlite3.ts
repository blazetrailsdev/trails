import type { AssertionReceipt } from "../assertion-receipts.js";

const ractor =
  "test_statement.rb:28-31 `assert Ractor.shareable?(...)` runs only `if defined?(Ractor)`; JavaScript has no Ractor, so no shareability fact exists to assert";

export const sqlite3: Record<string, AssertionReceipt[]> = {
  "sqlite3:test_statement.rb › TestStatement › rows should be frozen": [
    { kind: "assert", value: null, as: null, reason: ractor },
    { kind: "assert", value: null, as: null, reason: ractor },
  ],
};
