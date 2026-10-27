import { cattrAccessor, include, runLoadHooks, type Included } from "@blazetrails/activesupport";
import { Monitor } from "@blazetrails/ruby-compat";
import { INTERNAL } from "../action-cable.js";
import { Server } from "../namespaces.js";
import { StreamEventLoop } from "../connection/stream-event-loop.js";
import { Broadcasting } from "./broadcasting.js";
import { Configuration } from "./configuration.js";
import { Connections } from "./connections.js";
import { RemoteConnections } from "../remote-connections.js";
import { Worker } from "./worker.js";

interface Connection {
  process(): unknown;
  close(options: { reason: string }): unknown;
}

interface ConnectionClass {
  new (server: Base, env: Record<string, unknown>): Connection;
  identifiers: unknown;
}

interface PubSub {
  broadcast(channel: string, payload: unknown): unknown;
  shutdown(): unknown;
}

type Logger = { debug(progname: unknown, block: () => unknown): unknown };

export class Base {
  declare broadcast: Included<typeof Broadcasting>["broadcast"];
  declare broadcasterFor: Included<typeof Broadcasting>["broadcasterFor"];
  declare connections: Connection[];
  declare addConnection: (connection: Connection) => Connection[];
  declare removeConnection: (connection: Connection) => Connection | null;
  declare setupHeartbeatTimer: () => unknown;
  declare openConnectionsStatistics: unknown[];
  declare static config: Configuration;

  static get logger(): unknown {
    return this.config.logger;
  }

  readonly config: Configuration;
  readonly mutex: Monitor;
  private _remoteConnections: RemoteConnections | null;
  private _eventLoop: StreamEventLoop | null;
  private _workerPool: Worker | null;
  private _pubsub: PubSub | null;

  get logger(): Logger {
    return this.config.logger as Logger;
  }

  constructor({ config = new.target.config }: { config?: Configuration } = {}) {
    this.config = config;
    this.mutex = new Monitor();
    this._remoteConnections = this._eventLoop = this._workerPool = this._pubsub = null;
  }

  call(env: Record<string, unknown>): unknown {
    if (env["PATH_INFO"] === this.config.healthCheckPath)
      return this.config.healthCheckApplication.call(null, env);
    this.setupHeartbeatTimer();
    return new (this.config.connectionClass() as ConnectionClass)(this, env).process();
  }

  disconnect(identifiers: Record<string, unknown>): unknown {
    return this.remoteConnections.where(identifiers).disconnect();
  }

  async restart(): Promise<void> {
    for (const connection of this.connections) {
      connection.close({ reason: INTERNAL.disconnectReasons.serverRestart });
    }

    await this.mutex.synchronize(async () => {
      if (this._workerPool) await this._workerPool.halt();
      this._workerPool = null;

      if (this._pubsub) await this._pubsub.shutdown();
      this._pubsub = null;
    });
  }

  get remoteConnections(): RemoteConnections {
    return (this._remoteConnections ??= new RemoteConnections(this));
  }

  get eventLoop(): StreamEventLoop {
    return (this._eventLoop ??= new StreamEventLoop());
  }

  get workerPool(): Worker {
    return (this._workerPool ??= new Worker({ maxSize: this.config.workerPoolSize }));
  }

  get pubsub(): PubSub {
    return (this._pubsub ??= new (this.config.pubsubAdapter() as new (server: Base) => PubSub)(
      this,
    ));
  }

  get connectionIdentifiers(): unknown {
    return (this.config.connectionClass() as ConnectionClass).identifiers;
  }
}
include(Base, Broadcasting);
include(Base, Connections);
cattrAccessor.call(Base, "config", { instanceAccessor: false, default: new Configuration() });

Server.Base = Base;

runLoadHooks("action_cable", Base.config);
