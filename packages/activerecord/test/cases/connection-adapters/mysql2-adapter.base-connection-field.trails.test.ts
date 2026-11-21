import { describe, it, expect, vi, afterEach } from "vitest";
import { Mysql2Adapter } from "../../../lib/connection-adapters/mysql2-adapter.js";
import mysql from "mysql2/promise";
import { Mysql2, type Client } from "@blazetrails/mysql2";

async function clientOn(connection: object): Promise<Client> {
  const createConnection = vi
    .spyOn(mysql, "createConnection")
    .mockResolvedValue(connection as never);
  try {
    return await Mysql2.Client.new({});
  } finally {
    createConnection.mockRestore();
  }
}

describe("Mysql2Adapter base _rawConnection field", () => {
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
    vi.spyOn(mysql, "createConnection").mockResolvedValue(fakeConn as never);
    return { end };
  }

  function connectionOf(adapter: Mysql2Adapter): unknown {
    return (adapter as unknown as { _rawConnection: unknown })._rawConnection;
  }

  it("populates the base _rawConnection field on connectBang", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    expect(connectionOf(adapter)).toBeNull();
    await adapter.connectBang();
    expect(connectionOf(adapter)).not.toBeNull();
    expect(adapter.isConnected()).toBe(true);
    expect(await adapter.active()).toBe(true);
  });

  it("nulls _rawConnection on disconnectBang and repopulates it on the next connect", async () => {
    const { end } = stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    await adapter.disconnectBang();
    expect(connectionOf(adapter)).toBeNull();
    expect(end).toHaveBeenCalledTimes(1);

    await adapter.connectBang();
    expect(connectionOf(adapter)).not.toBeNull();
  });

  it("repopulates _rawConnection across a reconnect", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    await adapter.reconnect();
    expect(connectionOf(adapter)).not.toBeNull();
    expect(adapter.isConnected()).toBe(true);
  });

  it("discardBang during an in-flight reconnect abandons the client the connect installs", async () => {
    const end = vi.fn(() => Promise.resolve());
    const client = await clientOn({ end, query: () => Promise.resolve([[]]) });
    let resolve!: (conn: never) => void;
    const spy = vi
      .spyOn(Mysql2Adapter, "newClient")
      .mockReturnValue(new Promise((r) => (resolve = r)) as never);
    const adapter = new Mysql2Adapter({ host: "localhost" });

    const reconnect = adapter.reconnect();
    for (let i = 0; i < 1000 && spy.mock.calls.length < 1; i++) await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);

    const discarded = adapter.discardBang();
    resolve(client as never);
    await reconnect;
    await discarded;

    expect(connectionOf(adapter)).toBeNull();
    expect(end).not.toHaveBeenCalled();
  });

  it("nulls _rawConnection on discardBang", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    await adapter.discardBang();
    expect(connectionOf(adapter)).toBeNull();
  });

  it("nulls _rawConnection on close", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    await adapter.disconnectBang();
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
