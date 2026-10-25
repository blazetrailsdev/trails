import { Logger } from "@blazetrails/activesupport";
import { Handler } from "@blazetrails/rack";
import { StringIO, rbModConstSet, registerConstant } from "@blazetrails/ruby-compat";
import * as Client from "@rails/actioncable";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Base as ChannelBase } from "./channel/base.js";
import { Base as ConnectionBase } from "./connection/base.js";
import { ActionCable } from "./namespaces.js";
import type { Base as ServerBase } from "./server/base.js";
import "./test-helpers/test-helper.js";

type Message = Record<string, unknown>;

const PublishedClientTest = { name: "PublishedClientTest" };
registerConstant("PublishedClientTest", PublishedClientTest);

class Connection extends ConnectionBase {
  declare id: string;

  connect(): void {
    this.id = this.request.params["id"] as string;
  }
}
(Connection as unknown as { identifiedBy(...ids: string[]): void }).identifiedBy("id");

class EchoChannel extends ChannelBase {
  protected override subscribed(): unknown {
    return this.streamFrom("global");
  }

  ding(data: Message): unknown {
    return this.transmit({ dong: data["message"] });
  }

  bulk(data: Message): unknown {
    return (ActionCable.server() as ServerBase).broadcast("global", { wide: data["message"] });
  }
}
rbModConstSet(PublishedClientTest, "EchoChannel", EchoChannel);

// global "visibilitychange" listener, which Node's globalThis does not have.
const visibilityShim = globalThis as unknown as Record<string, unknown>;

function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = (): void => {
      if (condition()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error("timed out"));
      setTimeout(check, 20);
    };
    check();
  });
}

describe("published client", () => {
  beforeAll(() => {
    visibilityShim["addEventListener"] ??= () => {};
    visibilityShim["removeEventListener"] ??= () => {};
    Client.adapters.WebSocket = globalThis.WebSocket;
  });

  afterAll(() => {
    Client.ConnectionMonitor.staleThreshold = 6;
  });

  beforeEach(async () => {
    ActionCable._server = null;
    const server = ActionCable.server() as ServerBase;
    const logger = new Logger(new StringIO());
    logger.level = Logger.UNKNOWN;
    server.config.logger = logger;

    server.config.cable = { adapter: "async" };
    await server.config.loadPubsubAdapter();
    server.config.connectionClass = () => Connection;

    server.config.disableRequestForgeryProtection = true;
  });

  it("the published client subscribes, performs, receives a broadcast and is disconnected by the server", async () => {
    const app = ActionCable.server() as ServerBase;
    const httpServer = await Handler.Node.run(app as never, { Host: "127.0.0.1", Port: 0 });
    const port = (httpServer.address() as { port: number }).port;
    const consumer = Client.createConsumer(`ws://127.0.0.1:${port}/?id=1`);

    try {
      const events: string[] = [];
      const received: Message[] = [];
      const frames: Message[] = [];

      consumer.subscriptions.create(
        { channel: "PublishedClientTest::EchoChannel" },
        {
          connected: ({ reconnected }: { reconnected: boolean }) =>
            events.push(reconnected ? "reconnected" : "connected"),
          disconnected: () => events.push("disconnected"),
          received: (data: Message) => received.push(data),
        },
      );
      const connection = consumer.connection;
      await waitFor(() => events.includes("connected"));
      connection.webSocket.addEventListener("message", (event: MessageEvent) =>
        frames.push(JSON.parse(event.data as string) as Message),
      );

      expect(connection.getProtocol()).toBe("actioncable-v1-json");
      expect(connection.isProtocolSupported()).toBe(true);

      const subscription = consumer.subscriptions.subscriptions[0];
      subscription.perform("ding", { message: "hello" });
      await waitFor(() => received.length === 1);
      expect(received[0]).toEqual({ dong: "hello" });

      subscription.perform("bulk", { message: "everyone" });
      await waitFor(() => received.length === 2);
      expect(received[1]).toEqual({ wide: "everyone" });

      await waitFor(() => frames.some((f) => f["type"] === "ping"));
      const ping = frames.find((f) => f["type"] === "ping")!;
      expect(Number.isInteger(ping["message"])).toBe(true);
      expect(connection.monitor.pingedAt).toBeGreaterThan(0);

      Client.ConnectionMonitor.staleThreshold = 0.3;
      await app.remoteConnections.where({ id: "1" }).disconnect();
      await waitFor(() => events.includes("reconnected"));
      expect(connection.monitor.isRunning()).toBe(true);
      expect(app.connections.length).toBe(1);
      Client.ConnectionMonitor.staleThreshold = 6;

      await app.remoteConnections.where({ id: "1" }).disconnect({ reconnect: false });
      await waitFor(() => !connection.isOpen() && events.at(-1) === "disconnected");
      expect(connection.monitor.isRunning()).toBe(false);
      await waitFor(() => app.connections.length === 0);
    } finally {
      consumer.disconnect();
      await Handler.Node.shutdown();
    }
  }, 20_000);
});
