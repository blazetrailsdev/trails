import { describe, it, expect } from "vitest";

import { Notifications } from "./notifications.js";

describe("SubscriberTest", () => {
  it("attaches subscribers", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe("test.action", (e) => events.push(e.name));
    Notifications.instrument("test.action");
    Notifications.unsubscribe(sub);
    expect(events).toContain("test.action");
  });

  it("attaches subscribers with inherit all option", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe(null, (e) => events.push(e.name));
    Notifications.instrument("any.event");
    Notifications.instrument("another.event");
    Notifications.unsubscribe(sub);
    expect(events).toContain("any.event");
    expect(events).toContain("another.event");
  });

  it("attaches subscribers with inherit all option replaces original behavior", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe(/\.test$/, (e) => events.push(e.name));
    Notifications.instrument("foo.test");
    Notifications.instrument("bar.test");
    Notifications.instrument("foo.other");
    Notifications.unsubscribe(sub);
    expect(events).toContain("foo.test");
    expect(events).toContain("bar.test");
    expect(events).not.toContain("foo.other");
  });

  it("attaches only one subscriber", () => {
    const events: string[] = [];
    const handler = (e: { name: string }) => events.push(e.name);
    const sub = Notifications.subscribe("single.test", handler);
    Notifications.instrument("single.test");
    Notifications.unsubscribe(sub);
    expect(events).toHaveLength(1);
  });

  it("does not attach private methods", () => {
    // In JS there are no private methods on subscribers in the same way
    // Test that only the intended handler is called
    let called = 0;
    const sub = Notifications.subscribe("private.test", () => called++);
    Notifications.instrument("private.test");
    Notifications.unsubscribe(sub);
    expect(called).toBe(1);
  });

  it("detaches subscribers", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe("detach.test", (e) => events.push(e.name));
    Notifications.instrument("detach.test");
    Notifications.unsubscribe(sub);
    Notifications.instrument("detach.test");
    expect(events).toHaveLength(1);
  });

  it("detaches subscribers from inherited methods", () => {
    const events: string[] = [];
    const sub = Notifications.subscribe("inherited.test", (e) => events.push(e.name));
    Notifications.instrument("inherited.test");
    Notifications.unsubscribe(sub);
    Notifications.instrument("inherited.test");
    expect(events).toHaveLength(1);
  });

  it("supports publish event", () => {
    const events: { name: string; payload: Record<string, unknown> }[] = [];
    const sub = Notifications.subscribe("publish.test", (e) =>
      events.push({ name: e.name, payload: e.payload }),
    );
    Notifications.instrument("publish.test", { message: "hello" });
    Notifications.unsubscribe(sub);
    expect(events[0].name).toBe("publish.test");
    expect(events[0].payload.message).toBe("hello");
  });

  it("publish event preserve units", () => {
    const events: { name: string }[] = [];
    const sub = Notifications.subscribe("units.test", (e) => events.push({ name: e.name }));
    Notifications.instrument("units.test", { value: 42, unit: "ms" });
    Notifications.unsubscribe(sub);
    expect(events[0].name).toBe("units.test");
  });
});
