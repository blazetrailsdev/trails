import {
  assert,
  camelize,
  classAttribute,
  Concern,
  constantize,
  ConstantLookup,
  extend,
  include,
  Logger,
  runLoadHooks,
  StringIO,
  stringifyKeys,
  TaggedLogging,
  withIndifferentAccess,
} from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import {
  defineModule,
  filterMap,
  rbClassInheritedP,
  rbObjRespondTo,
  rbObjSingletonClass,
  RuntimeError,
  rbCallSuper,
  StandardError,
  toS,
} from "@blazetrails/ruby-compat";
import { ActionCable, Channel } from "../namespaces.js";
import { Subscriptions } from "../connection/subscriptions.js";
import { TestHelper } from "../test-helper.js";
import { Base } from "./base.js";

type Data = Record<string, unknown>;

export class NonInferrableChannelError extends StandardError {
  constructor(name: unknown) {
    super(
      `Unable to determine the channel to test from ${toS(name)}. ` +
        "You'll need to specify it using `tests YourChannel` in your " +
        "test case definition.",
    );
  }
}

interface StubbedChannel {
  _streams?: string[] | null;
  isSubscriptionConfirmationSent(): boolean | null;
  isSubscriptionRejected(): boolean | null;
}

export const ChannelStub = defineModule({
  isConfirmed(this: StubbedChannel): boolean | null {
    return this.isSubscriptionConfirmationSent();
  },

  isRejected(this: StubbedChannel): boolean | null {
    return this.isSubscriptionRejected();
  },

  streamFrom(
    this: StubbedChannel & { streams: string[] },
    broadcasting: string,
    ..._rest: unknown[]
  ): string[] {
    this.streams.push(broadcasting);
    return this.streams;
  },

  stopAllStreams(this: StubbedChannel): string[] {
    return (this._streams = []);
  },

  get streams(): string[] {
    return ((this as unknown as StubbedChannel)._streams ??= []);
  },

  startPeriodicTimers(): void {},
  stopPeriodicTimers(): void {},
});

export class ConnectionStub {
  readonly server: ReturnType<typeof ActionCable.server>;
  readonly transmissions: Data[];
  readonly identifiers: string[];
  readonly subscriptions: Subscriptions;
  readonly logger: unknown;
  /** @internal */
  private _connectionIdentifier?: string;

  get pubsub(): unknown {
    return (this.server as { pubsub: unknown }).pubsub;
  }

  get config(): unknown {
    return (this.server as { config: unknown }).config;
  }

  constructor(identifiers: Data = {}) {
    this.server = ActionCable.server();
    this.transmissions = [];

    for (const [identifier, val] of Object.entries(identifiers)) {
      Object.defineProperty(this, identifier, { value: val, configurable: true });
    }

    this.subscriptions = new Subscriptions(this as never);
    this.identifiers = Object.keys(identifiers);
    this.logger = TaggedLogging.new(new Logger(new StringIO()));
  }

  transmit(cableMessage: Data): Data[] {
    this.transmissions.push(withIndifferentAccess(cableMessage) as unknown as Data);
    return this.transmissions;
  }

  get connectionIdentifier(): string {
    return (this._connectionIdentifier ??= this.connectionGid(
      filterMap(this.identifiers, (id) =>
        id != null ? (this as unknown as Record<string, unknown>)[id] : null,
      ),
    ));
  }

  /** @internal */
  private connectionGid(ids: unknown[]): string {
    return ids
      .map((o) => {
        if (rbObjRespondTo(o, "toGidParam")) {
          return (o as { toGidParam(): string }).toGidParam();
        } else {
          return toS(o);
        }
      })
      .sort()
      .join(":");
  }
}

type ChannelClass = typeof Base;
type StubbedSubscription = Base & {
  streams: string[];
  isConfirmed(): boolean | null;
  isRejected(): boolean | null;
};

interface BehaviorClass {
  name: string;
  _channelClass: ChannelClass | null | undefined;
  determineConstantFromTestName(testName: string, block: (constant: unknown) => unknown): unknown;
  tests(channel: unknown): ChannelClass;
  channelClass(): ChannelClass;
  determineDefaultChannel(name: string): ChannelClass;
}

export const ClassMethods: Omit<
  BehaviorClass,
  "name" | "_channelClass" | "determineConstantFromTestName"
> &
  ThisType<BehaviorClass> = {
  tests(channel: unknown): ChannelClass {
    if (typeof channel === "string") {
      return (this._channelClass = constantize(camelize(toS(channel))) as ChannelClass);
    } else if (typeof channel === "function") {
      return (this._channelClass = channel as ChannelClass);
    } else {
      throw new NonInferrableChannelError(channel);
    }
  },

  channelClass(): ChannelClass {
    const channel = this._channelClass;
    if (channel != null) {
      return channel;
    } else {
      return this.tests(this.determineDefaultChannel(this.name));
    }
  },

  determineDefaultChannel(name: string): ChannelClass {
    const channel = this.determineConstantFromTestName(
      name,
      (constant) => typeof constant === "function" && rbClassInheritedP(constant, Base) === true,
    );
    if (channel == null) throw new NonInferrableChannelError(name);
    return channel as ChannelClass;
  },
};

export interface Behavior extends Omit<
  TestHelper,
  "beforeSetup" | "afterTeardown" | "assertBroadcasts" | "assertBroadcastOn"
> {
  readonly connection: ConnectionStub | null;
  readonly subscription: StubbedSubscription | null;
  /** @internal */
  _connection: ConnectionStub | null | undefined;
  /** @internal */
  _subscription: StubbedSubscription | null | undefined;
}

