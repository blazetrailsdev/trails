import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Notifications } from "./notifications.js";
import { Fanout, type Evented, type EventedListener } from "./notifications/fanout.js";
import { travelTo, travelBack } from "./testing/time-helpers.js";
import { Event, Instrumenter, LegacyHandle, Wrapper } from "./notifications/instrumenter.js";

function randomId(): string {
  return Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
}

beforeEach(() => {
  Notifications.unsubscribeAll();
});

describe("SubscribeEventObjectsTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it.skip("subscribe events", () => {
    // BLOCKED: notifications-timed-subscriber-arity-and-event-cpu-allocations
    const evs: Event[] = [];
    notifier.subscribe(null, ((event: Event) => {
      evs.push(event);
    }) as unknown as EventedListener);

    Notifications.instrument("foo");
    const event = evs[0];
    expect(event, "should have an event").toBeTruthy();
    expect(event.allocations).toBeGreaterThan(0);
    expect(event.cpuTime).toBeGreaterThan(0);
    expect(event.idleTime).toBeGreaterThanOrEqual(0);
    expect(event.duration).toBeGreaterThan(0);
  });

  it("subscribe to events where payload is changed during instrumentation", () => {
    notifier.subscribe(null, ((event: Event) => {
      expect(event.payload.my_key).toBe("success!");
    }) as unknown as EventedListener);

    Notifications.instrument("foo", {}, (payload) => {
      payload.my_key = "success!";
    });
  });

  it("subscribe to events can handle nested hashes in the paylaod", () => {
    notifier.subscribe(null, ((event: Event) => {
      const someKey = event.payload.some_key as Record<string, unknown>;
      expect(someKey.key_one).toBe("success!");
      expect(someKey.key_two).toBe("great_success!");
    }) as unknown as EventedListener);

    Notifications.instrument("foo", { some_key: { key_one: "success!" } }, (payload) => {
      (payload.some_key as Record<string, unknown>).key_two = "great_success!";
    });
  });

  it.skip("subscribe via top level api", () => {
    // BLOCKED: notifications-timed-subscriber-arity-and-event-cpu-allocations
    const oldNotifier = Notifications.notifier;
    Notifications.notifier = new Fanout();
    try {
      let event: Event | undefined;
      Notifications.subscribe("foo", (e) => {
        event = e;
      });

      Notifications.instrument("foo", {}, () => {
        for (let i = 0; i < 100; i++) ({});
      });

      expect(event).toBeTruthy();
      expect(event!.allocations).toBeGreaterThanOrEqual(100);
    } finally {
      Notifications.notifier = oldNotifier;
    }
  });

  it("subscribe with a single arity lambda listener", () => {
    let eventName: string | undefined;
    const listener = (event: Event) => {
      eventName = event.name;
    };

    notifier.subscribe(null, listener as unknown as EventedListener);
    Notifications.instrument("event_name");

    expect(eventName).toBe("event_name");
  });

  it("subscribe with a single arity callable listener", () => {
    let eventName: string | undefined;
    const listener = class {
      call(event: Event) {
        eventName = event.name;
      }
    };

    notifier.subscribe(null, new listener() as unknown as EventedListener);
    Notifications.instrument("event_name");

    expect(eventName).toBe("event_name");
  });
});

describe("TimedAndMonotonicTimedSubscriberTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it.skip("subscribe", () => {
    // BLOCKED: notifications-timed-subscriber-arity-and-event-cpu-allocations
    const eventName = "foo";
    let classOfStarted: string | undefined;
    let classOfFinished: string | undefined;

    Notifications.subscribe(eventName, ((_name: string, started: unknown, finished: unknown) => {
      classOfStarted = (started as object).constructor.name;
      classOfFinished = (finished as object).constructor.name;
    }) as never);

    Notifications.instrument(eventName);

    expect([classOfStarted, classOfFinished]).toEqual(["Instant", "Instant"]);
  });

  it("monotonic subscribe", () => {
    const eventName = "foo";
    let classOfStarted: string | undefined;
    let classOfFinished: string | undefined;

    Notifications.monotonicSubscribe(eventName, ((
      _name: string,
      started: unknown,
      finished: unknown,
    ) => {
      classOfStarted = typeof started;
      classOfFinished = typeof finished;
    }) as never);

    Notifications.instrument(eventName);

    expect([classOfStarted, classOfFinished]).toEqual(["number", "number"]);
  });
});

