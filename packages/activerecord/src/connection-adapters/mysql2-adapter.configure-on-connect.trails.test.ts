import { describe, it, expect, vi, afterEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";

describe("Mysql2Adapter configure-on-fresh-connect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubNewClient(version = "8.0.28"): void {
    const fakeConn = {
      end: () => Promise.resolve(),
      connection: { _handshakePacket: { serverVersion: version } },
      query: () => Promise.resolve([[]]),
    };
    vi.spyOn(Mysql2Adapter, "newClient").mockResolvedValue(fakeConn as never);
  }

  it("runs the connect-once configure exactly once on the eager connectBang path", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const checkVersionSpy = vi.spyOn(adapter, "checkVersion");

    await adapter.connectBang();

    expect(checkVersionSpy).toHaveBeenCalledTimes(1);
  });

  it("does not repeat the connect-once configure when a verify/reconnect configureConnection follows connect", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const checkVersionSpy = vi.spyOn(adapter, "checkVersion");
    const timezoneSpy = vi.spyOn(
      adapter as unknown as { _syncDatabaseTimezone(): void },
      "_syncDatabaseTimezone",
    );

    await adapter.connectBang();
    await adapter.configureConnection();

    expect(checkVersionSpy).toHaveBeenCalledTimes(1);
    expect(timezoneSpy).toHaveBeenCalledTimes(3);
  });

  it("rejects the connect when the server version is below the 5.6.4 floor", async () => {
    const { DatabaseVersionError } = await import("../errors.js");
    stubNewClient("5.6.3");
    const adapter = new Mysql2Adapter({ host: "localhost" });

    await expect(adapter.connectBang()).rejects.toThrow(DatabaseVersionError);
  });

  it("re-runs the connect-once configure for the next connection after a disconnect resets the gate", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const checkVersionSpy = vi.spyOn(adapter, "checkVersion");

    await adapter.connectBang();
    adapter.disconnectBang();
    await adapter.connectBang();

    expect(checkVersionSpy).toHaveBeenCalledTimes(2);
  });
});
