import { Logger, assertCalled } from "@blazetrails/activesupport";
import { Handler } from "@blazetrails/rack";
import {
  AtomicFixnum,
  Concurrent,
  RuntimeError,
  SecureRandom,
  StringIO,
  rbModConstSet,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Base as ChannelBase } from "./channel/base.js";
import { Base as ConnectionBase } from "./connection/base.js";
import { ActionCable } from "./namespaces.js";
import type { Base as ServerBase } from "./server/base.js";
import { TestCase } from "./test-helpers/test-helper.js";

const WAIT_WHEN_EXPECTING_EVENT = 2;
const WAIT_WHEN_NOT_EXPECTING_EVENT = 0.5;

type Message = Record<string, unknown>;

const sleep = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

class ClientTest extends TestCase {}
registerConstant("ClientTest", ClientTest);

class Connection extends ConnectionBase {
  declare id: string;

  connect(): void {
    this.id = (this.request.params["id"] as string | undefined) ?? SecureRandom.hex(4);
  }
}
(Connection as unknown as { identifiedBy(...ids: string[]): void }).identifiedBy("id");
rbModConstSet(ClientTest, "Connection", Connection);

class EchoChannel extends ChannelBase {
  protected override subscribed(): unknown {
    return this.streamFrom("global");
  }

  protected override unsubscribed(): unknown {
    return "Goodbye from EchoChannel!";
  }

  ding(data: Message): unknown {
    return this.transmit({ dong: data["message"] });
  }

  async delay(data: Message): Promise<unknown> {
    await sleep(1);
    return this.transmit({ dong: data["message"] });
  }

  bulk(data: Message): unknown {
    return (ActionCable.server() as ServerBase).broadcast("global", { wide: data["message"] });
  }
}
rbModConstSet(ClientTest, "EchoChannel", EchoChannel);

class SyncClient {
  readonly pings = new AtomicFixnum(0);
  private _messages: (Message | Error)[] = [];
  private _closed = false;
  private _waiters: (() => void)[] = [];
  private _ws!: globalThis.WebSocket;

  static async new(port: number, path = "/"): Promise<SyncClient> {
    const client = new SyncClient();
    await client.connect(port, path);
    return client;
  }

  private connect(port: number, path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let pending = true;
      const timer = setTimeout(() => {
        if (pending) reject(new RuntimeError("timed out opening websocket"));
      }, WAIT_WHEN_EXPECTING_EVENT * 1000);
      const ws = (this._ws = new globalThis.WebSocket(`ws://127.0.0.1:${port}${path}`, [
        "actioncable-v1-json",
      ]));

      ws.addEventListener("error", (event) => {
        const error = new RuntimeError((event as ErrorEvent).message ?? "websocket error");
        if (pending) {
          pending = false;
          clearTimeout(timer);
          reject(error);
        } else {
          this.push(error);
        }
      });

      ws.addEventListener("open", () => {
        pending = false;
        clearTimeout(timer);
        resolve();
      });

      ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data as string) as Message;
        if (message["type"] === "ping") {
          this.pings.increment();
        } else {
          this.push(message);
        }
      });

      ws.addEventListener("close", () => {
        this._closed = true;
        this.wake();
      });
    });
  }

  async readMessage(): Promise<Message> {
    await this.tryAcquire(WAIT_WHEN_EXPECTING_EVENT);

    const msg = this._messages.shift();
    if (msg === undefined) throw new RuntimeError("queue empty");
    if (msg instanceof Error) throw msg;

    return msg;
  }

  async readMessages(expectedSize = 0): Promise<Message[]> {
    const list: Message[] = [];
    for (;;) {
      if (
        await this.tryAcquire(
          list.length < expectedSize ? WAIT_WHEN_EXPECTING_EVENT : WAIT_WHEN_NOT_EXPECTING_EVENT,
        )
      ) {
        const msg = this._messages.shift()!;
        if (msg instanceof Error) throw msg;

        list.push(msg);
      } else {
        break;
      }
    }
    return list;
  }

  sendMessage(message: Message): void {
    this._ws.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    await sleep(WAIT_WHEN_NOT_EXPECTING_EVENT);

    if (this._messages.length !== 0) {
      throw new RuntimeError(`${this._messages.length} messages unprocessed`);
    }

    this._ws.close();
    await this.waitForClose();
  }

  async waitForClose(): Promise<void> {
    await this.waitFor(() => this._closed, WAIT_WHEN_EXPECTING_EVENT);
  }

  isClosed(): boolean {
    return this._closed;
  }

  private push(message: Message | Error): void {
    this._messages.push(message);
    this.wake();
  }

  private tryAcquire(timeout: number): Promise<boolean> {
    return this.waitFor(() => this._messages.length > 0, timeout);
  }

  private waitFor(condition: () => boolean, timeout: number): Promise<boolean> {
    if (condition()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._waiters = this._waiters.filter((w) => w !== check);
        resolve(false);
      }, timeout * 1000);
      const check = (): void => {
        if (!condition()) return;
        this._waiters = this._waiters.filter((w) => w !== check);
        clearTimeout(timer);
        resolve(true);
      };
      this._waiters.push(check);
    });
  }

  private wake(): void {
    for (const waiter of [...this._waiters]) waiter();
  }
}

