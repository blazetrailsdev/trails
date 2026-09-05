import { describe, it, expect } from "vitest";

import { Subscriber } from "./subscriber.js";
import { Event } from "./notifications/instrumenter.js";

class PredicateSubscriber extends Subscriber {
  calls: string[] = [];

  isExistFragment(): void {
    this.calls.push("isExistFragment");
  }

  hasCachedEntry(): void {
    this.calls.push("hasCachedEntry");
  }

  isHasCachedEntry(): void {
    this.calls.push("isHasCachedEntry");
  }
}

function event(name: string): Event {
  return new Event(name, 0, 0, "x", {});
}

describe("Subscriber predicate event dispatch (trails-only)", () => {
  it("dispatches a bare predicate event onto the is-prefixed spelling", () => {
    const subscriber = new PredicateSubscriber();
    subscriber.call(event("exist_fragment?.action_controller"));
    expect(subscriber.calls).toEqual(["isExistFragment"]);
  });

  it("prefers the bare camel spelling for an already-predicate prefix, as the conventions table does", () => {
    const subscriber = new PredicateSubscriber();
    subscriber.call(event("has_cached_entry?.action_controller"));
    expect(subscriber.calls).toEqual(["hasCachedEntry"]);
  });
});
