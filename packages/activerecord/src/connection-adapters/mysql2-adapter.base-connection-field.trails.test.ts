import { describe, it, expect, vi, afterEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";

describe("Mysql2Adapter base _connection field", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubNewClient(): { end: ReturnType<typeof vi.fn> } {
    const end = vi.fn(() => Promise.resolve());
    const fakeConn = {
      end,
      ping: () => Promise.resolve(),
      connection: { _handshakePacket: { serverVersion: "8.0.28" } },
      query: () => Promise.resolve([[]]),
    };
    vi.spyOn(Mysql2Adapter, "newClient").mockResolvedValue(fakeConn as never);
    return { end };
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
    expect(await adapter.active()).toBe(true);
  });

  it("nulls _connection on disconnectBang and repopulates it on the next connect", async () => {
    const { end } = stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    adapter.disconnectBang();
    expect(connectionOf(adapter)).toBeNull();
    expect(end).toHaveBeenCalledTimes(1);

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

    const opts = { materializeTransactions: false, allowRetry: false } as const;
    await adapter.withRawConnection(opts, () => undefined);
    await adapter.withRawConnection(opts, () => undefined);
    await adapter.withRawConnection(opts, () => undefined);

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
