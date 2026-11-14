import { describe, expect, it } from "vitest";
import type { Mutex } from "@blazetrails/ruby-compat";
import type { StreamEventLoop } from "../../lib/connection/stream-event-loop.js";
import { Listener, type Redis } from "../../lib/subscription-adapter/redis.js";

describe("Redis::Listener", () => {
  it("removeChannel resolves after its contended critical section has run", async () => {
    const listener = new Listener({} as Redis, {}, {} as StreamEventLoop);
    const internals = listener as unknown as {
      _subscriptionLock: Mutex;
      _whenConnected: unknown[];
    };
    let release!: () => void;
    const held = internals._subscriptionLock.synchronize(
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    const removed = listener.removeChannel("chat");
    expect(internals._whenConnected).toHaveLength(0);
    release();
    await removed;
    expect(internals._whenConnected).toHaveLength(1);
    await held;
  });

  it("shutdown nulls the subscribed client only after its unsubscribe has completed", async () => {
    const listener = new Listener({} as Redis, {}, {} as StreamEventLoop);
    const internals = listener as unknown as {
      _subscribedClient: unknown;
      _thread: { isAlive(): boolean };
    };
    const seen: unknown[] = [];
    let finish!: () => void;
    const client = {
      unsubscribe: () => new Promise<void>((resolve) => (finish = resolve)),
    };
    internals._subscribedClient = client;
    internals._thread = { isAlive: () => false };

    const shutdown = listener.shutdown();
    await Promise.resolve();
    seen.push(internals._subscribedClient);
    finish();
    await shutdown;
    seen.push(internals._subscribedClient);

    expect(seen).toEqual([client, null]);
  });
});
