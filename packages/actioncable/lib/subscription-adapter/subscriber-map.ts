import { Mutex } from "@blazetrails/ruby-compat";

type Subscriber = (message: unknown) => unknown;

export class SubscriberMap {
  /** @internal */
  protected subscribers: Record<string, Subscriber[]>;
  /** @internal */
  protected sync: Mutex;

  constructor() {
    this.subscribers = {};
    this.sync = new Mutex();
  }

  addSubscriber(
    channel: string,
    subscriber: Subscriber,
    onSuccess: (() => unknown) | null,
  ): unknown {
    const newChannel = !Object.hasOwn(this.subscribers, channel);

    (this.subscribers[channel] ??= []).push(subscriber);

    if (newChannel) {
      return this.addChannel(channel, onSuccess);
    } else if (onSuccess != null) {
      return onSuccess();
    }
    return null;
  }

  removeSubscriber(channel: string, subscriber: Subscriber): unknown {
    const list = (this.subscribers[channel] ??= []);
    for (let i = list.length - 1; i >= 0; i--) if (list[i] === subscriber) list.splice(i, 1);

    if (this.subscribers[channel].length === 0) {
      delete this.subscribers[channel];
      return this.removeChannel(channel);
    }
    return null;
  }

  broadcast(channel: string, message: unknown): void {
    if (!Object.hasOwn(this.subscribers, channel)) return;
    const list = [...this.subscribers[channel]];

    for (const subscriber of list) {
      this.invokeCallback(subscriber, message);
    }
  }

  addChannel(_channel: string, onSuccess: (() => unknown) | null): unknown {
    if (onSuccess != null) return onSuccess();
    return null;
  }

  removeChannel(_channel: string): unknown {
    return null;
  }

  invokeCallback(callback: Subscriber, message: unknown): void {
    callback(message);
  }
}
