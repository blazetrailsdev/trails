import "../constants.test.generated.js";
import { Async } from "./async.js";
import { SubscriptionAdapter } from "../namespaces.js";

export class Test extends Async {
  private _channelsData: Record<string, unknown[]> | null = null;

  override async broadcast(channel: string, payload: unknown): Promise<unknown> {
    this.broadcasts(channel).push(payload);
    return super.broadcast(channel, payload);
  }

  broadcasts(channel: string): unknown[] {
    return (this.channelsData[channel] ??= []);
  }

  clearMessages(channel: string): unknown[] {
    return (this.channelsData[channel] = []);
  }

  clear(): null {
    return (this._channelsData = null);
  }

  /** @internal */
  private get channelsData(): Record<string, unknown[]> {
    return (this._channelsData ??= {});
  }
}

SubscriptionAdapter.loadPath["action_cable/subscription_adapter/test"] = () => import("./test.js");
