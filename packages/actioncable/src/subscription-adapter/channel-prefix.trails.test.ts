import { prepend } from "@blazetrails/ruby-compat/include";
import { describe, expect, it } from "vitest";
import { Base } from "./base.js";
import { ChannelPrefix } from "./channel-prefix.js";

class RecordingAdapter extends Base {
  calls: unknown[][] = [];

  override async broadcast(channel: string, payload: unknown): Promise<unknown> {
    this.calls.push(["broadcast", channel, payload]);
    return null;
  }

  override async subscribe(
    channel: string,
    callback: (message: unknown) => unknown,
    successCallback: (() => unknown) | null = null,
  ): Promise<unknown> {
    this.calls.push(["subscribe", channel, callback, successCallback]);
    return null;
  }

  override async unsubscribe(
    channel: string,
    callback: (message: unknown) => unknown,
  ): Promise<unknown> {
    this.calls.push(["unsubscribe", channel, callback]);
    return null;
  }
}
prepend(RecordingAdapter, ChannelPrefix);

function adapter(cable: Record<string, unknown>): RecordingAdapter {
  return new RecordingAdapter({ logger: null, config: { cable } });
}

describe("ChannelPrefix", () => {
  it("prefixes the channel passed to super", async () => {
    const a = adapter({ channelPrefix: "app" });
    const cb = () => {};
    await a.broadcast("room", "hi");
    await a.subscribe("room", cb);
    await a.unsubscribe("room", cb);
    expect(a.calls).toEqual([
      ["broadcast", "app:room", "hi"],
      ["subscribe", "app:room", cb, null],
      ["unsubscribe", "app:room", cb],
    ]);
  });

  it("passes the bare channel with no prefix", async () => {
    const a = adapter({});
    await a.broadcast("room", "hi");
    expect(a.calls).toEqual([["broadcast", "room", "hi"]]);
  });
});
