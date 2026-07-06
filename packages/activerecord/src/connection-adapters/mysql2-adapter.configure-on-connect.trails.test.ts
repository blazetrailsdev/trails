import { describe, it, expect, vi, afterEach } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";

// Trails-specific guards (no Rails counterpart): verify the connect-time
// configure_connection gate. Rails runs configure_connection on every fresh
// connect (connect!/reconnect! → attempt_configure_connection). trails'
// connectBang opens the raw socket directly (bypassing verify!), so the eager
// query-loop connect must itself run configureConnection — exactly once per
// physical socket, with no double-configure when verify/reconnect follows.
//
// These run offline: Mysql2Adapter.newClient is stubbed to return a fake
// connection so no real socket is opened. `_syncDatabaseTimezone` runs only
// when configureConnection's body executes (past its gate), so spying on it
// counts real configures.
describe("Mysql2Adapter configure-on-fresh-connect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubNewClient(): { end: () => Promise<void>; query: () => Promise<void> } {
    const fakeConn = { end: () => Promise.resolve(), query: () => Promise.resolve() };
    vi.spyOn(Mysql2Adapter, "newClient").mockResolvedValue(fakeConn as never);
    return fakeConn;
  }

  it("runs configureConnection exactly once on the eager connectBang path", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const configureSpy = vi.spyOn(
      adapter as unknown as { _syncDatabaseTimezone(): void },
      "_syncDatabaseTimezone",
    );

    await adapter.connectBang();

    expect(configureSpy).toHaveBeenCalledTimes(1);
  });

  it("does not double-configure when a verify/reconnect configureConnection follows connect", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const configureSpy = vi.spyOn(
      adapter as unknown as { _syncDatabaseTimezone(): void },
      "_syncDatabaseTimezone",
    );

    await adapter.connectBang();
    // reconnectBang's attemptConfigureConnection issues configureConnection()
    // argless after the raw connect — the gate must make it a no-op.
    adapter.configureConnection();

    expect(configureSpy).toHaveBeenCalledTimes(1);
  });

  it("re-configures the next connection after a disconnect resets the gate", async () => {
    stubNewClient();
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const configureSpy = vi.spyOn(
      adapter as unknown as { _syncDatabaseTimezone(): void },
      "_syncDatabaseTimezone",
    );

    await adapter.connectBang();
    adapter.disconnectBang();
    await adapter.connectBang();

    expect(configureSpy).toHaveBeenCalledTimes(2);
  });
});
