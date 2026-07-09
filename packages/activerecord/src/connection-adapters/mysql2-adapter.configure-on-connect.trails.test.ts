import { describe, it, expect, vi, afterEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";

// Trails-specific guards (no Rails counterpart): verify the connect-time
// configure_connection gate. Rails runs configure_connection on every fresh
// connect (connect!/reconnect! → attempt_configure_connection). trails'
// connectBang opens the raw socket directly (bypassing verify!), so the eager
// query-loop connect must itself run configureConnection — its connect-once
// work (super.configureConnection → checkVersion) exactly once per physical
// socket, with no double-configure when verify/reconnect follows. The database
// timezone reseed is deliberately ungated (Rails reassigns it on every call).
//
// These run offline: Mysql2Adapter.newClient is stubbed to return a fake
// connection so no real socket is opened. `checkVersion` runs only when
// configureConnection's gated body executes (past its gate), so spying on it
// counts connect-once configures; `_syncDatabaseTimezone` runs every call.
describe("Mysql2Adapter configure-on-fresh-connect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubNewClient(version = "8.0.28"): void {
    const fakeConn = {
      end: () => Promise.resolve(),
      // getFullVersion() (run by the connect-once configure to warm the version
      // before checkVersion) issues SELECT VERSION(); hand it a row so the warm
      // resolves offline.
      query: () => Promise.resolve([[{ v: version }]]),
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
    // reconnectBang's attemptConfigureConnection issues configureConnection()
    // argless after the raw connect — the gate must make the connect-once work
    // a no-op, but the (idempotent) timezone reseed still runs.
    adapter.configureConnection();

    expect(checkVersionSpy).toHaveBeenCalledTimes(1);
    expect(timezoneSpy).toHaveBeenCalledTimes(2);
  });

  it("rejects the connect when the server version is below the 5.6.4 floor", async () => {
    const { DatabaseVersionError } = await import("../errors.js");
    stubNewClient("5.6.3");
    const adapter = new Mysql2Adapter({ host: "localhost" });

    // The connect-once configure warms the version, then checkVersion enforces
    // the floor — a too-old server rejects the connect end-to-end (mirrors Rails'
    // configure_connection → check_version raising during connect).
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