type Host = Behavior;

function stubConnection(this: Host, identifiers: Data = {}): ConnectionStub {
  return (this._connection = new ConnectionStub(identifiers));
}

/** @missingRailsArgs include — PERMANENT */
async function subscribe(this: Host, params: Data = {}): Promise<StubbedSubscription> {
  this._connection ??= stubConnection.call(this);
  this._subscription = new ((this.constructor as unknown as BehaviorClass).channelClass())(
    this.connection as never,
    CHANNEL_IDENTIFIER,
    withIndifferentAccess(params) as never,
  ) as StubbedSubscription;
  include(rbObjSingletonClass(this.subscription!), ChannelStub);
  await this.subscription!.subscribeToChannel();
  return this.subscription!;
}

async function unsubscribe(this: Host): Promise<unknown> {
  checkSubscribedBang.call(this);
  return await this.subscription!.unsubscribeFromChannel();
}

async function perform(this: Host, action: string, data: Data = {}): Promise<unknown> {
  checkSubscribedBang.call(this);
  return await this.subscription!.performAction({ ...stringifyKeys(data), action: toS(action) });
}

function transmissions(this: Host): unknown[] {
  return filterMap(this.connection!.transmissions, (data) =>
    (data as unknown as { get(k: string): unknown }).get("message"),
  );
}

async function assertBroadcasts(
  this: Host,
  streamOrObject: unknown,
  args: number,
  block: (() => unknown) | null = null,
): Promise<void> {
  await rbCallSuper(
    this,
    assertBroadcasts,
    broadcastingFor.call(this, streamOrObject),
    args,
    block,
  );
}

async function assertBroadcastOn(
  this: Host,
  streamOrObject: unknown,
  args: unknown,
  block: (() => unknown) | null = null,
): Promise<void> {
  await rbCallSuper(
    this,
    assertBroadcastOn,
    broadcastingFor.call(this, streamOrObject),
    args,
    block,
  );
}

function assertNoStreams(this: Host): void {
  assert(
    this.subscription!.streams.length === 0,
    `No streams started was expected, but ${this.subscription!.streams.length} found`,
  );
}

function assertHasStream(this: Host, stream: string): void {
  assert(this.subscription!.streams.includes(stream), `Stream ${stream} has not been started`);
}

function assertHasStreamFor(this: Host, object: unknown): void {
  assertHasStream.call(this, broadcastingFor.call(this, object));
}

function assertHasNoStream(this: Host, stream: string): void {
  assert(!this.subscription!.streams.includes(stream), `Stream ${stream} has been started`);
}

function assertHasNoStreamFor(this: Host, object: unknown): void {
  assertHasNoStream.call(this, broadcastingFor.call(this, object));
}

/** @internal */
function checkSubscribedBang(this: Host): void {
  if (this.subscription == null || this.subscription.isRejected())
    throw new RuntimeError("Must be subscribed!");
}

/** @internal */
function broadcastingFor(this: Host, streamOrObject: unknown): string {
  if (typeof streamOrObject === "string") return streamOrObject;

  return (this.constructor as unknown as BehaviorClass)
    .channelClass()
    .broadcastingFor(streamOrObject);
}

export const CHANNEL_IDENTIFIER = "test_stub";

export const Behavior = {
  ClassMethods,
  CHANNEL_IDENTIFIER,
  get connection(): ConnectionStub | null {
    return (this as unknown as Behavior)._connection ?? null;
  },
  get subscription(): StubbedSubscription | null {
    return (this as unknown as Behavior)._subscription ?? null;
  },
} as Record<string, unknown> & {
  ClassMethods: typeof ClassMethods;
};
extend(Behavior, Concern);
include(Behavior, ConstantLookup);
include(Behavior, TestHelper);

Object.assign(Behavior, {
  stubConnection,
  subscribe,
  unsubscribe,
  perform,
  transmissions,
  assertBroadcasts,
  assertBroadcastOn,
  assertNoStreams,
  assertHasStream,
  assertHasStreamFor,
  assertHasNoStream,
  assertHasNoStreamFor,
  checkSubscribedBang,
  broadcastingFor,
});

(
  Behavior as unknown as { included(base: null, block: (this: typeof TestCase) => void): void }
).included(null, function (this: typeof TestCase) {
  classAttribute.call(this, "_channelClass");
  runLoadHooks("action_cable_channel_test_case", this);
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TestCase extends Behavior {
  stubConnection: typeof stubConnection;
  subscribe: typeof subscribe;
  unsubscribe: typeof unsubscribe;
  perform: typeof perform;
  transmissions: typeof transmissions;
  assertBroadcasts: typeof assertBroadcasts;
  assertBroadcastOn: typeof assertBroadcastOn;
  assertNoStreams: typeof assertNoStreams;
  assertHasStream: typeof assertHasStream;
  assertHasStreamFor: typeof assertHasStreamFor;
  assertHasNoStream: typeof assertHasNoStream;
  assertHasNoStreamFor: typeof assertHasNoStreamFor;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase extends ActiveSupportTestCase {}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace TestCase {
  /** @internal */
  let _channelClass: ChannelClass | null | undefined;
  const tests: (typeof ClassMethods)["tests"];
  const channelClass: (typeof ClassMethods)["channelClass"];
  const determineDefaultChannel: (typeof ClassMethods)["determineDefaultChannel"];
}

include(TestCase, Behavior);

Channel.TestCase = TestCase;
Channel.NonInferrableChannelError = NonInferrableChannelError;
Channel.ChannelStub = ChannelStub;
Channel.ConnectionStub = ConnectionStub;