describe("BuildHandleTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it.skip("interleaved event", () => {
    // BLOCKED: notifications-timed-subscriber-arity-and-event-cpu-allocations
    const eventName = "foo";
    const actualTimes: unknown[][] = [];

    Notifications.subscribe(eventName, ((_name: string, started: unknown, finished: unknown) => {
      actualTimes.push([started, finished]);
    }) as never);

    const times = [1, 2, 3, 4].map((s) => new Date(2020, 0, 1, 0, 0, s));

    const instrumenter = Notifications.instrumenter;
    travelTo(times[0]);
    const handle1 = instrumenter.buildHandle(eventName, {});
    const handle2 = instrumenter.buildHandle(eventName, {});

    handle1.start();
    travelTo(times[1]);
    handle2.start();
    travelTo(times[2]);
    handle1.finish();
    travelTo(times[3]);
    handle2.finish();

    expect(actualTimes).toEqual([
      [times[0], times[2]],
      [times[1], times[3]],
    ]);
    travelBack();
  });

  it("subscribed interleaved with event", async () => {
    const instrumenter = Notifications.instrumenter;

    const name = "foo";
    const events1: Event[] = [];
    const events2: Event[] = [];

    const callback1 = (event: Event) => events1.push(event);
    const callback2 = (event: Event) => events2.push(event);

    await Notifications.subscribed(callback1, name, async () => {
      const handle = instrumenter.buildHandle(name, {});
      handle.start();

      await Notifications.subscribed(callback2, name, () => {
        handle.finish();
      });
    });

    expect(events1.length).toBe(1);
    expect(events2).toEqual([]);

    expect(events1[0].name).toBe(name);
    expect(events1[0].time).toBeTruthy();
    expect(events1[0].end).toBeTruthy();
  });
});

describe("SubscribedTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it("subscribed", async () => {
    const name = "foo";
    const name2 = name.repeat(2);
    const expected = [name, name];

    const evs: string[] = [];
    const callback = (event: Event) => evs.push(event.name);
    await Notifications.subscribed(callback, name, () => {
      Notifications.instrument(name);
      Notifications.instrument(name2);
      Notifications.instrument(name);
    });
    expect(evs).toEqual(expected);

    Notifications.instrument(name);
    expect(evs).toEqual(expected);
  });

  it("subscribed all messages", async () => {
    const name = "foo";
    const name2 = name.repeat(2);
    const expected = [name, name2, name];

    const evs: string[] = [];
    const callback = (event: Event) => evs.push(event.name);
    await Notifications.subscribed(callback, () => {
      Notifications.instrument(name);
      Notifications.instrument(name2);
      Notifications.instrument(name);
    });
    expect(evs).toEqual(expected);

    Notifications.instrument(name);
    expect(evs).toEqual(expected);
  });

  it("subscribing to instrumentation while inside it", () => {
    const oldNotifier = Notifications.notifier;
    Notifications.notifier = new Fanout();

    try {
      Notifications.subscribe("foo", new TestSubscriber() as never);

      expect(() =>
        Notifications.instrument("foo", {}, () => {
          Notifications.subscribe("foo", () => {});
        }),
      ).not.toThrow();
    } finally {
      Notifications.notifier = oldNotifier;
    }
  });

  it("timed subscribed", async () => {
    const eventName = "foo";
    let classOfStarted: string | undefined;
    let classOfFinished: string | undefined;
    const callback = (_name: string, started: unknown, finished: unknown) => {
      classOfStarted = (started as object).constructor.name;
      classOfFinished = (finished as object).constructor.name;
    };

    await Notifications.subscribed(callback as never, eventName, () => {
      Notifications.instrument(eventName);
    });

    Notifications.instrument(eventName);

    expect([classOfStarted, classOfFinished]).toEqual(["Instant", "Instant"]);
  });

  it("monotonic timed subscribed", async () => {
    const eventName = "foo";
    let classOfStarted: string | undefined;
    let classOfFinished: string | undefined;
    const callback = (_name: string, started: unknown, finished: unknown) => {
      classOfStarted = typeof started;
      classOfFinished = typeof finished;
    };

    await Notifications.subscribed(
      callback as never,
      eventName,
      () => {
        Notifications.instrument(eventName);
      },
      { monotonic: true },
    );

    Notifications.instrument(eventName);

    expect([classOfStarted, classOfFinished]).toEqual(["number", "number"]);
  });
});

