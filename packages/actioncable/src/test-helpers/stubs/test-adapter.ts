import { Hash, aryDelete } from "@blazetrails/ruby-compat";
import { Base } from "../../subscription-adapter/base.js";

type Callback = (message: unknown) => unknown;

export class SuccessAdapter extends Base {
  static subscribeCalled: {
    channel: string;
    callback: Callback;
    successCallback: (() => unknown) | null;
  };
  static unsubscribeCalled: { channel: string; callback: Callback };

  private _subscribers?: Hash<string, Callback[]>;

  override async broadcast(_channel: string, _payload: unknown): Promise<unknown> {
    return null;
  }

  override async subscribe(
    channel: string,
    callback: Callback,
    successCallback: (() => unknown) | null = null,
  ): Promise<unknown> {
    this.subscriberMap.get(channel)!.push(callback);
    return (SuccessAdapter.subscribeCalled = { channel, callback, successCallback });
  }

  override async unsubscribe(channel: string, callback: Callback): Promise<unknown> {
    aryDelete(this.subscriberMap.get(channel)!, callback);
    if (this.subscriberMap.get(channel)!.length === 0) this.subscriberMap.delete(channel);
    return (SuccessAdapter.unsubscribeCalled = { channel, callback });
  }

  get subscriberMap(): Hash<string, Callback[]> {
    return (this._subscribers ??= new Hash<string, Callback[]>((h, k) => {
      const v: Callback[] = [];
      h.set(k, v);
      return v;
    }));
  }
}
