import { TopLevel } from "@blazetrails/activesupport";
import { prepend } from "@blazetrails/ruby-compat/include";
import {
  OpenSSL,
  Queue,
  RuntimeError,
  Thread,
  kernelCatch,
  kernelThrow,
} from "@blazetrails/ruby-compat";
import type { StreamEventLoop } from "../connection/stream-event-loop.js";
import { SubscriptionAdapter } from "../namespaces.js";
import { Base } from "./base.js";
import { ChannelPrefix } from "./channel-prefix.js";
import type { InlineServer } from "./inline.js";
import { SubscriberMap } from "./subscriber-map.js";

type Callback = (message: unknown) => unknown;

interface PGConn {
  exec(sql: string): Promise<unknown>;
  escapeIdentifier(str: string): string;
  escapeString(str: string): string;
  waitForNotify(
    timeout: number,
    block: (chan: string, pid: number, message: string | undefined) => unknown,
  ): Promise<unknown>;
}

interface ArConn {
  rawConnection(): Promise<unknown>;
  disconnectBang(): Promise<unknown>;
}

interface ConnectionPool {
  newConnection(): ArConn | Promise<ArConn>;
  withConnection<T>(block: (arConn: ArConn) => Promise<T>): Promise<T>;
}

export interface PostgreSQLServer extends InlineServer {
  eventLoop: StreamEventLoop;
}

export class PostgreSQL extends Base {
  private _listener: Listener | null;

  constructor(server: PostgreSQLServer) {
    super(server);
    this._listener = null;
  }

  override async broadcast(channel: string, payload: unknown): Promise<unknown> {
    return await this.withBroadcastConnection(async (pgConn) => {
      return await pgConn.exec(
        `NOTIFY ${pgConn.escapeIdentifier(this.channelIdentifier(channel))}, '${pgConn.escapeString(payload as string)}'`,
      );
    });
  }

  override async subscribe(
    channel: string,
    callback: Callback,
    successCallback: (() => unknown) | null = null,
  ): Promise<unknown> {
    return (await this.listener).addSubscriber(
      this.channelIdentifier(channel),
      callback,
      successCallback,
    );
  }

  override async unsubscribe(channel: string, callback: Callback): Promise<unknown> {
    return (await this.listener).removeSubscriber(this.channelIdentifier(channel), callback);
  }

  override async shutdown(): Promise<unknown> {
    return await (await this.listener).shutdown();
  }

  async withSubscriptionsConnection<T>(block: (pgConn: PGConn) => Promise<T>): Promise<T> {
    let arConn: ArConn | undefined;
    try {
      arConn = await (
        TopLevel.ActiveRecord!.Base as unknown as { connectionPool: ConnectionPool }
      ).connectionPool.newConnection();
      const pgConn = (await arConn.rawConnection()) as PGConn;

      this.verifyBang(pgConn);
      await pgConn.exec(
        `SET application_name = ${pgConn.escapeIdentifier(this.identifier() as string)}`,
      );
      return await block(pgConn);
    } finally {
      await arConn?.disconnectBang();
    }
  }

  async withBroadcastConnection<T>(block: (pgConn: PGConn) => Promise<T>): Promise<T> {
    return await (
      TopLevel.ActiveRecord!.Base as unknown as { connectionPool: ConnectionPool }
    ).connectionPool.withConnection(async (arConn) => {
      const pgConn = (await arConn.rawConnection()) as PGConn;
      this.verifyBang(pgConn);
      return await block(pgConn);
    });
  }

  /** @internal */
  private channelIdentifier(channel: string): string {
    return [...channel].length > 63 ? OpenSSL.Digest.SHA1.hexdigest(channel) : channel;
  }

  /** @internal */
  private get listener(): Listener | Promise<Listener> {
    return (
      this._listener ||
      (this.server as PostgreSQLServer).mutex.synchronize(
        () => (this._listener ??= new Listener(this, (this.server as PostgreSQLServer).eventLoop)),
      )
    );
  }

  /** @internal */
  private verifyBang(pgConn: unknown): void {
    if (!(pgConn instanceof TopLevel.PG!.Connection)) {
      throw new RuntimeError(
        "The Active Record database must be PostgreSQL in order to use the PostgreSQL Action Cable storage adapter",
      );
    }
  }
}
prepend(PostgreSQL, ChannelPrefix);

type Command = [
  action: "listen" | "unlisten" | "shutdown",
  channel?: string,
  callback?: () => unknown,
];

export class Listener extends SubscriberMap {
  private _adapter: PostgreSQL;
  private _eventLoop: StreamEventLoop;
  private _queue: Queue<Command>;
  private _thread: Thread<Promise<unknown>>;

  constructor(adapter: PostgreSQL, eventLoop: StreamEventLoop) {
    super();

    this._adapter = adapter;
    this._eventLoop = eventLoop;
    this._queue = new Queue();

    this._thread = new Thread(() => {
      Thread.current().abortOnException = true;
      return this.listen();
    });
  }

  async listen(): Promise<unknown> {
    return await this._adapter.withSubscriptionsConnection(async (pgConn) => {
      return await kernelCatch("shutdown", async () => {
        for (;;) {
          while (!this._queue.isEmpty()) {
            const [action, channel, callback] = this._queue.pop(true);

            switch (action) {
              case "listen":
                await pgConn.exec(`LISTEN ${pgConn.escapeIdentifier(channel!)}`);
                if (callback != null) this._eventLoop.post(null, callback);
                break;
              case "unlisten":
                await pgConn.exec(`UNLISTEN ${pgConn.escapeIdentifier(channel!)}`);
                break;
              case "shutdown":
                kernelThrow("shutdown");
            }
          }

          await pgConn.waitForNotify(1, (chan, _pid, message) => {
            this.broadcast(chan, message);
          });
        }
      });
    });
  }

  async shutdown(): Promise<void> {
    await this._queue.push(["shutdown"]);
    while (this._thread.isAlive()) await Thread.pass();
  }

  override addChannel(channel: string, onSuccess: (() => unknown) | null): void {
    void this._queue.push(["listen", channel, onSuccess ?? undefined]);
  }

  override removeChannel(channel: string): void {
    void this._queue.push(["unlisten", channel]);
  }

  override invokeCallback(callback: Callback, message: unknown): void {
    this._eventLoop.post(null, () => super.invokeCallback(callback, message));
  }
}

SubscriptionAdapter.PostgreSQL = PostgreSQL;
