import { describe, it } from "vitest";

describe("SQLite3TransactionTest", () => {
  it.skip("shared_cached? is true when cache-mode is enabled", () => {});
  it.skip("shared_cached? is false when cache-mode is disabled", () => {});
  it.skip("raises when trying to open a transaction in a isolation level other than `read_uncommitted`", () => {});
  it.skip("raises when trying to open a read_uncommitted transaction but shared-cache mode is turned off", () => {});
  it.skip("opens a `read_uncommitted` transaction", () => {});
  it.skip("reset the read_uncommitted PRAGMA when a transaction is rolled back", () => {});
  it.skip("reset the read_uncommitted PRAGMA when a transaction is committed", () => {});
  it.skip("set the read_uncommitted PRAGMA to its previous value", () => {});
});