let oldNotifier: Fanout;
let notifier: Fanout;
let events: unknown[][];
let namedEvents: unknown[][];
let subscription: Evented;

function setupTestCase() {
  oldNotifier = Notifications.notifier;
  notifier = new Fanout();
  Notifications.notifier = notifier;
  events = [];
  namedEvents = [];
  subscription = notifier.subscribe(null, ((...args: unknown[]) =>
    events.push(args)) as unknown as EventedListener);
  notifier.subscribe("named.subscription", ((...args: unknown[]) =>
    namedEvents.push(args)) as unknown as EventedListener);
}

function teardownTestCase() {
  Notifications.notifier = oldNotifier;
}

class TestSubscriber {
  starts: unknown[][] = [];
  finishes: unknown[][] = [];
  publishes: unknown[][] = [];

  start(...args: unknown[]) {
    this.starts.push(args);
  }
  finish(...args: unknown[]) {
    this.finishes.push(args);
  }
  publish(...args: unknown[]) {
    this.publishes.push(args);
  }
}

describe("InspectTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it("inspect output is small", () => {
    const expected = "#<ActiveSupport::Notifications::Fanout (2 patterns)>";
    expect(notifier.inspect()).toBe(expected);
  });
});

describe("UnsubscribeTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it("unsubscribing removes a subscription", () => {
    notifier.publish(":foo");
    notifier.wait();
    expect(events).toEqual([[":foo"]]);
    notifier.unsubscribe(subscription);
    notifier.publish(":foo");
    notifier.wait();
    expect(events).toEqual([[":foo"]]);
  });

  it("unsubscribing by name removes a subscription", () => {
    notifier.publish("named.subscription", ":foo");
    notifier.wait();
    expect(namedEvents).toEqual([["named.subscription", ":foo"]]);
    notifier.unsubscribe("named.subscription");
    notifier.publish("named.subscription", ":foo");
    notifier.wait();
    expect(namedEvents).toEqual([["named.subscription", ":foo"]]);
  });

  it("unsubscribing by name leaves the other subscriptions", () => {
    notifier.publish("named.subscription", ":foo");
    notifier.wait();
    expect(events).toEqual([["named.subscription", ":foo"]]);
    notifier.unsubscribe("named.subscription");
    notifier.publish("named.subscription", ":foo");
    notifier.wait();
    expect(events).toEqual([
      ["named.subscription", ":foo"],
      ["named.subscription", ":foo"],
    ]);
  });

  it("unsubscribing by name leaves regexp matched subscriptions", () => {
    const matchedEvents: unknown[][] = [];
    notifier.subscribe(/subscription/, ((...args: unknown[]) =>
      matchedEvents.push(args)) as unknown as EventedListener);
    notifier.publish("named.subscription", ":before");
    notifier.wait();
    for (const collector of [events, namedEvents, matchedEvents]) {
      expect(collector).toContainEqual(["named.subscription", ":before"]);
    }
    notifier.unsubscribe("named.subscription");
    notifier.publish("named.subscription", ":after");
    notifier.publish("other.subscription", ":after");
    notifier.wait();
    expect(events).toContainEqual(["named.subscription", ":after"]);
    expect(events).toContainEqual(["other.subscription", ":after"]);
    expect(matchedEvents).toContainEqual(["other.subscription", ":after"]);
    expect(matchedEvents).not.toContainEqual(["named.subscription", ":after"]);
    expect(namedEvents).not.toContainEqual(["named.subscription", ":after"]);
  });
});