describe("ClientTest", () => {
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

  async function withPumaServer(
    block: (port: number) => Promise<void>,
    rackApp = ActionCable.server() as ServerBase,
    port = 0,
  ): Promise<void> {
    const server = await Handler.Node.run(rackApp as never, { Host: "127.0.0.1", Port: port });

    try {
      await block((server.address() as { port: number }).port);
    } finally {
      await Handler.Node.shutdown();
    }
  }

  function websocketClient(port: number, path?: string): Promise<SyncClient> {
    return SyncClient.new(port, path);
  }

  function concurrently<T, R>(enumerable: Iterable<T>, block: (x: T) => Promise<R>): Promise<R[]> {
    return Promise.all([...enumerable].map((x) => block(x)));
  }

  const times = (n: number) => Array.from({ length: n }, (_, i) => i);
  const identifier = JSON.stringify({ channel: "ClientTest::EchoChannel" });

  it("single client", async () => {
    await withPumaServer(async (port) => {
      const c = await websocketClient(port);
      expect(await c.readMessage()).toEqual({ type: "welcome" });
      c.sendMessage({ command: "subscribe", identifier });
      expect(await c.readMessage()).toEqual({
        identifier: '{"channel":"ClientTest::EchoChannel"}',
        type: "confirm_subscription",
      });
      c.sendMessage({
        command: "message",
        identifier,
        data: JSON.stringify({ action: "ding", message: "hello" }),
      });
      expect(await c.readMessage()).toEqual({
        identifier: '{"channel":"ClientTest::EchoChannel"}',
        message: { dong: "hello" },
      });
      await c.close();
    });
  });

  it("interacting clients", async () => {
    await withPumaServer(async (port) => {
      const clients = await concurrently(times(10), () => websocketClient(port));

      const barrier1 = new Concurrent.CyclicBarrier(clients.length);
      const barrier2 = new Concurrent.CyclicBarrier(clients.length);

      await concurrently(clients, async (c) => {
        expect(await c.readMessage()).toEqual({ type: "welcome" });
        c.sendMessage({ command: "subscribe", identifier });
        expect(await c.readMessage()).toEqual({
          identifier: '{"channel":"ClientTest::EchoChannel"}',
          type: "confirm_subscription",
        });
        c.sendMessage({
          command: "message",
          identifier,
          data: JSON.stringify({ action: "ding", message: "hello" }),
        });
        expect(await c.readMessage()).toEqual({
          identifier: '{"channel":"ClientTest::EchoChannel"}',
          message: { dong: "hello" },
        });
        await barrier1.wait(WAIT_WHEN_EXPECTING_EVENT);
        c.sendMessage({
          command: "message",
          identifier,
          data: JSON.stringify({ action: "bulk", message: "hello" }),
        });
        await barrier2.wait(WAIT_WHEN_EXPECTING_EVENT);
        expect((await c.readMessages(clients.length)).length).toBe(clients.length);
      });

      await concurrently(clients, (c) => c.close());
    });
  }, 20_000);

  it("many clients", async () => {
    await withPumaServer(async (port) => {
      const clients = await concurrently(times(100), () => websocketClient(port));

      await concurrently(clients, async (c) => {
        expect(await c.readMessage()).toEqual({ type: "welcome" });
        c.sendMessage({ command: "subscribe", identifier });
        expect(await c.readMessage()).toEqual({
          identifier: '{"channel":"ClientTest::EchoChannel"}',
          type: "confirm_subscription",
        });
        c.sendMessage({
          command: "message",
          identifier,
          data: JSON.stringify({ action: "ding", message: "hello" }),
        });
        expect(await c.readMessage()).toEqual({
          identifier: '{"channel":"ClientTest::EchoChannel"}',
          message: { dong: "hello" },
        });
      });

      await concurrently(clients, (c) => c.close());
    });
  }, 20_000);

  it("disappearing client", async () => {
    await withPumaServer(async (port) => {
      let c = await websocketClient(port);
      expect(await c.readMessage()).toEqual({ type: "welcome" });
      c.sendMessage({ command: "subscribe", identifier });
      expect(await c.readMessage()).toEqual({
        identifier: '{"channel":"ClientTest::EchoChannel"}',
        type: "confirm_subscription",
      });
      c.sendMessage({
        command: "message",
        identifier,
        data: JSON.stringify({ action: "delay", message: "hello" }),
      });
      await c.close();

      c = await websocketClient(port);
      expect(await c.readMessage()).toEqual({ type: "welcome" });
      c.sendMessage({ command: "subscribe", identifier });
      expect(await c.readMessage()).toEqual({
        identifier: '{"channel":"ClientTest::EchoChannel"}',
        type: "confirm_subscription",
      });
      c.sendMessage({
        command: "message",
        identifier,
        data: JSON.stringify({ action: "ding", message: "hello" }),
      });
      expect(await c.readMessage()).toEqual({
        identifier: '{"channel":"ClientTest::EchoChannel"}',
        message: { dong: "hello" },
      });
      await c.close();
    });
  }, 20_000);

  it("unsubscribe client", async () => {
    await withPumaServer(async (port) => {
      const app = ActionCable.server() as ServerBase;
      const identifier = JSON.stringify({ channel: "ClientTest::EchoChannel" });

      const c = await websocketClient(port);
      expect(await c.readMessage()).toEqual({ type: "welcome" });
      c.sendMessage({ command: "subscribe", identifier });
      expect(await c.readMessage()).toEqual({
        identifier: '{"channel":"ClientTest::EchoChannel"}',
        type: "confirm_subscription",
      });
      expect(app.connections.length).toBe(1);

      const subscriptions = (
        app.connections[0] as unknown as {
          subscriptions: { subscriptions: Record<string, EchoChannel> };
        }
      ).subscriptions.subscriptions;
      expect(Object.keys(subscriptions).length, "Missing EchoChannel subscription").not.toBe(0);
      const channel = Object.values(subscriptions)[0];
      await assertCalled(channel, "unsubscribed" as never, null, {}, async () => {
        await c.close();
        await sleep(0.1);
      });

      expect(app.connections.length).toBe(0);
    });
  });

  it("remote disconnect client", async () => {
    await withPumaServer(async (port) => {
      const app = ActionCable.server() as ServerBase;

      const c = await websocketClient(port, "/?id=1");
      expect(await c.readMessage()).toEqual({ type: "welcome" });

      await sleep(0.1);
      await app.remoteConnections.where({ id: "1" }).disconnect();

      expect(await c.readMessage()).toEqual({
        type: "disconnect",
        reason: "remote",
        reconnect: true,
      });

      await c.waitForClose();
      expect(c.isClosed()).toBeTruthy();
    });
  });

  it("remote disconnect client with reconnect", async () => {
    await withPumaServer(async (port) => {
      const app = ActionCable.server() as ServerBase;

      const c = await websocketClient(port, "/?id=2");
      expect(await c.readMessage()).toEqual({ type: "welcome" });

      await sleep(0.1);
      await app.remoteConnections.where({ id: "2" }).disconnect({ reconnect: false });

      expect(await c.readMessage()).toEqual({
        type: "disconnect",
        reason: "remote",
        reconnect: false,
      });

      await c.waitForClose();
      expect(c.isClosed()).toBeTruthy();
    });
  });

  it("server restart", async () => {
    await withPumaServer(async (port) => {
      const c = await websocketClient(port);
      expect(await c.readMessage()).toEqual({ type: "welcome" });
      c.sendMessage({
        command: "subscribe",
        identifier: JSON.stringify({ channel: "ClientTest::EchoChannel" }),
      });
      expect(await c.readMessage()).toEqual({
        identifier: '{"channel":"ClientTest::EchoChannel"}',
        type: "confirm_subscription",
      });

      await (ActionCable.server() as ServerBase).restart();
      await c.waitForClose();
      expect(c.isClosed()).toBeTruthy();
    });
  });
});
