import type { StreamEventLoop } from "../connection/stream-event-loop.js";
import { Inline, type InlineServer } from "./inline.js";
import { SubscriberMap } from "./subscriber-map.js";

export interface AsyncServer extends InlineServer {
  eventLoop: StreamEventLoop;
}

type Subscriber = (message: unknown) => unknown;

export class Async extends Inline {
  /** @internal */
  protected override newSubscriberMap(): SubscriberMap {
    return new AsyncSubscriberMap((this.server as AsyncServer).eventLoop);
  }
}

/** @internal */
export class AsyncSubscriberMap extends SubscriberMap {
  /** @internal */
  protected eventLoop: StreamEventLoop;

  constructor(eventLoop: StreamEventLoop) {
    super();
    this.eventLoop = eventLoop;
  }

  override addSubscriber(
    channel: string,
    subscriber: Subscriber,
    onSuccess: (() => unknown) | null,
  ): void {
    this.eventLoop.post(null, () => super.addSubscriber(channel, subscriber, onSuccess));
  }

  override invokeCallback(callback: Subscriber, message: unknown): void {
    this.eventLoop.post(null, () => super.invokeCallback(callback, message));
  }
}
