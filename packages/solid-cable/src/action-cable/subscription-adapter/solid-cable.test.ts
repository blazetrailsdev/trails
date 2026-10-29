import type {} from "@blazetrails/vitest-matchers";
import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import { Base as Server } from "@blazetrails/actioncable/server/base";
import type { SubscriptionAdapter } from "@blazetrails/actioncable/test-helpers/subscription-adapter/common";
import { Logger } from "@blazetrails/activesupport";
import { Queue, StringIO } from "@blazetrails/ruby-compat";
import { Event } from "@blazetrails/ruby-compat/concurrent/event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Message, SolidCable } from "../../index.js";
import { loadCableSchema } from "../../test-helpers/cable-schema.js";
import { useDummyApplication, withCableConfig } from "../../test-helpers/config-stubs.js";

const WAIT_WHEN_EXPECTING_EVENT = 1;
const WAIT_WHEN_NOT_EXPECTING_EVENT = 0.2;

type Callback = (message: unknown) => unknown;

describe("ActionCable::SubscriptionAdapter::SolidCableTest", () => {
  let rxAdapter: SubscriptionAdapter;
  let txAdapter: SubscriptionAdapter;

  useDummyApplication();

  beforeAll(async () => {
    await loadCableSchema();
  });

  afterAll(async () => {
    await Message.deleteAll();
  });

  beforeEach(async () => {
    const server = new Server();
    server.config.cable = { ...cableConfig() };
    server.config.logger = Object.assign(new Logger(new StringIO()), { level: Logger.UNKNOWN });

    await server.config.loadPubsubAdapter();
    const adapterKlass = server.config.pubsubAdapter() as new (
      server: Server,
    ) => SubscriptionAdapter;

    rxAdapter = new adapterKlass(server);
    txAdapter = new adapterKlass(server);

    await txAdapter.shutdown();
    txAdapter = rxAdapter;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const adapter of new Set([rxAdapter, txAdapter])) {
      if (adapter != null) await adapter.shutdown();
    }
  });

  it("subscribe_and_unsubscribe", async () => {
    await subscribeAsQueue("channel", undefined, async (_queue) => {});
  });

  it("basic_broadcast", async () => {
    await subscribeAsQueue("channel", undefined, async (queue) => {
      await txAdapter.broadcast("channel", "hello world");

      expect(await queue.pop()).toBe("hello world");
    });
  });

  it("broadcast_after_unsubscribe", async () => {
    let keepQueue: Queue | null = null;
    await subscribeAsQueue("channel", undefined, async (queue) => {
      keepQueue = queue;

      await txAdapter.broadcast("channel", "hello world");

      expect(await queue.pop()).toBe("hello world");
    });

    await txAdapter.broadcast("channel", "hello void");

    await sleep(WAIT_WHEN_NOT_EXPECTING_EVENT);
    expect(keepQueue!).toBeEmpty();
  });

  it("trims_after_unsubscribe", { timeout: 30_000 }, async () => {
    vi.spyOn(SolidCable, "trimChance").mockReturnValue(99.999999);
    await withCableConfig({ messageRetention: "2.seconds", trimBatchSize: 2 }, async () => {
      await subscribeAsQueue("channel", undefined, async (queue) => {
        for (let i = 0; i < 4; i++) {
          await txAdapter.broadcast("channel", "hello world");
          await sleep(3);
        }

        queue.clear();
      });
      expect(await Message.where({ channel: "channel" }).count()).toBe(1);
    });
  });

  it("multiple_broadcast", async () => {
    await subscribeAsQueue("channel", undefined, async (queue) => {
      await txAdapter.broadcast("channel", "bananas");
      await txAdapter.broadcast("channel", "apples");

      const received: unknown[] = [];
      for (let i = 0; i < 2; i++) received.push(await queue.pop());
      expect(received.sort()).toEqual(["apples", "bananas"]);
    });
  });

  it("identical_subscriptions", async () => {
    await subscribeAsQueue("channel", undefined, async (queue) => {
      await subscribeAsQueue("channel", undefined, async (queue2) => {
        await txAdapter.broadcast("channel", "hello");

        expect(await queue2.pop()).toBe("hello");
      });

      expect(await queue.pop()).toBe("hello");
    });
  });

  it("simultaneous_subscriptions", async () => {
    await subscribeAsQueue("channel", undefined, async (queue) => {
      await subscribeAsQueue("other channel", undefined, async (queue2) => {
        await txAdapter.broadcast("channel", "apples");
        await txAdapter.broadcast("other channel", "oranges");

        expect(await queue.pop()).toBe("apples");
        expect(await queue2.pop()).toBe("oranges");
      });
    });
  });

  it("channel_filtered_broadcast", async () => {
    await subscribeAsQueue("channel", undefined, async (queue) => {
      await txAdapter.broadcast("other channel", "one");
      await txAdapter.broadcast("channel", "two");

      expect(await queue.pop()).toBe("two");
    });
  });

  it("long_identifiers", async () => {
    const channel1 = `${"a".repeat(100)}1`;
    const channel2 = `${"a".repeat(100)}2`;
    await subscribeAsQueue(channel1, undefined, async (queue) => {
      await subscribeAsQueue(channel2, undefined, async (queue2) => {
        await txAdapter.broadcast(channel1, "apples");
        await txAdapter.broadcast(channel2, "oranges");

        expect(await queue.pop()).toBe("apples");
        expect(await queue2.pop()).toBe("oranges");
      });
    });
  });

  it("does not raise error when polling with no Active Record logger", async () => {
    await withActiveRecordLogger(null, async () => {
      await expect(
        subscribeAsQueue("channel", undefined, async (queue) => {
          await txAdapter.broadcast("channel", "hello world");

          expect(await queue.pop()).toBe("hello world");
        }),
      ).resolves.toBeUndefined();
    });
  });

  function cableConfig(): Record<string, unknown> {
    return {
      adapter: "solid_cable",
      messageRetention: "1.second",
      pollingInterval: "0.01.seconds",
    };
  }

  async function subscribeAsQueue(
    channel: string,
    adapter: SubscriptionAdapter = rxAdapter,
    block: (queue: Queue) => Promise<void>,
  ): Promise<void> {
    const queue = new Queue();

    const callback: Callback = (data) => queue.push(data);
    const subscribed = new Event();
    try {
      await adapter.subscribe(channel, callback, () => subscribed.set());
      await subscribed.wait(WAIT_WHEN_EXPECTING_EVENT);
      await sleep(WAIT_WHEN_EXPECTING_EVENT);
      expect(subscribed.isSet()).toBe(true);

      await block(queue);

      await sleep(WAIT_WHEN_NOT_EXPECTING_EVENT);
      expect(queue).toBeEmpty();
    } finally {
      if (subscribed.isSet()) await adapter.unsubscribe(channel, callback);
    }
  }

  async function withActiveRecordLogger(
    logger: unknown,
    block: () => Promise<void>,
  ): Promise<void> {
    const oldLogger = ActiveRecordBase.logger;
    try {
      ActiveRecordBase.logger = logger as typeof oldLogger;
      await block();
    } finally {
      ActiveRecordBase.logger = oldLogger;
    }
  }
});

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
