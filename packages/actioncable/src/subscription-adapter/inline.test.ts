import { describe } from "vitest";
import "../index.js";
import {
  commonSubscriptionAdapterTest,
  type CommonSubscriptionAdapterTestHost,
} from "../test-helpers/subscription-adapter/common.js";

describe("InlineAdapterTest", () => {
  const host = {
    async setup() {
      await host.txAdapter.shutdown();
      host.txAdapter = host.rxAdapter as never;
    },

    cableConfig() {
      return { adapter: "inline" };
    },
  } as unknown as CommonSubscriptionAdapterTestHost;
  commonSubscriptionAdapterTest(host);
});
