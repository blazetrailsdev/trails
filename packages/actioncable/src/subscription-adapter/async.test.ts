import { describe } from "vitest";
import "../index.js";
import {
  commonSubscriptionAdapterTest,
  type CommonSubscriptionAdapterTestHost,
} from "../test-helpers/subscription-adapter/common.js";

describe("AsyncAdapterTest", () => {
  const host = {
    async setup() {
      await host.txAdapter.shutdown();
      host.txAdapter = host.rxAdapter as never;
    },

    cableConfig() {
      return { adapter: "async" };
    },
  } as unknown as CommonSubscriptionAdapterTestHost;
  commonSubscriptionAdapterTest(host);
});
