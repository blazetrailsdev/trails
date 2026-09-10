import { describe, expect, it } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";

class DisconnectAdapter extends AbstractAdapter {
  static override readonly ADAPTER_NAME = "DisconnectAdapter";

  attachRawConnection(): void {
    this._connection = this;
  }

  currentConnection(): AbstractAdapter | null {
    return this._connection;
  }
}

describe("AbstractAdapter#disconnect!", () => {
  it("waits for the adapter lock before touching connection state", async () => {
    const adapter = new DisconnectAdapter({});
    adapter.attachRawConnection();

    const observed: Array<AbstractAdapter | null> = [];
    const query = adapter.lock.synchronize(async () => {
      for (let i = 0; i < 5; i++) {
        observed.push(adapter.currentConnection());
        await Promise.resolve();
      }
    });

    const disconnecting = adapter.disconnectBang();
    await Promise.all([query, disconnecting]);

    expect(observed).toHaveLength(5);
    expect(observed.every((conn) => conn === (adapter as AbstractAdapter))).toBe(true);
  });

  it("does not nil the raw connection in the abstract body", async () => {
    const adapter = new DisconnectAdapter({});
    adapter.attachRawConnection();

    await adapter.disconnectBang();

    expect(adapter.currentConnection()).toBe(adapter as AbstractAdapter);
  });
});
