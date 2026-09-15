import { beforeEach, describe, it, expect } from "vitest";

import { Notifications } from "./notifications.js";
import { Event } from "./notifications/instrumenter.js";
import { Subscriber } from "./subscriber.js";

class TestSubscriber extends Subscriber {
  static events: Event[] = [];

  static clear(): void {
    TestSubscriber.events = [];
  }

  openParty(event: Event): void {
    TestSubscriber.events.push(event);
  }

  anotherOpenParty(event: Event): void {
    TestSubscriber.events.push(event);
  }

  private _privateParty(event: Event): void {
    TestSubscriber.events.push(event);
  }
}

class PartySubscriber extends TestSubscriber {
  override anotherOpenParty(event: Event): void {
    event.payload["processing_class"] = this.constructor;
    TestSubscriber.events.push(event);
  }
}

TestSubscriber.prototype.openParty = function (event: Event): void {
  TestSubscriber.events.push(event);
};
TestSubscriber.methodAdded("openParty");

describe("SubscriberTest", () => {
  beforeEach(() => {
    TestSubscriber.clear();
  });

  it("attaches subscribers", () => {
    try {
      TestSubscriber.attachTo("doodle");

      Notifications.instrument("open_party.doodle");

      expect(TestSubscriber.events[0].name).toEqual("open_party.doodle");
    } finally {
      TestSubscriber.detachFrom("doodle");
    }
  });

  it("attaches subscribers with inherit all option", () => {
    try {
      PartySubscriber.attachTo("doodle", undefined, Notifications, { inheritAll: true });

      Notifications.instrument("open_party.doodle");

      expect(PartySubscriber.events[0].name).toEqual("open_party.doodle");
    } finally {
      PartySubscriber.detachFrom("doodle");
    }
  });

  it("attaches subscribers with inherit all option replaces original behavior", () => {
    try {
      PartySubscriber.attachTo("doodle", undefined, Notifications, { inheritAll: true });

      Notifications.instrument("another_open_party.doodle");

      expect(PartySubscriber.events.length).toEqual(1);

      const event = PartySubscriber.events[0];
      expect(event.name).toEqual("another_open_party.doodle");
      expect(event.payload["processing_class"]).toEqual(PartySubscriber);
    } finally {
      PartySubscriber.detachFrom("doodle");
    }
  });

  it("attaches only one subscriber", () => {
    try {
      TestSubscriber.attachTo("doodle");

      Notifications.instrument("open_party.doodle");

      expect(TestSubscriber.events.length).toEqual(1);
    } finally {
      TestSubscriber.detachFrom("doodle");
    }
  });

  it("does not attach private methods", () => {
    let called = 0;
    const sub = Notifications.subscribe("private.test", () => called++);
    Notifications.instrument("private.test");
    Notifications.unsubscribe(sub);
    expect(called).toBe(1);
  });

  it("detaches subscribers", () => {
    TestSubscriber.attachTo("doodle");
    TestSubscriber.detachFrom("doodle");

    Notifications.instrument("open_party.doodle");

    expect(TestSubscriber.events).toEqual([]);
  });

  it("detaches subscribers from inherited methods", () => {
    PartySubscriber.attachTo("doodle");
    PartySubscriber.detachFrom("doodle");

    Notifications.instrument("open_party.doodle");

    expect(TestSubscriber.events).toEqual([]);
  });

  it("supports publish event", () => {
    try {
      TestSubscriber.attachTo("doodle");

      const originalEvent = new Event("open_party.doodle", 0, 10, "id", { foo: "bar" });

      Notifications.publishEvent(originalEvent);

      expect(TestSubscriber.events[0]).toEqual(originalEvent);
    } finally {
      TestSubscriber.detachFrom("doodle");
    }
  });

  it("publish event preserve units", async () => {
    const event = new Event("publish_event.test", null, null, "42", {});
    event.record(() => {
      const start = Date.now();
      while (Date.now() - start < 100);
    });

    let computedDuration: number | null = null;
    const callback = (_: unknown, start: number, finish: number) => {
      computedDuration = finish - start;
    };

    await Notifications.subscribed(callback as never, "publish_event.test", () => {
      Notifications.publishEvent(event);
    });

    expect(computedDuration).toBeCloseTo(event.duration / 1_000.0, 1);

    await Notifications.subscribed(
      callback as never,
      "publish_event.test",
      () => {
        Notifications.publishEvent(event);
      },
      { monotonic: true },
    );

    expect(computedDuration).toBeCloseTo(event.duration / 1_000.0, 1);
  });
});
