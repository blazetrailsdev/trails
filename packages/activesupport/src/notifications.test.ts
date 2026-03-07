import { describe, it, expect, beforeEach } from "vitest";
import { Notifications, Event } from "./notifications.js";

beforeEach(() => {
  Notifications.unsubscribeAll();
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
      Notifications.subscribe("render", (e) => { received = e.payload; });
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
      Notifications.subscribe("work", (e) => { event = e; });
      Notifications.instrument("work", {}, () => {});
      expect(event.time).toBeInstanceOf(Date);
      expect(event.end).toBeInstanceOf(Date);
      expect(event.end!.getTime()).toBeGreaterThanOrEqual(event.time.getTime());
    });

    it("duration reflects elapsed time", async () => {
      let event!: Event;
      Notifications.subscribe("slow", (e) => { event = e; });
      await new Promise<void>((resolve) => {
        Notifications.instrument("slow", {}, () => {
          // just do synchronous work; duration > 0 after finish
        });
        resolve();
      });
      expect(event.duration).toBeGreaterThanOrEqual(0);
    });

    it("fires event even if block throws", () => {
      const events: Event[] = [];
      Notifications.subscribe("risky", (e) => events.push(e));
      expect(() => {
        Notifications.instrument("risky", {}, () => { throw new Error("oops"); });
      }).toThrow("oops");
      expect(events).toHaveLength(1);
    });

    it("propagates block exceptions after notifying", () => {
      let notified = false;
      Notifications.subscribe("boom", () => { notified = true; });
      expect(() => Notifications.instrument("boom", {}, () => { throw new Error("x"); })).toThrow();
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

  describe("collectEvents", () => {
    it("returns all matching events fired during block", () => {
      const events = Notifications.collectEvents("sql", () => {
        Notifications.instrument("sql", { sql: "SELECT 1" });
        Notifications.instrument("sql", { sql: "SELECT 2" });
        Notifications.instrument("other");
      });
      expect(events).toHaveLength(2);
      expect(events[0].payload.sql).toBe("SELECT 1");
      expect(events[1].payload.sql).toBe("SELECT 2");
    });

    it("does not include events outside the block", () => {
      Notifications.instrument("sql", { sql: "before" });
      const events = Notifications.collectEvents("sql", () => {
        Notifications.instrument("sql", { sql: "during" });
      });
      Notifications.instrument("sql", { sql: "after" });
      expect(events).toHaveLength(1);
      expect(events[0].payload.sql).toBe("during");
    });
  });

  describe("Event", () => {
    it("has name, time, and payload", () => {
      const now = new Date();
      const e = new Event("foo", now, { x: 1 });
      expect(e.name).toBe("foo");
      expect(e.time).toBe(now);
      expect(e.payload).toEqual({ x: 1 });
    });

    it("duration is 0 before finish", () => {
      const e = new Event("foo", new Date());
      expect(e.duration).toBe(0);
    });

    it("duration is positive after finish", () => {
      const start = new Date(Date.now() - 100);
      const e = new Event("foo", start);
      e.finish(new Date());
      expect(e.duration).toBeGreaterThan(0);
    });

    it("has unique transactionId", () => {
      const a = new Event("a", new Date());
      const b = new Event("b", new Date());
      expect(a.transactionId).not.toBe(b.transactionId);
    });

    it("tracks child events from nested instrument calls", () => {
      let outerEvent!: Event;
      Notifications.subscribe("outer", (e) => { outerEvent = e; });
      Notifications.instrument("outer", {}, () => {
        Notifications.instrument("inner", {}, () => {});
      });
      expect(outerEvent.children).toHaveLength(1);
      expect(outerEvent.children[0].name).toBe("inner");
    });
  });

  describe("subscriber error isolation", () => {
    it("does not propagate errors from subscribers", () => {
      Notifications.subscribe("safe", () => { throw new Error("subscriber boom"); });
      const events: Event[] = [];
      Notifications.subscribe("safe", (e) => events.push(e));
      expect(() => Notifications.instrument("safe")).not.toThrow();
      expect(events).toHaveLength(1);
    });
  });
});
