import { Logger, getEnv } from "@blazetrails/activesupport";
import { Process, StringIO, URI, except } from "@blazetrails/ruby-compat";
import { Redis as IORedis, type RedisOptions } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../index.js";
import { Base as Server } from "../server/base.js";
import {
  commonSubscriptionAdapterTest,
  subscribeAsQueue,
  type CommonSubscriptionAdapterTestHost,
} from "../test-helpers/subscription-adapter/common.js";
import { channelPrefixTest } from "../test-helpers/subscription-adapter/channel-prefix.js";

const redisNew = vi.hoisted(() => vi.fn());
const stubRedisNew = vi.hoisted(() => ({ value: false }));

vi.mock("ioredis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ioredis")>();
  return {
    ...actual,
    Redis: class {
      constructor(url: string, options: RedisOptions) {
        redisNew(options);
        if (!stubRedisNew.value) return new actual.Redis(url, options) as never;
      }

      async subscribe(): Promise<number> {
        return 0;
      }

      async unsubscribe(): Promise<number> {
        return 0;
      }
    },
  };
});

interface RedisAdapterTestHost extends CommonSubscriptionAdapterTestHost {
  redisConn?: IORedis;
}

function redisAdapterTest(cableConfig: () => Record<string, unknown>): RedisAdapterTestHost {
  const host = { cableConfig } as RedisAdapterTestHost;

  afterEach(() => {
    host.redisConn?.disconnect();
    host.redisConn = undefined;
  });

  commonSubscriptionAdapterTest(host);
  channelPrefixTest(host);

  return host;
}

async function testReconnections(host: RedisAdapterTestHost): Promise<void> {
  await subscribeAsQueue(host, "channel", undefined, async (queue) => {
    await subscribeAsQueue(host, "other channel", undefined, async (queue2) => {
      await host.txAdapter.broadcast("channel", "hello world");

      expect(await queue.pop()).toBe("hello world");

      await dropPubsubConnections(host);
      await waitPubsubConnection(redisConn(host), "channel");

      await host.txAdapter.broadcast("channel", "hallo welt");

      expect(await queue.pop()).toBe("hallo welt");

      await dropPubsubConnections(host);
      await waitPubsubConnection(redisConn(host), "channel");
      await waitPubsubConnection(redisConn(host), "other channel");

      await host.txAdapter.broadcast("channel", "hola mundo");
      await host.txAdapter.broadcast("other channel", "other message");

      expect(await queue.pop()).toBe("hola mundo");
      expect(await queue2.pop()).toBe("other message");
    });
  });
}

function redisConn(host: RedisAdapterTestHost): IORedis {
  const config = except(host.cableConfig(), "adapter");
  return (host.redisConn ??= new IORedis(config.url as string, config as RedisOptions));
}

async function dropPubsubConnections(host: RedisAdapterTestHost): Promise<void> {
  await redisConn(host).call("CLIENT", "KILL", "TYPE", "pubsub");
}

async function waitPubsubConnection(
  redisConn: IORedis,
  channel: string,
  { timeout = 5 }: { timeout?: number } = {},
): Promise<void> {
  let wait = timeout;
  for (;;) {
    if (((await redisConn.pubsub("NUMSUB", channel)) as number[]).at(-1)! > 0) break;

    await new Promise((resolve) => setTimeout(resolve, 100));
    wait -= 0.1;

    if (wait <= 0) throw new Error(`Timed out to subscribe to ${channel}`);
  }
}

function cableConfig(): Record<string, unknown> {
  const x: Record<string, unknown> = { adapter: "redis", driver: "ruby" };
  const host = getEnv("REDIS_URL");
  if (host != null) x.url = host;
  return x;
}

describe("RedisAdapterTest", () => {
  const host = redisAdapterTest(cableConfig);

  it("reconnections", () => testReconnections(host));
});

interface ConnectorHost {
  cableConfig(): Record<string, unknown>;
  connectionId(): string;
  expectedConnection(): Record<string, unknown>;
}

