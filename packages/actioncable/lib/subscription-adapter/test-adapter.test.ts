import { describe, expect, it } from "vitest";
import "../index.js";
import {
  commonSubscriptionAdapterTest,
  type CommonSubscriptionAdapterTestHost,
} from "../test-helpers/subscription-adapter/common.js";
import type { Test } from "./test.js";

describe("ActionCable::SubscriptionAdapter::TestTest", () => {
  const host = {
    async setup() {
      await host.txAdapter.shutdown();
      host.txAdapter = host.rxAdapter as never;
    },

    cableConfig() {
      return { adapter: "test" };
    },
  } as unknown as CommonSubscriptionAdapterTestHost & { txAdapter: Test };
  commonSubscriptionAdapterTest(host);

  it("#broadcast stores messages for streams", async () => {
    await host.txAdapter.broadcast("channel", "payload");
    await host.txAdapter.broadcast("channel2", "payload2");

    expect(host.txAdapter.broadcasts("channel")).toEqual(["payload"]);
    expect(host.txAdapter.broadcasts("channel2")).toEqual(["payload2"]);
  });

  it("#clear_messages deletes recorded broadcasts for the channel", async () => {
    await host.txAdapter.broadcast("channel", "payload");
    await host.txAdapter.broadcast("channel2", "payload2");

    host.txAdapter.clearMessages("channel");

    expect(host.txAdapter.broadcasts("channel")).toEqual([]);
    expect(host.txAdapter.broadcasts("channel2")).toEqual(["payload2"]);
  });

  it("#clear deletes all recorded broadcasts", async () => {
    await host.txAdapter.broadcast("channel", "payload");
    await host.txAdapter.broadcast("channel2", "payload2");

    host.txAdapter.clear();

    expect(host.txAdapter.broadcasts("channel")).toEqual([]);
    expect(host.txAdapter.broadcasts("channel2")).toEqual([]);
  });
});