describe("SyncPubSubTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it("events are published to a listener", () => {
    notifier.publish(":foo");
    notifier.wait();
    expect(events).toEqual([[":foo"]]);
  });

  it("publishing multiple times works", () => {
    notifier.publish(":foo");
    notifier.publish(":foo");
    notifier.wait();
    expect(events).toEqual([[":foo"], [":foo"]]);
  });

  it("publishing after a new subscribe works", () => {
    notifier.publish(":foo");
    notifier.publish(":foo");

    notifier.subscribe("not_existent", ((event: unknown) =>
      events.push(event as unknown[])) as unknown as EventedListener);

    notifier.publish(":foo");
    notifier.publish(":foo");
    notifier.wait();

    expect(events).toEqual([[":foo"], [":foo"], [":foo"], [":foo"]]);
  });

  it("log subscriber with string", () => {
    const logged: unknown[][] = [];
    notifier.subscribe("1", ((...args: unknown[]) =>
      logged.push(args)) as unknown as EventedListener);

    notifier.publish("1");
    notifier.publish("1.a");
    notifier.publish("a.1");
    notifier.wait();

    expect(logged).toEqual([["1"]]);
  });

  it("log subscriber with pattern", () => {
    const logged: unknown[][] = [];
    notifier.subscribe(/\d/, ((...args: unknown[]) =>
      logged.push(args)) as unknown as EventedListener);

    notifier.publish("1");
    notifier.publish("a.1");
    notifier.publish("1.a");
    notifier.wait();

    expect(logged).toEqual([["1"], ["a.1"], ["1.a"]]);
  });

  it("multiple log subscribers", () => {
    const another: unknown[][] = [];
    notifier.subscribe(null, ((...args: unknown[]) =>
      another.push(args)) as unknown as EventedListener);
    notifier.publish(":foo");
    notifier.wait();

    expect(events).toEqual([[":foo"]]);
    expect(another).toEqual([[":foo"]]);
  });

  it("publish with subscriber", () => {
    const subscriber = new TestSubscriber();
    notifier.subscribe(null, subscriber as unknown as EventedListener);
    notifier.publish(":foo");

    expect(subscriber.publishes).toEqual([[":foo"]]);
  });
});

describe("InstrumentationTest", () => {
  beforeEach(setupTestCase);
  afterEach(teardownTestCase);

  it("instrument returns block result", () => {
    expect(Notifications.instrument("awesome", {}, () => 1 + 1)).toBe(2);
  });

  it("instrument yields the payload for further modification", () => {
    const evs: Event[] = [];
    notifier.subscribe(null, ((e: Event) => evs.push(e)) as unknown as EventedListener);
    expect(
      Notifications.instrument("awesome", {}, (p) => {
        p.result = 1 + 1;
        return p.result;
      }),
    ).toBe(2);
    expect(evs.length).toBe(1);
    expect(evs[0].name).toBe("awesome");
    expect(evs[0].payload).toEqual({ result: 2 });
  });
});

