import { afterEach, describe, expect, it } from "vitest";
import { Notifications } from "../notifications.js";
import { Event } from "./instrumenter.js";

describe("InstrumenterTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("instrument", () => {
    let fired = false;
    Notifications.subscribe("foo.bar", () => {
      fired = true;
    });
    Notifications.instrument("foo.bar", {});
    expect(fired).toBe(true);
  });

  it("instrument yields the payload for further modification", () => {
    let received: Record<string, unknown> = {};
    Notifications.subscribe("foo", (e) => {
      received = e.payload;
    });
    Notifications.instrument("foo", { key: "original" }, () => {});
    expect(received.key).toBe("original");
  });

  it("instrument works without a block", () => {
    const events: Event[] = [];
    Notifications.subscribe("foo", (e) => events.push(e));
    Notifications.instrument("foo", { x: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].end).toBeInstanceOf(Date);
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
    expect(events[0].end).toBeInstanceOf(Date);
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
    Notifications.instrument("modify.test", { original: true }, () => {});
    expect(events[0].payload.original).toBe(true);
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
