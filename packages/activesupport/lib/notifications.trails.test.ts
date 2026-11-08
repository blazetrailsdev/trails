import { afterEach, describe, expect, it } from "vitest";
import { Notifications } from "./notifications.js";
import { Event as EventClass } from "./notifications/instrumenter.js";
import type { Event } from "./notifications/instrumenter.js";

describe("Notifications (trails)", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  describe("listening? short-circuit", () => {
    it("runs the block when nothing is listening", () => {
      let ran = false;
      const result = Notifications.instrument("unlistened", { a: 1 }, (payload) => {
        ran = true;
        expect(payload.a).toBe(1);
        return "value";
      });
      expect(ran).toBe(true);
      expect(result).toBe("value");
    });

    it("yields the same payload object when nothing is listening", () => {
      const payload = { a: 1 };
      Notifications.instrument("unlistened", payload, (yielded) => {
        expect(yielded).toBe(payload);
      });
    });

    it("does not set exception keys when nothing is listening", () => {
      const payload: Record<string, unknown> = {};
      expect(() =>
        Notifications.instrument("unlistened", payload, () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(payload.exception).toBeUndefined();
      expect(payload.exception_object).toBeUndefined();
    });

    it("runs an async block when nothing is listening", async () => {
      const result = await Notifications.instrument("unlistened", { a: 1 }, async (payload) => {
        expect(payload.a).toBe(1);
        return "value";
      });
      expect(result).toBe("value");
    });

    it("yields the payload to an async block for further modification", async () => {
      const events: Event[] = [];
      Notifications.subscribe("modify.async", (e) => events.push(e));
      await Notifications.instrument("modify.async", { row_count: 0 }, async (payload) => {
        payload.row_count = 3;
      });
      expect(events[0].payload.row_count).toBe(3);
    });
  });

  describe("instrument rescue arm", () => {
    it("records exception and exception_object, then rethrows", async () => {
      const events: Event[] = [];
      Notifications.subscribe("crash", (e) => events.push(e));
      await expect(
        Notifications.instrument("crash", {}, async () => {
          throw new TypeError("Oopsies");
        }),
      ).rejects.toThrow("Oopsies");
      expect(events).toHaveLength(1);
      expect(events[0].payload.exception).toEqual(["TypeError", "Oopsies"]);
      expect(events[0].payload.exception_object).toBeInstanceOf(TypeError);
    });

    it("still finishes and publishes the event on error", async () => {
      const events: Event[] = [];
      Notifications.subscribe("crash", (e) => events.push(e));
      await expect(
        Notifications.instrument("crash", {}, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(events[0].end).not.toBeNull();
    });

    it("records a non-Error throw", async () => {
      const events: Event[] = [];
      Notifications.subscribe("crash", (e) => events.push(e));
      await expect(
        Notifications.instrument("crash", {}, async () => {
          throw "bare string";
        }),
      ).rejects.toBe("bare string");
      expect(events[0].payload.exception_object).toBe("bare string");
      expect(events[0].payload.exception).toEqual(["String", "bare string"]);
    });

    it("names a namespaced error by its Rails class name", async () => {
      class ParamError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "ActionDispatch::ParamError";
        }
      }
      const events: Event[] = [];
      Notifications.subscribe("crash", (e) => events.push(e));
      await expect(
        Notifications.instrument("crash", {}, async () => {
          throw new ParamError("bad param");
        }),
      ).rejects.toThrow("bad param");
      expect(events[0].payload.exception).toEqual(["ActionDispatch::ParamError", "bad param"]);
    });

    it("leaves exception keys unset on success", async () => {
      const events: Event[] = [];
      Notifications.subscribe("ok", (e) => events.push(e));
      await Notifications.instrument("ok", {}, async () => "fine");
      expect(events[0].payload.exception).toBeUndefined();
      expect(events[0].payload.exception_object).toBeUndefined();
    });
  });

  describe("buildHandle", () => {
    it("publishes one event spanning start→finish, off the mutated payload", () => {
      const events: Event[] = [];
      Notifications.subscribe("span", (e) => events.push(e));

      const payload: Record<string, unknown> = { a: 1 };
      const handle = Notifications.instrumenter.buildHandle("span", payload);
      handle.start();
      payload.outcome = "done";
      handle.finish();

      expect(events).toHaveLength(1);
      expect(events[0].name).toBe("span");
      expect(events[0].payload.outcome).toBe("done");
      expect(events[0].end).not.toBeNull();
    });

    it("skips building an event when nothing is listening", () => {
      const handle = Notifications.buildHandle("unlistened", {});
      expect(() => {
        handle.start();
        handle.finish();
      }).not.toThrow();
    });

    it("snapshots the subscribers at build time, not at finish", () => {
      const early: Event[] = [];
      const late: Event[] = [];
      Notifications.subscribe("span", (e) => early.push(e));

      const handle = Notifications.buildHandle("span", {});
      handle.start();
      Notifications.subscribe("span", (e) => late.push(e));
      handle.finish();

      expect(early).toHaveLength(1);
      expect(late).toHaveLength(0);
    });

    it("runs every snapshot subscriber even when one throws, then re-raises", () => {
      const ran: string[] = [];
      Notifications.subscribe("span", () => ran.push("a"));
      Notifications.subscribe("span", () => {
        ran.push("b");
        throw new Error("boom");
      });
      Notifications.subscribe("span", () => ran.push("c"));

      const handle = Notifications.buildHandle("span", {});
      handle.start();
      expect(() => handle.finish()).toThrow("boom");
      expect(ran).toEqual(["a", "b", "c"]);
    });

    it("raises when start/finish are called out of order", () => {
      Notifications.subscribe("span", () => {});
      const handle = Notifications.buildHandle("span", {});
      expect(() => handle.finish()).toThrow(/expected state to be :started/);
      handle.start();
      expect(() => handle.start()).toThrow(/expected state to be :initialized/);
    });
  });

  describe("payload is replaced at finish, not merged", () => {
    it("reflects a key the block deleted", () => {
      const events: Event[] = [];
      Notifications.subscribe("del", (e) => events.push(e));

      Notifications.instrument("del", { stale: true }, (payload) => {
        delete payload.stale;
      });

      expect(events).toHaveLength(1);
      expect("stale" in events[0].payload).toBe(false);
    });

    it("publishes the same payload object the block was yielded", () => {
      const events: Event[] = [];
      Notifications.subscribe("ident", (e) => events.push(e));

      const payload = { a: 1 };
      Notifications.instrument("ident", payload, (yielded) => {
        expect(yielded).toBe(payload);
      });

      expect(events[0].payload).toBe(payload);
    });

    it("publishes the same payload object with no block", () => {
      const events: Event[] = [];
      Notifications.subscribe("ident", (e) => events.push(e));

      const payload = { a: 1 };
      Notifications.instrument("ident", payload);

      expect(events[0].payload).toBe(payload);
    });

    it("publish delivers the same payload object", () => {
      const events: Event[] = [];
      Notifications.subscribe("ident", (e) => events.push(e));

      const payload = { a: 1 };
      Notifications.publish("ident", payload);

      expect(events[0].payload).toBe(payload);
    });

    it("a multi-argument callable object is subscribed as a timed listener", () => {
      const calls: unknown[][] = [];
      const listener = {
        call(name: string, start: unknown, finish: unknown, id: unknown, payload: unknown) {
          calls.push([name, start, finish, id, payload]);
        },
      };
      Notifications.subscribe("callable.timed", listener);

      Notifications.instrument("callable.timed", { a: 1 });

      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe("callable.timed");
      expect((calls[0][4] as Record<string, unknown>).a).toBe(1);
    });

    it("publishEvent routes a prebuilt event to matching subscribers", () => {
      const received: Event[] = [];
      Notifications.subscribe("prebuilt", (e) => received.push(e));

      const event = new EventClass("prebuilt", null, null, "id-1", { b: 2 });
      event.startBang();
      event.finishBang();
      Notifications.publishEvent(event);

      expect(received).toHaveLength(1);
      expect(received[0].name).toBe("prebuilt");
      expect(received[0].payload.b).toBe(2);
    });
  });
});
