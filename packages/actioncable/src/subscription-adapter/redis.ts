import { cattrAccessor } from "@blazetrails/activesupport";
import { prepend } from "@blazetrails/ruby-compat/include";
import { Mutex, Thread, except } from "@blazetrails/ruby-compat";
import { Redis as IORedis, type RedisOptions } from "ioredis";
import type { StreamEventLoop } from "../connection/stream-event-loop.js";
import { SubscriptionAdapter } from "../namespaces.js";
import { Base } from "./base.js";
import { ChannelPrefix } from "./channel-prefix.js";
import type { InlineServer } from "./inline.js";
import { SubscriberMap } from "./subscriber-map.js";

type Callback = (message: unknown) => unknown;

interface RedisConnection {
  publish(channel: string, payload: string): Promise<unknown>;
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  on(event: string, listener: (...args: never[]) => unknown): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  disconnect(): void;
  options: { retryStrategy?: (times: number) => number | void | null };
}

export interface RedisServer extends InlineServer {
  eventLoop: StreamEventLoop;
}

export class Redis extends Base {
  declare static redisConnector: (config: Record<string, unknown>) => RedisConnection;

  private _listener: Listener | null;
  private _redisConnectionForBroadcasts: RedisConnection | null;
  private _configOptions?: Record<string, unknown>;

  constructor(server: RedisServer) {
    super(server);
    this._listener = null;
    this._redisConnectionForBroadcasts = null;
  }

  override async broadcast(channel: string, payload: unknown): Promise<unknown> {
    return (await this.redisConnectionForBroadcasts()).publish(channel, payload as string);
  }

  override async subscribe(
    channel: string,
    callback: Callback,
    successCallback: (() => unknown) | null = null,
  ): Promise<unknown> {
    return (await this.listener()).addSubscriber(channel, callback, successCallback);
  }

  override async unsubscribe(channel: string, callback: Callback): Promise<unknown> {
    return (await this.listener()).removeSubscriber(channel, callback);
  }

  override async shutdown(): Promise<unknown> {
    if (this._listener) return await this._listener.shutdown();
  }

  redisConnectionForSubscriptions(): RedisConnection {
    return this.redisConnection();
  }

  /** @internal */
  private async listener(): Promise<Listener> {
    return (
      this._listener ||
      (await (this.server as RedisServer).mutex.synchronize(
        () =>
          (this._listener ??= new Listener(
            this,
            this.configOptions(),
            (this.server as RedisServer).eventLoop,
          )),
      ))
    );
  }

  /** @internal */
  private async redisConnectionForBroadcasts(): Promise<RedisConnection> {
    return (
      this._redisConnectionForBroadcasts ||
      (await (this.server as RedisServer).mutex.synchronize(
        () => (this._redisConnectionForBroadcasts ??= this.redisConnection()),
      ))
    );
  }

  /**
   * @internal
   * @missingRailsArgs redis_connector — PERMANENT
   */
  private redisConnection(): RedisConnection {
    return (this.constructor as typeof Redis).redisConnector(this.configOptions());
  }

  /** @internal */
  private configOptions(): Record<string, unknown> {
    return (this._configOptions ??= { ...this.server.config.cable, id: this.identifier() });
  }
}
prepend(Redis, ChannelPrefix);
cattrAccessor.call(Redis, "redisConnector", {
  default: () => (config: Record<string, unknown>) =>
    new IORedis(except(config, "adapter", "channelPrefix") as RedisOptions),
});

export class Listener extends SubscriberMap {
  private _adapter: Redis;
  private _eventLoop: StreamEventLoop;
  private _subscribeCallbacks: Map<string, ((() => unknown) | null)[]>;
  private _subscriptionLock: Mutex;
  private _reconnectAttempt: number;
  private _reconnectAttempts: number[];
  private _subscribedClient: SubscribedClient | null;
  private _whenConnected: (() => unknown)[];
  private _thread: Thread<Promise<unknown>> | null;

  constructor(adapter: Redis, configOptions: Record<string, unknown>, eventLoop: StreamEventLoop) {
    super();

    this._adapter = adapter;
    this._eventLoop = eventLoop;

    this._subscribeCallbacks = new Map();
    this._subscriptionLock = new Mutex();

    this._reconnectAttempt = 0;
    const reconnectAttempts = Object.hasOwn(configOptions, "reconnectAttempts")
      ? (configOptions.reconnectAttempts as number | number[])
      : 1;
    this._reconnectAttempts =
      typeof reconnectAttempts === "number"
        ? new Array<number>(reconnectAttempts).fill(0)
        : reconnectAttempts;

    this._subscribedClient = null;

    this._whenConnected = [];

    this._thread = null;
  }

