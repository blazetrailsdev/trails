import { describe, it, expect, beforeAll } from "vitest";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
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