describe("EventTest", () => {
  it("events are initialized with details", () => {
    const time = Date.now() / 1000.0;
    const event = new Event("foo", time, time + 0.01, randomId(), {});

    expect(event.name).toBe("foo");
    expect(event.duration).toBeCloseTo(10.0, 1);
  });

  it("event cpu time does not raise error when start or finished not called", () => {
    const time = Date.now() / 1000.0;
    const event = new Event("foo", time, time + 0.01, randomId(), {});

    expect(event.cpuTime).toBe(0);
  });

  it("events consumes information given as payload", () => {
    const event = new Event(
      "foo",
      performance.now() / 1000.0,
      performance.now() / 1000.0 + 1,
      randomId(),
      { payload: "bar" },
    );
    expect(event.payload).toEqual({ payload: "bar" });
  });

  it("subscribe raises error on non supported arguments", () => {
    const notifier = new Fanout();

    expect(() => notifier.subscribe(1 as never, (() => {}) as never)).toThrow(ArgumentError);
    expect(() => notifier.subscribe({} as never, (() => {}) as never)).toThrow(ArgumentError);
  });
});

describe("ActiveSupport::Notifications", () => {
  describe("subscribe and instrument", () => {
    it("calls subscriber when event is fired", () => {
      const events: Event[] = [];
      Notifications.subscribe("render", (e) => events.push(e));
      Notifications.instrument("render");
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe("render");
    });

    it("does not call subscriber for non-matching event", () => {
      const events: Event[] = [];
      Notifications.subscribe("render", (e) => events.push(e));
      Notifications.instrument("sql.query");
      expect(events).toHaveLength(0);
    });

    it("passes payload to subscriber", () => {
      let received: Record<string, unknown> = {};
      Notifications.subscribe("render", (e) => {
        received = e.payload;
      });
      Notifications.instrument("render", { view: "index", format: "html" });
      expect(received).toEqual({ view: "index", format: "html" });
    });

    it("subscriber with null pattern receives all events", () => {
      const names: string[] = [];
      Notifications.subscribe(null, (e) => names.push(e.name));
      Notifications.instrument("foo");
      Notifications.instrument("bar");
      expect(names).toEqual(["foo", "bar"]);
    });

    it("subscriber with regex pattern matches by regex", () => {
      const names: string[] = [];
      Notifications.subscribe(/\.active_record$/, (e) => names.push(e.name));
      Notifications.instrument("sql.active_record");
      Notifications.instrument("cache.active_record");
      Notifications.instrument("render");
      expect(names).toEqual(["sql.active_record", "cache.active_record"]);
    });

    it("multiple subscribers each receive the event", () => {
      const a: string[] = [];
      const b: string[] = [];
      Notifications.subscribe("foo", (e) => a.push(e.name));
      Notifications.subscribe("foo", (e) => b.push(e.name));
      Notifications.instrument("foo");
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
    });
  });

  describe("instrument with block", () => {
    it("returns the block result", () => {
      const result = Notifications.instrument("compute", {}, () => 42);
      expect(result).toBe(42);
    });

    it("records start and end times", () => {
      let event!: Event;
      Notifications.subscribe("work", (e) => {
        event = e;
      });
      Notifications.instrument("work", {});
      expect(typeof event.time).toBe("number");
      expect(typeof event.end).toBe("number");
      expect(event.end!).toBeGreaterThanOrEqual(event.time!);
    });

    it("duration reflects elapsed time", async () => {
      let event!: Event;
      Notifications.subscribe("slow", (e) => {
        event = e;
      });
      await new Promise<void>((resolve) => {
        Notifications.instrument("slow", {}, () => {});
        resolve();
      });
      expect(event.duration).toBeGreaterThanOrEqual(0);
    });

    it("fires event even if block throws", () => {
      const events: Event[] = [];
      Notifications.subscribe("risky", (e) => events.push(e));
      expect(() => {
        Notifications.instrument("risky", {}, () => {
          throw new Error("oops");
        });
      }).toThrow("oops");
      expect(events).toHaveLength(1);
    });

    it("propagates block exceptions after notifying", () => {
      let notified = false;
      Notifications.subscribe("boom", () => {
        notified = true;
      });
      expect(() =>
        Notifications.instrument("boom", {}, () => {
          throw new Error("x");
        }),
      ).toThrow();
      expect(notified).toBe(true);
    });
  });

  describe("unsubscribe", () => {
    it("removes the subscriber", () => {
      const events: Event[] = [];
      const sub = Notifications.subscribe("ping", (e) => events.push(e));
      Notifications.instrument("ping");
      Notifications.unsubscribe(sub);
      Notifications.instrument("ping");
      expect(events).toHaveLength(1);
    });
  });

  describe("subscribeOnce", () => {
    it("fires callback only once", () => {
      const events: Event[] = [];
      Notifications.subscribeOnce("tick", (e) => events.push(e));
      Notifications.instrument("tick");
      Notifications.instrument("tick");
      expect(events).toHaveLength(1);
    });
  });

  describe("publish", () => {
    it("fires a fire-and-forget event", () => {
      const events: Event[] = [];
      Notifications.subscribe("cache.miss", (e) => events.push(e));
      Notifications.publish("cache.miss", { key: "users/1" });
      expect(events).toHaveLength(1);
      expect(events[0].payload).toEqual({ key: "users/1" });
    });
  });

  describe("Event", () => {
    it("has name, time, and payload", () => {
      const now = Date.now() / 1000.0;
      const e = new Event("foo", now, null, randomId(), { x: 1 });
      expect(e.name).toBe("foo");
      expect(e.time).toBeCloseTo(now, 6);
      expect(e.payload).toEqual({ x: 1 });
    });

    it("duration is positive after finish", () => {
      const e = new Event("foo", null, null, randomId(), {});
      e.startBang();
      e.finishBang();
      expect(e.duration).toBeGreaterThanOrEqual(0);
    });

    it("has unique transactionId", () => {
      const a = new Event("a", null, null, randomId(), {});
      const b = new Event("b", null, null, randomId(), {});
      expect(a.transactionId).not.toBe(b.transactionId);
    });
  });
});

