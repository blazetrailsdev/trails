import { rbModConstSet } from "@blazetrails/ruby-compat";
import { SubscriptionAdapter } from "../namespaces.js";
import { Async } from "./async.js";

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

rbModConstSet(SubscriptionAdapter, "Test", Test);
