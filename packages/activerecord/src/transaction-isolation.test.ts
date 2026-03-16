import { describe, it } from "vitest";

describe("TransactionIsolationUnsupportedTest", () => {
  it.skip("setting the isolation level raises an error", () => {});
});

describe("TransactionIsolationTest", () => {
  it.skip("read uncommitted", () => {});
  it.skip("read committed", () => {});
  it.skip("repeatable read", () => {});
  it.skip("serializable", () => {});
  it.skip("setting isolation when joining a transaction raises an error", () => {});
  it.skip("setting isolation when starting a nested transaction raises error", () => {});
});
