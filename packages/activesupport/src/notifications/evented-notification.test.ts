import { afterEach, describe, expect, it } from "vitest";
import { Notifications } from "../notifications.js";
import { Event } from "../notifications/instrumenter.js";

describe("EventedTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("evented listener", () => {
    const events: Event[] = [];
    const sub = Notifications.subscribe("evented.test", (e) => events.push(e));
    Notifications.instrument("evented.test", { data: "hello" });
    Notifications.unsubscribe(sub);
    expect(events).toHaveLength(1);
    expect(events[0].payload.data).toBe("hello");
    // After unsubscribe, no more events
    Notifications.instrument("evented.test", {});
    expect(events).toHaveLength(1);
  });

  it("evented listener no events", () => {
    const events: Event[] = [];
    const sub = Notifications.subscribe("no.events.test", (e) => events.push(e));
    Notifications.unsubscribe(sub);
    // No instruments after subscribe
    expect(events).toHaveLength(0);
  });

  it("listen to everything", () => {
    const names: string[] = [];
    Notifications.subscribe(null, (e) => names.push(e.name));
    Notifications.instrument("alpha");
    Notifications.instrument("beta");
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });

  it.skip("listen start multiple exception consistency");

  it.skip("listen finish multiple exception consistency");

  it.skip("evented listener priority");

  it("listen to regexp", () => {
    const names: string[] = [];
    Notifications.subscribe(/\.active_record$/, (e) => names.push(e.name));
    Notifications.instrument("sql.active_record");
    Notifications.instrument("unrelated");
    expect(names).toEqual(["sql.active_record"]);
  });

  it.skip("listen to regexp with exclusions");
});
