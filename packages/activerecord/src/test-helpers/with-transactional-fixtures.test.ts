import { describe, it, expect, beforeAll } from "vitest";
import {
  createTestAdapter,
  shouldSkipGlobalReset,
  type TestDatabaseAdapter,
} from "../test-adapter.js";
import { defineSchema } from "./define-schema.js";
import { withTransactionalFixtures } from "./with-transactional-fixtures.js";

interface AdapterWithExec {
  exec(sql: string): Promise<void>;
  execute(sql: string): Promise<unknown[]>;
  innerAdapter: {
    transactionManager: {
      beginTransaction(opts: Record<string, unknown>): Promise<unknown>;
      commitTransaction(): Promise<void>;
    };
  };
}

describe("withTransactionalFixtures", () => {
  let adapter: TestDatabaseAdapter;
  const a = (): AdapterWithExec => adapter as unknown as AdapterWithExec;

  beforeAll(async () => {
    adapter = createTestAdapter();
    await a().exec(`CREATE TABLE fixture_users (id INTEGER PRIMARY KEY, name TEXT)`);
  });

  withTransactionalFixtures(() => adapter);

  // These two tests run in order. If the wrap works, the second sees zero
  // rows because the first's INSERT was rolled back by `afterEach`. If it
  // doesn't, the second test sees the row from the first.
  it("inserts a row (first run)", async () => {
    await a().exec(`INSERT INTO fixture_users (id, name) VALUES (1, 'alice')`);
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("sees zero rows because the previous insert rolled back", async () => {
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(0);
  });

  it("nested user transaction becomes a savepoint and still rolls back at teardown", async () => {
    await a().innerAdapter.transactionManager.beginTransaction({});
    await a().exec(`INSERT INTO fixture_users (id, name) VALUES (2, 'bob')`);
    await a().innerAdapter.transactionManager.commitTransaction();
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("nested transaction commit was a savepoint release, outer still rolls back", async () => {
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(0);
  });
});

// Mirrors Rails' per-class `self.use_transactional_tests = false`
// (test_fixtures.rb:34, 108): when the flag is false, transactional
// fixtures deactivate and the file falls back to the legacy global reset.
describe("withTransactionalFixtures (useTransactionalTests=false opt-out)", () => {
  let adapter: TestDatabaseAdapter;
  const a = (): AdapterWithExec => adapter as unknown as AdapterWithExec;

  // Exercises the supported integration: defineSchema(..., { useTransactionalTests: false })
  // sets the per-adapter flag, then withTransactionalFixtures reads it in
  // its beforeAll (registered next, so user's beforeAll runs first).
  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(
      adapter,
      { optout_marker: { name: "string" } },
      { useTransactionalTests: false },
    );
  });

  withTransactionalFixtures(() => adapter);

  // The helper is inactive — it must not open a transaction in beforeEach.
  // If the helper were active, its beforeEach would have opened the outer
  // tx and our manual beginTransaction would nest as a savepoint
  // (openTransactions==2); when inactive, openTransactions==1 after our
  // manual begin.
  it("does not open a transaction in beforeEach when opted out", async () => {
    const tm = a().innerAdapter.transactionManager as unknown as {
      openTransactions: number;
      beginTransaction(opts: Record<string, unknown>): Promise<unknown>;
      rollbackTransaction(): Promise<void>;
    };
    expect(tm.openTransactions).toBe(0);
    await tm.beginTransaction({});
    expect(tm.openTransactions).toBe(1);
    await tm.rollbackTransaction();
  });

  it("does not push the global-reset skip when opted out", () => {
    // When useTransactionalTests=false, the helper must not call
    // pushSkipGlobalReset — otherwise opted-out files would silently
    // bypass the global resetTestAdapterState beforeEach they rely on.
    expect(shouldSkipGlobalReset()).toBe(false);
  });
});
