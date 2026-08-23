import { describe, it, expect, vi, afterAll } from "vitest";
import { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { setupAdapterSuite } from "./setup-adapter-suite.js";

interface RawAdapter {
  exec(sql: string): Promise<void>;
  execute(sql: string): Promise<unknown[]>;
}

describe("setupAdapterSuite — schema + transactional rollback", () => {
  const setup = vi.fn(async (adapter: SQLite3Adapter) => {
    await adapter.exec(`CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)`);
  });

  const suite = setupAdapterSuite({
    factory: () => new BetterSQLite3Adapter(":memory:"),
    setup,
  });

  const a = (): RawAdapter => suite.adapter as unknown as RawAdapter;

  it("first insert is rolled back between tests", async () => {
    await a().exec(`INSERT INTO widgets (id, name) VALUES (1, 'alpha')`);
    const rows = await a().execute(`SELECT * FROM widgets`);
    expect(rows).toHaveLength(1);
  });

  it("second test sees clean schema (rollback isolated row from first test)", async () => {
    const before = await a().execute(`SELECT * FROM widgets`);
    expect(before).toHaveLength(0);
    await a().exec(`INSERT INTO widgets (id, name) VALUES (2, 'beta')`);
    expect(await a().execute(`SELECT * FROM widgets`)).toHaveLength(1);
  });

  it("setup ran exactly once across both sibling tests", () => {
    expect(setup).toHaveBeenCalledTimes(1);
  });
});

describe("setupAdapterSuite — close() and teardown semantics", () => {
  const defaultCloseSpy = vi.fn(async () => {});
  const defaultTeardown = vi.fn(async () => {});
  const optOutCloseSpy = vi.fn(async () => {});
  let optOutRealClose: (() => Promise<void>) | undefined;

  describe("closeOnTeardown defaults to true", () => {
    setupAdapterSuite({
      factory: () => {
        const adapter = new BetterSQLite3Adapter(":memory:");
        const realClose = adapter.close.bind(adapter);
        adapter.close = async () => {
          await defaultCloseSpy();
          await realClose();
        };
        return adapter;
      },
      teardown: defaultTeardown,
    });

    it("teardown and close have not yet fired during the test phase", () => {
      expect(defaultTeardown).not.toHaveBeenCalled();
      expect(defaultCloseSpy).not.toHaveBeenCalled();
    });
  });

  describe("closeOnTeardown:false skips close()", () => {
    setupAdapterSuite({
      factory: () => {
        const adapter = new BetterSQLite3Adapter(":memory:");
        optOutRealClose = adapter.close.bind(adapter);
        adapter.close = async () => {
          await optOutCloseSpy();
          await optOutRealClose!();
        };
        return adapter;
      },
      closeOnTeardown: false,
    });

    it("placeholder so the inner describe registers its hooks", () => {
      expect(optOutCloseSpy).not.toHaveBeenCalled();
    });
  });

  afterAll(async () => {
    expect(defaultTeardown).toHaveBeenCalledTimes(1);
    expect(defaultCloseSpy).toHaveBeenCalledTimes(1);
    expect(defaultTeardown.mock.invocationCallOrder[0]).toBeLessThan(
      defaultCloseSpy.mock.invocationCallOrder[0],
    );
    expect(optOutCloseSpy).not.toHaveBeenCalled();
    if (optOutRealClose) await optOutRealClose();
  });
});