describe("Instrumenter", () => {
  const buildNotifier = () => {
    const finishes: unknown[][] = [];
    return {
      finishes,
      start(..._args: unknown[]) {},
      finish(...args: unknown[]) {
        finishes.push(args);
      },
    };
  };

  it("returns the block's return value", () => {
    const inst = new Instrumenter(buildNotifier());
    const result = inst.instrument("test.event", {}, () => 42);
    expect(result).toBe(42);
  });

  it("finishes even when callback throws", () => {
    const notifier = buildNotifier();
    const inst = new Instrumenter(notifier);
    expect(() =>
      inst.instrument("test.event", {}, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(notifier.finishes).toHaveLength(1);
  });

  it("instrument finishes after promise resolves", async () => {
    const notifier = buildNotifier();
    const inst = new Instrumenter(notifier);
    const result = await inst.instrument("async.event", {}, async () => {
      return 99;
    });
    expect(result).toBe(99);
    expect(notifier.finishes).toHaveLength(1);
  });

  it("instrument finishes on rejection", async () => {
    const notifier = buildNotifier();
    const inst = new Instrumenter(notifier);
    await expect(
      inst.instrument("async.fail", {}, async () => {
        throw new Error("async boom");
      }),
    ).rejects.toThrow("async boom");
    expect(notifier.finishes).toHaveLength(1);
  });
});

describe("LegacyHandle", () => {
  it("passes the start listener state to finish", () => {
    const calls: unknown[][] = [];
    const notifier = {
      start(name: string, id: unknown, payload: unknown) {
        calls.push(["start", name, id, payload]);
        return "state";
      },
      finish(...args: unknown[]) {
        calls.push(["finish", ...args]);
      },
    };
    const payload = {};
    const handle = new LegacyHandle(notifier, "legacy.event", "id", payload);
    handle.start();
    handle.finish();
    expect(calls).toEqual([
      ["start", "legacy.event", "id", payload],
      ["finish", "legacy.event", "id", payload, "state"],
    ]);
  });
});

describe("Wrapper", () => {
  it("builds legacy handles", () => {
    const wrapper = new Wrapper({ start() {}, finish() {} });
    expect(wrapper.buildHandle("a", "id", {})).toBeInstanceOf(LegacyHandle);
  });
});
