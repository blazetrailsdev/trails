import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import { driverConfig, postgresSettings } from "@blazetrails/activerecord/support/config";
import { Logger, getEnv } from "@blazetrails/activesupport";
import { Process, StringIO } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../index.js";
import { Base as Server } from "../server/base.js";
import {
  commonSubscriptionAdapterTest,
  subscribeAsQueue,
  type CommonSubscriptionAdapterTestHost,
  type SubscriptionAdapter,
} from "../test-helpers/subscription-adapter/common.js";
import { channelPrefixTest } from "../test-helpers/subscription-adapter/channel-prefix.js";

describe("PostgresqlAdapterTest", () => {
  const host = {
    async setup() {},

    cableConfig() {
      return { adapter: "postgresql" };
    },
  } as unknown as CommonSubscriptionAdapterTestHost;

  beforeEach(async (context) => {
    const databaseConfig = {
      adapter: "postgresql",
      database: "activerecord_unittest",
      ...driverConfig(postgresSettings()),
    };

    await ActiveRecordBase.establishConnection(databaseConfig);

    try {
      await (await ActiveRecordBase.leaseConnection()).connectBang();
    } catch (error) {
      if (getEnv("CI")) throw error;
      context.skip(`Couldn't connect to PostgreSQL: ${JSON.stringify(databaseConfig)}`);
    }
  });

  afterEach(async () => {
    await ActiveRecordBase.connectionHandler.clearAllConnectionsBang();
  });

  commonSubscriptionAdapterTest(host);
  channelPrefixTest(host);

  function newServer(cable: Record<string, unknown>): Server {
    const server = new Server();
    server.config.cable = cable;
    server.config.logger = Object.assign(new Logger(new StringIO()), { level: Logger.UNKNOWN });
    return server;
  }

  async function applicationNames(): Promise<unknown[][]> {
    return (
      await (
        await ActiveRecordBase.leaseConnection()
      ).execQuery("SELECT application_name FROM pg_stat_activity")
    ).rows;
  }

  it("clear active record connections adapter still works", async () => {
    const server = newServer({ ...host.cableConfig() });

    await server.config.loadPubsubAdapter();
    const adapterKlass = class extends (server.config.pubsubAdapter() as new (
      server: Server,
    ) => SubscriptionAdapter) {
      isActive(): boolean {
        return (this as unknown as { _listener: unknown })._listener != null;
      }
    };

    const adapter = new adapterKlass(server);

    await subscribeAsQueue(host, "channel", adapter, async (queue) => {
      await adapter.broadcast("channel", "hello world");
      expect(await queue.pop()).toBe("hello world");
    });

    await ActiveRecordBase.connectionHandler.clearReloadableConnectionsBang();

    expect(adapter.isActive()).toBeTruthy();
  });

  it("default subscription connection identifier", async () => {
    await subscribeAsQueue(host, "channel", undefined, async () => {});

    const identifiers = await applicationNames();
    expect(identifiers).toContainEqual([`ActionCable-PID-${Process.pid}`]);
  });

  it("custom subscription connection identifier", async () => {
    const server = newServer({ ...host.cableConfig(), id: "hello-world-42" });

    await server.config.loadPubsubAdapter();
    const adapter = new (server.config.pubsubAdapter() as new (
      server: Server,
    ) => SubscriptionAdapter)(server);

    await subscribeAsQueue(host, "channel", adapter, async () => {});

    const identifiers = await applicationNames();
    expect(identifiers).toContainEqual(["hello-world-42"]);
  });
});
