import { afterEach, describe, expect, it } from "vitest";
import { Notifications } from "../notifications.js";
import { Event, Instrumenter } from "./instrumenter.js";
import { Temporal } from "../temporal.js";

// Rails' TestNotifier collects the start/finish calls; trails' notifier surface
// is a single publish, so `finishes` collects the published events.
const buildNotifier = () => {
  const finishes: Event[] = [];
  return {
    finishes,
    publish(_name: string, event: Event) {
      finishes.push(event);
    },
  };
};

describe("InstrumenterTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("instrument", () => {
    const notifier = buildNotifier();
    let called = false;
    new Instrumenter(notifier).instrument("foo", { foo: {} }, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("instrument yields the payload for further modification", () => {
    const notifier = buildNotifier();
    const result = new Instrumenter(notifier).instrument("awesome", {}, (p) => (p.result = 1 + 1));
    expect(result).toBe(2);
    expect(notifier.finishes).toHaveLength(1);
    expect(notifier.finishes[0].name).toBe("awesome");
    expect(notifier.finishes[0].payload).toEqual({ result: 2 });
  });

  it("instrument works without a block", () => {
    const notifier = buildNotifier();
    new Instrumenter(notifier).instrument("no.block", { foo: {} });
    expect(notifier.finishes).toHaveLength(1);
    expect(notifier.finishes[0].name).toBe("no.block");
  });

  it("start", () => {
    const events: Event[] = [];
    Notifications.subscribe("start.test", (e) => events.push(e));
    Notifications.instrument("start.test", { phase: "start" });
    expect(events[0].payload.phase).toBe("start");
  });

  it("finish", () => {
    const events: Event[] = [];
    Notifications.subscribe("finish.test", (e) => events.push(e));
    Notifications.instrument("finish.test", {});
    expect(events[0].end).toBeInstanceOf(Temporal.Instant);
  });

  it("record", () => {
    const events: Event[] = [];
    Notifications.subscribe("record.test", (e) => events.push(e));
    Notifications.instrument("record.test", { data: "value" });
    expect(events[0].payload.data).toBe("value");
  });

  it("record yields the payload for further modification", () => {
    const events: Event[] = [];
    Notifications.subscribe("modify.test", (e) => events.push(e));
    Notifications.instrument("modify.test", { original: true }, (payload) => {
      payload.added = "later";
    });
    expect(events[0].payload.original).toBe(true);
    expect(events[0].payload.added).toBe("later");
  });

  it("record works without a block", () => {
    const events: Event[] = [];
    Notifications.subscribe("no.block.test", (e) => events.push(e));
    Notifications.instrument("no.block.test", { x: 1 });
    expect(events).toHaveLength(1);
  });

  it("record with exception", () => {
    const events: Event[] = [];
    Notifications.subscribe("risky", (e) => events.push(e));
    expect(() =>
      Notifications.instrument("risky", {}, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(events).toHaveLength(1);
  });
});
