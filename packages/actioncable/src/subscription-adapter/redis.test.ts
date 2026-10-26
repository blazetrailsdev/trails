import { Logger } from "@blazetrails/activesupport";
import { Process, StringIO, except } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../index.js";
import { Base as Server } from "../server/base.js";

const redisNew = vi.hoisted(() => vi.fn());

vi.mock("ioredis", () => ({
  Redis: class {
    constructor(...args: unknown[]) {
      redisNew(...args);
    }
  },
}));

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

function connectorTests(host: ConnectorHost): void {
  let adapter: object;

  beforeEach(async () => {
    redisNew.mockClear();
    adapter = await buildAdapter(host);
  });

  it("sets connection id for connection", () => {
    redisConnection(adapter);
    expect(redisNew).toHaveBeenCalledWith(host.expectedConnection());
  });
}

describe("RedisAdapterTest", () => {
  describe("ConnectorDefaultID", () => {
    connectorTests(connectorDefaultID);
  });

  describe("ConnectorCustomID", () => {
    connectorTests({
      ...connectorDefaultID,
      cableConfig() {
        return { ...connectorDefaultID.cableConfig.call(this), id: this.connectionId() };
      },
      connectionId() {
        return "Some custom ID";
      },
    });
  });

  describe("ConnectorWithExcluded", () => {
    connectorTests({
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
    });
  });

  describe("SentinelConfigAsHash", () => {
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
      redisNew.mockClear();
      adapter = await buildAdapter(host);
    });

    it("sets sentinels as array of hashes with keyword arguments", () => {
      redisConnection(adapter);
      expect(redisNew).toHaveBeenCalledWith(host.expectedConnection());
    });
  });
});
