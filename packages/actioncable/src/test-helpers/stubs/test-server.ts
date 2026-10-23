import { Logger, TaggedLogging, include, type Included } from "@blazetrails/activesupport";
import { Monitor, StringIO, globalIoExecutor, rbObjIvarSet } from "@blazetrails/ruby-compat";
import { StreamEventLoop } from "../../connection/stream-event-loop.js";
import { Broadcasting } from "../../server/broadcasting.js";
import { Configuration } from "../../server/configuration.js";
import { Connections } from "../../server/connections.js";
import { Worker } from "../../server/worker.js";
import { SuccessAdapter } from "./test-adapter.js";

export type AdapterClass = new (server: TestServer) => unknown;

class FakeConfiguration extends Configuration {
  declare subscriptionAdapter: AdapterClass;
  declare logTags: unknown[];
  declare filterParameters: unknown[];
  declare cable: Record<string, unknown>;

  // @ts-expect-error TS2377 test_server.rb:11-15 initialize omits super
  constructor({ subscriptionAdapter }: { subscriptionAdapter: AdapterClass }) {
    const self = Object.create(new.target.prototype) as FakeConfiguration;
    self.logTags = [];
    self.filterParameters = [];
    self.subscriptionAdapter = subscriptionAdapter;
    return self;
  }

  override async pubsubAdapter(): Promise<unknown> {
    return this.subscriptionAdapter;
  }
}

export class TestServer {
  static FakeConfiguration = FakeConfiguration;

  declare broadcast: Included<typeof Broadcasting>["broadcast"];
  declare broadcasterFor: Included<typeof Broadcasting>["broadcasterFor"];
  declare connections: unknown[];

  readonly logger: ReturnType<typeof TaggedLogging.new<Logger>>;
  readonly config: FakeConfiguration;
  readonly mutex: Monitor;
  private _pubsub?: unknown;
  private _eventLoop?: StreamEventLoop;
  private _workerPool?: Worker;

  constructor({ subscriptionAdapter = SuccessAdapter as AdapterClass } = {}) {
    this.logger = TaggedLogging.new(new Logger(new StringIO()));
    this.config = new FakeConfiguration({ subscriptionAdapter });
    this.mutex = new Monitor();
  }

  get pubsub(): unknown {
    return (this._pubsub ??= new this.config.subscriptionAdapter(this));
  }

  get eventLoop(): StreamEventLoop {
    return (this._eventLoop ??= (() => {
      const loop = new StreamEventLoop();
      rbObjIvarSet(loop, "@executor", globalIoExecutor());
      return loop;
    })());
  }

  get workerPool(): Worker {
    return (this._workerPool ??= new Worker({ maxSize: 5 }));
  }
}

include(TestServer, Connections);
include(TestServer, Broadcasting);
