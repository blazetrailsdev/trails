import { Mutex, rbModConstSet } from "@blazetrails/ruby-compat";
import { SubscriptionAdapter } from "../namespaces.js";

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

  addSubscriber(channel: string, subscriber: Subscriber, onSuccess: (() => unknown) | null): void {
    const newChannel = !Object.hasOwn(this.subscribers, channel);

    (this.subscribers[channel] ??= []).push(subscriber);

    if (newChannel) {
      this.addChannel(channel, onSuccess);
    } else if (onSuccess != null) {
      onSuccess();
    }
  }

  removeSubscriber(channel: string, subscriber: Subscriber): void {
    const list = (this.subscribers[channel] ??= []);
    for (let i = list.length - 1; i >= 0; i--) if (list[i] === subscriber) list.splice(i, 1);

    if (this.subscribers[channel].length === 0) {
      delete this.subscribers[channel];
      this.removeChannel(channel);
    }
  }

  broadcast(channel: string, message: unknown): void {
    if (!Object.hasOwn(this.subscribers, channel)) return;
    const list = [...this.subscribers[channel]];

    for (const subscriber of list) {
      this.invokeCallback(subscriber, message);
    }
  }

  addChannel(_channel: string, onSuccess: (() => unknown) | null): void {
    if (onSuccess != null) onSuccess();
  }

  removeChannel(_channel: string): void {}

  invokeCallback(callback: Subscriber, message: unknown): void {
    callback(message);
  }
}

rbModConstSet(SubscriptionAdapter, "SubscriberMap", SubscriberMap);