  listen(conn: RedisConnection): Promise<void> {
    conn.options.retryStrategy = () => null;
    const originalClient = this.extractSubscribedClient(conn);

    return new Promise((resolve, reject) => {
      conn.on("subscribe", (chan: string, count: number) => {
        this._subscriptionLock.synchronize(() => {
          if (count === 1) {
            this._reconnectAttempt = 0;
            this._subscribedClient = originalClient;

            while (this._whenConnected.length !== 0) {
              this._whenConnected.shift()!();
            }
          }

          const callbacks = this._subscribeCallbacks.get(chan);
          if (callbacks) {
            const nextCallback = callbacks.shift();
            if (nextCallback) this._eventLoop.post(null, nextCallback);
            if (callbacks.length === 0) this._subscribeCallbacks.delete(chan);
          }
        });
      });

      conn.on("message", (chan: string, message: string) => {
        this.broadcast(chan, message);
      });

      conn.on("unsubscribe", (_chan: string, count: number) => {
        if (count === 0) {
          this._subscriptionLock.synchronize(() => {
            this._subscribedClient = null;
          });
          conn.disconnect();
          resolve();
        }
      });

      conn.on("end", () => reject(new ConnectionError("Connection lost")));
      originalClient.subscribe("_action_cable_internal");
    });
  }

  async shutdown(): Promise<void> {
    const thread = await this._subscriptionLock.synchronize(() => {
      if (this._thread == null) return null;

      this.whenConnected(() => {
        this._subscribedClient!.unsubscribe();
        this._subscribedClient = null;
      });
      return this._thread;
    });
    if (thread == null) return;

    while (thread.isAlive()) await Thread.pass();
  }

  override addChannel(channel: string, onSuccess: (() => unknown) | null): void {
    this._subscriptionLock.synchronize(() => {
      this.ensureListenerRunning();
      const callbacks = this._subscribeCallbacks.get(channel) ?? [];
      this._subscribeCallbacks.set(channel, callbacks);
      callbacks.push(onSuccess);
      this.whenConnected(() => this._subscribedClient!.subscribe(channel));
    });
  }

  override removeChannel(channel: string): void {
    this._subscriptionLock.synchronize(() => {
      this.whenConnected(() => this._subscribedClient!.unsubscribe(channel));
    });
  }

  override invokeCallback(callback: Callback, message: unknown): void {
    this._eventLoop.post(null, () => super.invokeCallback(callback, message));
  }

  /** @internal */
  private ensureListenerRunning(): void {
    this._thread ??= new Thread(async () => {
      Thread.current().abortOnException = true;

      for (;;) {
        try {
          const conn = this._adapter.redisConnectionForSubscriptions();
          return await this.listen(conn);
        } catch (error) {
          if (!(error instanceof ConnectionError)) throw error;
          this.reset();
          if (!(await this.isRetryConnecting())) return;
          this.whenConnected(() => this.resubscribe());
        }
      }
    });
  }

  /** @internal */
  private whenConnected(block: () => unknown): void {
    if (this._subscribedClient) {
      block();
    } else {
      this._whenConnected.push(block);
    }
  }

  /** @internal */
  private async isRetryConnecting(): Promise<boolean> {
    this._reconnectAttempt += 1;

    if (this._reconnectAttempt > this._reconnectAttempts.length) return false;

    const sleepT = this._reconnectAttempts[this._reconnectAttempt - 1];

    if (sleepT > 0) await new Promise((resolve) => setTimeout(resolve, sleepT * 1000));

    return true;
  }

  /** @internal */
  private resubscribe(): void {
    const channels = this.sync.synchronize(() => Object.keys(this.subscribers)) as string[];
    if (channels.length !== 0) this._subscribedClient!.subscribe(...channels);
  }

  /** @internal */
  private reset(): void {
    this._subscriptionLock.synchronize(() => {
      this._subscribedClient = null;
      this._subscribeCallbacks.clear();
      this._whenConnected.length = 0;
    });
  }

  /** @internal */
  private extractSubscribedClient(conn: RedisConnection): SubscribedClient {
    return new SubscribedClient(conn);
  }
}

/** @internal */
export class ConnectionError extends Error {}

/** @internal */
export class SubscribedClient {
  private _rawClient: RedisConnection;

  constructor(rawClient: RedisConnection) {
    this._rawClient = rawClient;
  }

  subscribe(...channel: string[]): null {
    return this.sendCommand("subscribe", ...channel);
  }

  unsubscribe(...channel: string[]): null {
    return this.sendCommand("unsubscribe", ...channel);
  }

  /**
   * @internal
   * @missingRailsCall write — PERMANENT
   */
  private sendCommand(...command: ["subscribe" | "unsubscribe", ...string[]]): null {
    const [name, ...channel] = command;
    void this._rawClient[name](...channel).then(
      (count) => {
        for (const chan of channel.length === 0 ? [""] : channel) {
          this._rawClient.emit(name, chan, count);
        }
      },
      () => {},
    );
    return null;
  }
}

SubscriptionAdapter.Redis = Redis;
