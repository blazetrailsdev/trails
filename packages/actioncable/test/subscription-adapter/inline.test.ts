import { describe } from "vitest";
import "../../lib/index.js";
import {
  commonSubscriptionAdapterTest,
  type CommonSubscriptionAdapterTestHost,
} from "../support/subscription-adapter/common.js";

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
