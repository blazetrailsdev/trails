import { Concern, extend, isPresent } from "@blazetrails/activesupport";
import {
  defineModule,
  excBacktrace,
  fetch,
  rbFArray,
  rbModConstSet,
  rbObjAsString,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { ActionCable, Connection } from "../namespaces.js";

type Callback = (message: unknown) => unknown;

interface InternalChannelConnection {
  connectionIdentifier: string;
  _internalSubscriptions?: [string, Callback][];
  server: { eventLoop: { post(task: null, block: () => unknown): unknown } };
  pubsub: {
    subscribe(channel: string, callback: Callback): unknown;
    unsubscribe(channel: string, callback: Callback): unknown;
  };
  logger: { info(message: string): unknown; error(message: string): unknown };
  internalChannel: string;
  decode(message: unknown): Record<string, unknown>;
  close(options?: { reason?: string; reconnect?: unknown }): unknown;
  processInternalMessage(message: Record<string, unknown>): void;
}

/** @internal */
function subscribeToInternalChannel(this: InternalChannelConnection): void {
  if (isPresent(this.connectionIdentifier)) {
    const callback: Callback = (message) => this.processInternalMessage(this.decode(message));
    this._internalSubscriptions ??= [];
    this._internalSubscriptions.push([this.internalChannel, callback]);

    this.server.eventLoop.post(null, () => this.pubsub.subscribe(this.internalChannel, callback));
    this.logger.info(`Registered connection (${this.connectionIdentifier})`);
  }
}

/** @internal */
function unsubscribeFromInternalChannel(this: InternalChannelConnection): void {
  if (isPresent(this._internalSubscriptions)) {
    for (const [channel, callback] of this._internalSubscriptions!) {
      this.server.eventLoop.post(null, () => this.pubsub.unsubscribe(channel, callback));
    }
  }
}

/** @internal */
function processInternalMessage(
  this: InternalChannelConnection,
  message: Record<string, unknown>,
): void {
  try {
    switch (message["type"]) {
      case "disconnect":
        this.logger.info(`Removing connection (${this.connectionIdentifier})`);
        this.close({
          reason: ActionCable.INTERNAL.disconnectReasons.remote,
          reconnect: fetch(message, "reconnect", true),
        });
    }
  } catch (e) {
    const error = e as Error;
    this.logger.error(
      `There was an exception - ${rbObjAsString(rbObjClass(error))}(${rbObjAsString(error.message)})`,
    );
    this.logger.error(rbFArray(excBacktrace(error)).join("\n"));

    this.close();
  }
}

export const InternalChannel = defineModule(
  {},
  {},
  {
    get internalChannel(): string {
      const self = this as unknown as InternalChannelConnection;
      return `action_cable/${self.connectionIdentifier}`;
    },
    subscribeToInternalChannel,
    unsubscribeFromInternalChannel,
    processInternalMessage,
  },
);
extend(InternalChannel, Concern);

rbModConstSet(Connection, "InternalChannel", InternalChannel);
