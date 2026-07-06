import { describe, it, expect, vi, afterEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";

// Trails-specific guards (no Rails counterpart): verify that connectBang /
// reconnect populate the base `_connection` field so the run loop's
// `_connection === null` guard fires connectBang once per connect rather than
// on every withRawConnection call — matching Rails' `@raw_connection =
// new_client(...)` posture and the PostgreSQLAdapter. The teardown paths
// (disconnectBang / reconnect / discardBang / close) must null `_connection`
// so a re-open re-fires connectBang.
//
// These run offline: Mysql2Adapter.newClient is stubbed to return a fake
// connection so no real socket is opened.
describe("Mysql2Adapter base _connection field", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubNewClient(): void {
    const fakeConn = { end: () => Promise.resolve(), query: () => Promise.resolve() };
    vi.spyOn(Mysql2Adapter, "newClient").mockResolvedValue(fakeConn as never);
  }

  function connectionOf(adapter: Mysql2Adapter): unknown {
    return (adapter as unknown as { _connection: unknown })._connection;
  }

  it("populates the base _connection field on connectBang", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    expect(connectionOf(adapter)).toBeNull();
    await adapter.connectBang();
    expect(connectionOf(adapter)).not.toBeNull();
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.active).toBe(true);
  });

  it("nulls _connection on disconnectBang and repopulates it on the next connect", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    adapter.disconnectBang();
    expect(connectionOf(adapter)).toBeNull();

    await adapter.connectBang();
    expect(connectionOf(adapter)).not.toBeNull();
  });

  it("repopulates _connection across a reconnect", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    await adapter.reconnect();
    expect(connectionOf(adapter)).not.toBeNull();
    expect(adapter.isConnected()).toBe(true);
  });

  it("nulls _connection on discardBang", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    adapter.discardBang();
    expect(connectionOf(adapter)).toBeNull();
  });

  it("nulls _connection on close", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    await adapter.close();
    expect(connectionOf(adapter)).toBeNull();
  });

  it("run loop fires connectBang once per connect, not once per query", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const connectSpy = vi.spyOn(adapter, "connectBang");

    // Each withRawConnection call hits the base run-loop guard
    // (`_connection === null` → connectBang). With _connection populated on the
    // first connect, subsequent queries must NOT re-fire connectBang.
    const opts = { materializeTransactions: false, allowRetry: false } as const;
    await adapter.withRawConnection(opts, () => undefined);
    await adapter.withRawConnection(opts, () => undefined);
    await adapter.withRawConnection(opts, () => undefined);

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
