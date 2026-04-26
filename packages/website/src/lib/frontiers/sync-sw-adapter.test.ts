import { describe, it, expect, beforeEach } from "vitest";
import { SyncSwAdapter } from "./sync-sw-adapter.js";
import type { SwAdapterProxy } from "./sw-adapter-proxy.js";
import type { SwClient } from "./sw-client.js";
import type { SwBroadcast } from "./sw-protocol.js";

function createMockAdapter() {
  const tables = ["users", "posts"];
  const columns: Record<
    string,
    Array<{ name: string; type: string; notnull: boolean; pk: boolean }>
  > = {
    users: [
      { name: "id", type: "INTEGER", notnull: true, pk: true },
      { name: "name", type: "TEXT", notnull: false, pk: false },
    ],
    posts: [
      { name: "id", type: "INTEGER", notnull: true, pk: true },
      { name: "title", type: "TEXT", notnull: false, pk: false },
    ],
  };

  const proxy = {
    async getTables() {
      return [...tables];
    },
    async getColumns(table: string) {
      return columns[table] ?? [];
    },
    async execRaw(sql: string) {
      if (sql.includes("COUNT(*)")) {
        const table = sql.match(/FROM "(\w+)"/)?.[1];
        if (table === "users") return [{ columns: ["COUNT(*)"], values: [[5]] }];
        if (table === "posts") return [{ columns: ["COUNT(*)"], values: [[3]] }];
      }
      return [{ columns: ["id"], values: [[1]] }];
    },
  } as SwAdapterProxy;

  const broadcastListeners: Array<(msg: SwBroadcast) => void> = [];

  const client = {
    ready: true,
    async send() {
      return {};
    },
    onBroadcast(fn: (msg: SwBroadcast) => void) {
      broadcastListeners.push(fn);
      return () => {
        const idx = broadcastListeners.indexOf(fn);
        if (idx >= 0) broadcastListeners.splice(idx, 1);
      };
    },
    async destroy() {},
  } as unknown as SwClient;

  return {
    proxy,
    client,
    broadcast: (msg: SwBroadcast) => broadcastListeners.forEach((fn) => fn(msg)),
  };
}

describe("SyncSwAdapter", () => {
  let mock: ReturnType<typeof createMockAdapter>;
  let syncAdapter: SyncSwAdapter;

  beforeEach(async () => {
    mock = createMockAdapter();
    syncAdapter = new SyncSwAdapter(mock.proxy, mock.client);
    await syncAdapter.hydrate();
  });

  it("returns cached tables after hydration", () => {
    expect(syncAdapter.getTables()).toEqual(["users", "posts"]);
  });

  it("returns cached columns after hydration", () => {
    const cols = syncAdapter.getColumns("users");
    expect(cols).toHaveLength(2);
    expect(cols[0].name).toBe("id");
  });

  it("returns empty columns for unknown table", () => {
    expect(syncAdapter.getColumns("unknown")).toEqual([]);
  });

  it("returns cached COUNT(*) results synchronously", () => {
    const result = syncAdapter.execRaw('SELECT COUNT(*) FROM "users"');
    expect(result).toHaveLength(1);
    expect(result[0].values[0][0]).toBe(5);
  });

  it("returns empty for uncached queries", () => {
    const result = syncAdapter.execRaw("SELECT * FROM users LIMIT 3");
    expect(result).toEqual([]);
  });

  it("dispose stops listeners", () => {
    syncAdapter.dispose();
    mock.broadcast({ type: "db:changed" });
  });
});
