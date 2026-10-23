import type {} from "@blazetrails/vitest-matchers";
import { Logger } from "@blazetrails/activesupport";
import { Queue, StringIO } from "@blazetrails/ruby-compat";
import { Event } from "@blazetrails/ruby-compat/concurrent/event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Base as Server } from "../../server/base.js";

export const WAIT_WHEN_EXPECTING_EVENT = 3;
export const WAIT_WHEN_NOT_EXPECTING_EVENT = 0.2;

type Callback = (message: unknown) => unknown;

export interface SubscriptionAdapter {
  broadcast(channel: string, payload: unknown): Promise<unknown>;
  subscribe(channel: string, callback: Callback, successCallback?: () => unknown): Promise<unknown>;
  unsubscribe(channel: string, callback: Callback): Promise<unknown>;
  shutdown(): Promise<unknown>;
}

export interface CommonSubscriptionAdapterTestHost {
  rxAdapter: SubscriptionAdapter;
  txAdapter: SubscriptionAdapter;
  cableConfig(): Record<string, unknown>;
  setup?(): Promise<void> | void;
}

export function commonSubscriptionAdapterTest(host: CommonSubscriptionAdapterTestHost): void {
  beforeEach(async () => {
    const server = new Server();
    server.config.cable = { ...host.cableConfig() };
    server.config.logger = Object.assign(new Logger(new StringIO()), { level: Logger.UNKNOWN });

    const adapterKlass = (await server.config.pubsubAdapter()) as new (
      server: Server,
    ) => SubscriptionAdapter;

    host.rxAdapter = new adapterKlass(server);
    host.txAdapter = new adapterKlass(server);
    await host.setup?.();
  });

  afterEach(async () => {
    for (const adapter of new Set([host.rxAdapter, host.txAdapter])) {
      if (adapter != null) await adapter.shutdown();
    }
  });

  it("subscribe and unsubscribe", async () => {
    await subscribeAsQueue(host, "channel", undefined, async (_queue) => {});
  });

  it("basic broadcast", async () => {
    await subscribeAsQueue(host, "channel", undefined, async (queue) => {
      await host.txAdapter.broadcast("channel", "hello world");

      expect(await queue.pop()).toBe("hello world");
    });
  });

  it("broadcast after unsubscribe", async () => {
    let keepQueue: Queue | null = null;
    await subscribeAsQueue(host, "channel", undefined, async (queue) => {
      keepQueue = queue;

      await host.txAdapter.broadcast("channel", "hello world");

      expect(await queue.pop()).toBe("hello world");
    });

    await host.txAdapter.broadcast("channel", "hello void");

    await sleep(WAIT_WHEN_NOT_EXPECTING_EVENT);
    expect(keepQueue!).toBeEmpty();
  });

  it("multiple broadcast", async () => {
    await subscribeAsQueue(host, "channel", undefined, async (queue) => {
      await host.txAdapter.broadcast("channel", "bananas");
      await host.txAdapter.broadcast("channel", "apples");

      const received: unknown[] = [];
      for (let i = 0; i < 2; i++) received.push(await queue.pop());
      expect(received.sort()).toEqual(["apples", "bananas"]);
    });
  });

  it("identical subscriptions", async () => {
    await subscribeAsQueue(host, "channel", undefined, async (queue) => {
      await subscribeAsQueue(host, "channel", undefined, async (queue2) => {
        await host.txAdapter.broadcast("channel", "hello");

        expect(await queue2.pop()).toBe("hello");
      });

      expect(await queue.pop()).toBe("hello");
    });
  });

  it("simultaneous subscriptions", async () => {
    await subscribeAsQueue(host, "channel", undefined, async (queue) => {
      await subscribeAsQueue(host, "other channel", undefined, async (queue2) => {
        await host.txAdapter.broadcast("channel", "apples");
        await host.txAdapter.broadcast("other channel", "oranges");

        expect(await queue.pop()).toBe("apples");
        expect(await queue2.pop()).toBe("oranges");
      });
    });
  });

  it("channel filtered broadcast", async () => {
    await subscribeAsQueue(host, "channel", undefined, async (queue) => {
      await host.txAdapter.broadcast("other channel", "one");
      await host.txAdapter.broadcast("channel", "two");

      expect(await queue.pop()).toBe("two");
    });
  });

  it("long identifiers", async () => {
    const channel1 = "a".repeat(100) + "1";
    const channel2 = "a".repeat(100) + "2";
    await subscribeAsQueue(host, channel1, undefined, async (queue) => {
      await subscribeAsQueue(host, channel2, undefined, async (queue2) => {
        await host.txAdapter.broadcast(channel1, "apples");
        await host.txAdapter.broadcast(channel2, "oranges");

        expect(await queue.pop()).toBe("apples");
        expect(await queue2.pop()).toBe("oranges");
      });
    });
  });
}

export async function subscribeAsQueue(
  host: CommonSubscriptionAdapterTestHost,
  channel: string,
  adapter: SubscriptionAdapter = host.rxAdapter,
  block: (queue: Queue) => Promise<void>,
): Promise<void> {
  const queue = new Queue();

  const callback: Callback = (data) => queue.push(data);
  const subscribed = new Event();
  try {
    await adapter.subscribe(channel, callback, () => subscribed.set());
    await subscribed.wait(WAIT_WHEN_EXPECTING_EVENT);
    expect(subscribed.isSet()).toBe(true);

    await block(queue);

    await sleep(WAIT_WHEN_NOT_EXPECTING_EVENT);
    expect(queue).toBeEmpty();
  } finally {
    if (subscribed.isSet()) await adapter.unsubscribe(channel, callback);
  }
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
