import { describe, it, expect, vi, afterEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";

describe("Mysql2Adapter connected? vs active?", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubNewClient(ping: () => Promise<void>): void {
    const fakeConn = {
      end: () => Promise.resolve(),
      connection: { _handshakePacket: { serverVersion: "8.0.28" } },
      query: () => Promise.resolve([[]]),
      ping,
    };
    vi.spyOn(Mysql2Adapter, "newClient").mockResolvedValue(fakeConn as never);
  }

  it("keeps isConnected true after a failed ping while active goes false", async () => {
    stubNewClient(() => Promise.reject(new Error("server has gone away")));
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    expect(adapter.isConnected()).toBe(true);

    expect(await adapter.active()).toBe(false);

    expect(adapter.isConnected()).toBe(true);
  });

  it("restores active on a successful ping", async () => {
    let fail = true;
    stubNewClient(() => (fail ? Promise.reject(new Error("gone")) : Promise.resolve()));
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await adapter.connectBang();
    expect(await adapter.active()).toBe(false);

    fail = false;
    expect(await adapter.active()).toBe(true);
    expect(adapter.isConnected()).toBe(true);
  });

  it("reports not connected when the raw handle is absent", async () => {
    stubNewClient(() => Promise.resolve());
    const adapter = new Mysql2Adapter({ host: "localhost" });

    expect(adapter.isConnected()).toBe(false);
    await adapter.connectBang();
    adapter.disconnectBang();
    expect(adapter.isConnected()).toBe(false);
    expect(await adapter.active()).toBe(false);
  });
});