async function buildAdapter(host: ConnectorHost): Promise<object> {
  const server = new Server();
  server.config.cable = { ...host.cableConfig(), adapter: "redis" };
  const logger = new Logger(new StringIO());
  logger.level = Logger.UNKNOWN;
  server.config.logger = logger;

  await server.config.loadPubsubAdapter();
  const klass = server.config.pubsubAdapter() as new (server: Server) => object;
  return new klass(server);
}

function redisConnection(adapter: object): unknown {
  return (adapter as unknown as { redisConnection(): unknown }).redisConnection();
}

const connectorDefaultID: ConnectorHost = {
  cableConfig() {
    return { url: 1, host: 2, port: 3, db: 4, password: 5 };
  },

  connectionId() {
    return `ActionCable-PID-${Process.pid}`;
  },

  expectedConnection() {
    return { ...this.cableConfig(), id: this.connectionId() };
  },
};

function connectorTests(host: ConnectorHost): () => object {
  let adapter: object;

  beforeEach(async () => {
    stubRedisNew.value = true;
    redisNew.mockClear();
    adapter = await buildAdapter(host);
  });

  afterEach(() => {
    stubRedisNew.value = false;
  });

  return () => adapter;
}

function testSetsConnectionIdForConnection(host: ConnectorHost, adapter: object): void {
  redisConnection(adapter);
  expect(redisNew).toHaveBeenCalledWith(host.expectedConnection());
}

describe("RedisAdapterTest::AlternateConfiguration", () => {
  const host = redisAdapterTest(() => {
    const altCableConfig = { ...cableConfig() };
    delete altCableConfig.url;
    const url = URI.parse(getEnv("REDIS_URL") ?? "");
    return {
      ...altCableConfig,
      host: url.hostname ?? "127.0.0.1",
      port: url.port ?? 6379,
      db: 12,
    };
  });

  it("reconnections", () => testReconnections(host));
});

describe("RedisAdapterTest::ConnectorDefaultID", () => {
  const host = connectorDefaultID;
  const adapter = connectorTests(host);

  it("sets connection id for connection", () => testSetsConnectionIdForConnection(host, adapter()));
});

describe("RedisAdapterTest::ConnectorCustomID", () => {
  const host: ConnectorHost = {
    ...connectorDefaultID,
    cableConfig() {
      return { ...connectorDefaultID.cableConfig.call(this), id: this.connectionId() };
    },
    connectionId() {
      return "Some custom ID";
    },
  };
  const adapter = connectorTests(host);

  it("sets connection id for connection", () => testSetsConnectionIdForConnection(host, adapter()));
});

describe("RedisAdapterTest::ConnectorWithExcluded", () => {
  const host: ConnectorHost = {
    ...connectorDefaultID,
    cableConfig() {
      return {
        ...connectorDefaultID.cableConfig.call(this),
        adapter: "redis",
        channelPrefix: "custom",
      };
    },
    expectedConnection() {
      return except(connectorDefaultID.expectedConnection.call(this), "adapter", "channelPrefix");
    },
  };
  const adapter = connectorTests(host);

  it("sets connection id for connection", () => testSetsConnectionIdForConnection(host, adapter()));
});

describe("RedisAdapterTest::SentinelConfigAsHash", () => {
  const host: ConnectorHost = {
    cableConfig() {
      return { url: "redis://test", sentinels: [{ host: "localhost", port: 26379 }] };
    },

    expectedConnection() {
      return {
        url: "redis://test",
        sentinels: [{ host: "localhost", port: 26379 }],
        id: this.connectionId(),
      };
    },

    connectionId() {
      return `ActionCable-PID-${Process.pid}`;
    },
  };
  let adapter: object;

  beforeEach(async () => {
    stubRedisNew.value = true;
    redisNew.mockClear();
    adapter = await buildAdapter(host);
  });

  afterEach(() => {
    stubRedisNew.value = false;
  });

  it("sets sentinels as array of hashes with keyword arguments", () => {
    redisConnection(adapter);
    expect(redisNew).toHaveBeenCalledWith(host.expectedConnection());
  });
});
