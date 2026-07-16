import { afterEach, describe, expect, it } from "vitest";
import { Notifications } from "./notifications.js";
import type { Event } from "./notifications/instrumenter.js";

/**
 * trails-only coverage for the static Notifications surface: the
 * `notifier.listening?(name)` short-circuit (Rails has no dedicated test for
 * it) and `instrumentAsync`, which is a trails extension with no Rails
 * analogue.
 */
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

    it("does not attach a child event to a listened-to parent", () => {
      const events: Event[] = [];
      Notifications.subscribe("parent", (e) => events.push(e));
      Notifications.instrument("parent", {}, () => {
        Notifications.instrument("unlistened.child", {}, () => undefined);
      });
      expect(events).toHaveLength(1);
      expect(events[0].children).toHaveLength(0);
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
      const result = await Notifications.instrumentAsync(
        "unlistened",
        { a: 1 },
        async (payload) => {
          expect(payload.a).toBe(1);
          return "value";
        },
      );
      expect(result).toBe("value");
    });
  });

  describe("instrumentAsync rescue arm", () => {
    it("records exception and exception_object, then rethrows", async () => {
      const events: Event[] = [];
      Notifications.subscribe("crash", (e) => events.push(e));
      await expect(
        Notifications.instrumentAsync("crash", {}, async () => {
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
        Notifications.instrumentAsync("crash", {}, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(events[0].end).not.toBeNull();
    });

    it("records a non-Error throw", async () => {
      const events: Event[] = [];
      Notifications.subscribe("crash", (e) => events.push(e));
      await expect(
        Notifications.instrumentAsync("crash", {}, async () => {
          throw "bare string";
        }),
      ).rejects.toBe("bare string");
      expect(events[0].payload.exception_object).toBe("bare string");
      // Ruby cannot raise a non-Exception, so there is no Rails analogue; name
      // the class the way Rails would name it rather than leaking `typeof`.
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
        Notifications.instrumentAsync("crash", {}, async () => {
          throw new ParamError("bad param");
        }),
      ).rejects.toThrow("bad param");
      // Rails' e.class.name is fully qualified; trails carries that on `name`,
      // and it is what rescue_responses keys off (log_subscriber.rb:32).
      expect(events[0].payload.exception).toEqual(["ActionDispatch::ParamError", "bad param"]);
    });

    it("leaves exception keys unset on success", async () => {
      const events: Event[] = [];
      Notifications.subscribe("ok", (e) => events.push(e));
      await Notifications.instrumentAsync("ok", {}, async () => "fine");
      expect(events[0].payload.exception).toBeUndefined();
      expect(events[0].payload.exception_object).toBeUndefined();
    });
  });

  // Mirrors ActiveSupport::Notifications.instrumenter.build_handle — the
  // low-level primitive TransactionInstrumenter spans a transaction with.
  describe("buildHandle", () => {
    it("publishes one event spanning start→finish, off the mutated payload", () => {
      const events: Event[] = [];
      Notifications.subscribe("span", (e) => events.push(e));

      const payload: Record<string, unknown> = { a: 1 };
      const handle = Notifications.instrumenter.buildHandle("span", payload);
      handle.start();
      // Subscribers must see mutations made between start and finish.
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
      // Rails' Fanout::Handle captures groups_for(name) in initialize
      // (fanout.rb:230): a subscriber added after build_handle sees nothing.
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
      // Rails' Handle#finish_with_values guards each group
      // (iterate_guarding_exceptions, fanout.rb:20-39): a throwing subscriber
      // must not stop the ones after it.
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
      expect(() => handle.finish()).toThrow(/expected state to be "started"/);
      handle.start();
      expect(() => handle.start()).toThrow(/expected state to be "initialized"/);
    });
  });

  // Rails' EventObjectGroup#finish assigns `@event.payload = payload` after
  // Event#initialize dup'd it (fanout.rb:166-178), so the published event
  // reflects the final payload object exactly — including keys the block deleted.
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
  });
});
