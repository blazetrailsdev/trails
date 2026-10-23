import { Base, type AdapterServer } from "./base.js";
import { SubscriberMap } from "./subscriber-map.js";
import type { Monitor } from "@blazetrails/ruby-compat";

type Callback = (message: unknown) => unknown;

export interface InlineServer extends AdapterServer {
  mutex: Monitor;
}

export class Inline extends Base {
  private _subscriberMap: SubscriberMap | null;

  constructor(server: InlineServer) {
    super(server);
    this._subscriberMap = null;
  }

  override async broadcast(channel: string, payload: unknown): Promise<unknown> {
    return (await this.subscriberMap).broadcast(channel, payload);
  }

  override async subscribe(
    channel: string,
    callback: Callback,
    successCallback: (() => unknown) | null = null,
  ): Promise<unknown> {
    return (await this.subscriberMap).addSubscriber(channel, callback, successCallback);
  }

  override async unsubscribe(channel: string, callback: Callback): Promise<unknown> {
    return (await this.subscriberMap).removeSubscriber(channel, callback);
  }

  override async shutdown(): Promise<unknown> {
    return null;
  }

  /** @internal */
  protected get subscriberMap(): SubscriberMap | Promise<SubscriberMap> {
    return (
      this._subscriberMap ||
      (this.server as InlineServer).mutex.synchronize(
        () => (this._subscriberMap ??= this.newSubscriberMap()),
      )
    );
  }

  /** @internal */
  protected newSubscriberMap(): SubscriberMap {
    return new SubscriberMap();
  }
}
