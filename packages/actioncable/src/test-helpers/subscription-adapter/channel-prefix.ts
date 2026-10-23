import { Logger } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import { expect, it } from "vitest";
import { Base as Server } from "../../server/base.js";
import { Configuration } from "../../server/configuration.js";
import {
  subscribeAsQueue,
  type CommonSubscriptionAdapterTestHost,
  type SubscriptionAdapter,
} from "./common.js";

export function channelPrefixTest(host: CommonSubscriptionAdapterTestHost): void {
  it("channel prefix", async () => {
    const server2 = new Server({ config: new Configuration() });
    server2.config.cable = { ...altCableConfig(host) };
    server2.config.logger = Object.assign(new Logger(new StringIO()), { level: Logger.UNKNOWN });

    const adapterKlass = (await server2.config.pubsubAdapter()) as new (
      server: Server,
    ) => SubscriptionAdapter;

    const rxAdapter2 = new adapterKlass(server2);
    const txAdapter2 = new adapterKlass(server2);

    await subscribeAsQueue(host, "channel", undefined, async (queue) => {
      await subscribeAsQueue(host, "channel", rxAdapter2, async (queue2) => {
        await host.txAdapter.broadcast("channel", "hello world");
        await txAdapter2.broadcast("channel", "hello world 2");

        expect(await queue.pop()).toBe("hello world");
        expect(await queue2.pop()).toBe("hello world 2");
      });
    });
  });
}

export function altCableConfig(host: CommonSubscriptionAdapterTestHost): Record<string, unknown> {
  return { ...host.cableConfig(), channelPrefix: "foo" };
}
