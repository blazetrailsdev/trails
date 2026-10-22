import { describe, expect, it } from "vitest";
import { SubscriberMap } from "./subscriber-map.js";

describe("SubscriberMapTest", () => {
  let subscriptionMap: SubscriberMap;

  function setupSubscriptionMap(): void {
    subscriptionMap = new SubscriberMap();
  }

  it("broadcast should not change subscribers", () => {
    setupSubscriptionMap();
    const origin = { ...(subscriptionMap as unknown as { subscribers: object }).subscribers };

    subscriptionMap.broadcast("not_exist_channel", "");

    expect((subscriptionMap as unknown as { subscribers: object }).subscribers).toEqual(origin);
  });
});
