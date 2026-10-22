import { ActiveSupportJSON, Concern, extend } from "@blazetrails/activesupport";
import {
  defineModule,
  hashDelete,
  isPlainHash,
  rbModConstSet,
  rbModName,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { Channel } from "../namespaces.js";

type Handler = (message: unknown) => unknown;

interface Coder {
  decode(message: unknown): unknown;
}

interface PubSub {
  subscribe(channel: string, callback: Handler, successCallback?: () => unknown): unknown;
  unsubscribe(channel: string, callback: Handler): unknown;
}

interface StreamsConnection {
  server: { eventLoop: { post(task: null, block: () => unknown): unknown } };
  workerPool: { asyncInvoke(receiver: unknown, method: string, ...args: unknown[]): unknown };
  pubsub: PubSub | Promise<PubSub>;
}

interface StreamsChannel {
  connection: StreamsConnection;
  logger: { info(message: string): unknown };
  _streams?: Record<string, Handler>;
  streams: Record<string, Handler>;
  pubsub: PubSub | Promise<PubSub>;
  deferSubscriptionConfirmationBang(): unknown;
  ensureConfirmationSent(): unknown;
  transmit(data: unknown, options: { via: string }): unknown;
  reject(): unknown;
  broadcastingFor(model: unknown): string;
  streamFrom: typeof streamFrom;
  streamFor: typeof streamFor;
  stopStreamFrom: typeof stopStreamFrom;
  workerPoolStreamHandler: typeof workerPoolStreamHandler;
  streamHandler: typeof streamHandler;
  defaultStreamHandler: typeof defaultStreamHandler;
  streamDecoder: typeof streamDecoder;
  streamTransmitter: typeof streamTransmitter;
  identityHandler: typeof identityHandler;
}

type StreamOptions = { coder?: Coder | null };

/** @missingRailsArgs subscribe — PERMANENT */
function streamFrom(
  this: StreamsChannel,
  broadcasting: unknown,
  callback: Handler | StreamOptions | null = null,
  { coder = null }: StreamOptions = {},
  block?: Handler,
): void {
  if (isPlainHash(callback)) {
    ({ coder = null } = callback);
    callback = null;
  }
  broadcasting = String(broadcasting);

  this.deferSubscriptionConfirmationBang();

  const handler = this.workerPoolStreamHandler(broadcasting as string, callback || block, {
    coder,
  });
  this.streams[broadcasting as string] = handler;

  this.connection.server.eventLoop.post(null, async () => {
    return (await this.pubsub).subscribe(broadcasting as string, handler, () => {
      this.ensureConfirmationSent();
      this.logger.info(
        `${rbModName(rbObjClass(this)) as string} is streaming from ${broadcasting as string}`,
      );
    });
  });
}

function streamFor(
  this: StreamsChannel,
  model: unknown,
  callback: Handler | StreamOptions | null = null,
  { coder = null }: StreamOptions = {},
  block?: Handler,
): void {
  if (isPlainHash(callback)) {
    ({ coder = null } = callback);
    callback = null;
  }
  this.streamFrom(this.broadcastingFor(model), callback || block, { coder });
}

async function stopStreamFrom(this: StreamsChannel, broadcasting: string): Promise<void> {
  const callback = hashDelete(this.streams, broadcasting);
  if (callback != null) {
    await (await this.pubsub).unsubscribe(broadcasting, callback);
    this.logger.info(
      `${rbModName(rbObjClass(this)) as string} stopped streaming from ${broadcasting}`,
    );
  }
}

function stopStreamFor(this: StreamsChannel, model: unknown): Promise<void> {
  return this.stopStreamFrom(this.broadcastingFor(model));
}

async function stopAllStreams(this: StreamsChannel): Promise<void> {
  const streams = this.streams;
  for (const [broadcasting, callback] of Object.entries(streams)) {
    await (await this.pubsub).unsubscribe(broadcasting, callback);
    this.logger.info(
      `${rbModName(rbObjClass(this)) as string} stopped streaming from ${broadcasting}`,
    );
  }
  for (const broadcasting of Object.keys(streams)) delete streams[broadcasting];
}

function streamOrRejectFor(this: StreamsChannel, model: unknown): unknown {
  if (model != null && model !== false) {
    return this.streamFor(model);
  } else {
    return this.reject();
  }
}

/** @internal */
function workerPoolStreamHandler(
  this: StreamsChannel,
  broadcasting: string,
  userHandler: Handler | null | undefined,
  { coder = null }: StreamOptions = {},
): Handler {
  const handler = this.streamHandler(broadcasting, userHandler, { coder });

  return (message) => {
    return this.connection.workerPool.asyncInvoke(handler, "call", message, {
      connection: this.connection,
    });
  };
}

/** @internal */
function streamHandler(
  this: StreamsChannel,
  broadcasting: string,
  userHandler: Handler | null | undefined,
  { coder = null }: StreamOptions = {},
): Handler {
  if (userHandler != null) {
    return this.streamDecoder(userHandler, { coder });
  } else {
    return this.defaultStreamHandler(broadcasting, { coder });
  }
}

/** @internal */
function defaultStreamHandler(
  this: StreamsChannel,
  broadcasting: string,
  { coder }: { coder: Coder | null },
): Handler {
  coder ||= ActiveSupportJSON;
  return this.streamTransmitter(this.streamDecoder(undefined, { coder }), { broadcasting });
}

/** @internal */
function streamDecoder(
  this: StreamsChannel,
  handler: Handler = this.identityHandler(),
  { coder }: { coder: Coder | null },
): Handler {
  if (coder != null) {
    return (message) => handler.call(null, coder.decode(message));
  } else {
    return handler;
  }
}

/** @internal */
function streamTransmitter(
  this: StreamsChannel,
  handler: Handler = this.identityHandler(),
  { broadcasting }: { broadcasting: string },
): Handler {
  const via = `streamed from ${broadcasting}`;

  return (message) => {
    return this.transmit(handler.call(null, message), { via });
  };
}

/** @internal */
function identityHandler(): Handler {
  return (message) => message;
}

export const Streams = defineModule(
  { streamFrom, streamFor, stopStreamFrom, stopStreamFor, stopAllStreams, streamOrRejectFor },
  {},
  {
    get pubsub(): PubSub | Promise<PubSub> {
      return (this as unknown as StreamsChannel).connection.pubsub;
    },
    get streams(): Record<string, Handler> {
      return ((this as unknown as StreamsChannel)._streams ??= {});
    },
    workerPoolStreamHandler,
    streamHandler,
    defaultStreamHandler,
    streamDecoder,
    streamTransmitter,
    identityHandler,
  },
);
extend(Streams, Concern);

(
  Streams as unknown as {
    included(base: null, block: (this: { onUnsubscribe(...m: unknown[]): void }) => void): void;
  }
).included(null, function () {
  this.onUnsubscribe(":stopAllStreams");
});

rbModConstSet(Channel, "Streams", Streams);
