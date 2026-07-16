// TS-only surface: Rails has no async instrument, and no test for
// Instrumenter#instrument's rescue arm (its test_record_with_exception covers
// Event#record, which trails' Event does not implement).
import { describe, expect, it } from "vitest";
import { Event, Instrumenter } from "./instrumenter.js";

const buildNotifier = () => {
  const finishes: Event[] = [];
  return {
    finishes,
    publish(_name: string, event: Event) {
      finishes.push(event);
    },
  };
};

describe("Instrumenter (trails)", () => {
  it("instrument records the exception on the payload and re-raises", () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = {};
    expect(() =>
      new Instrumenter(notifier).instrument("crash", payload, () => {
        throw new TypeError("Oopsies");
      }),
    ).toThrow("Oopsies");
    expect(payload.exception).toEqual(["TypeError", "Oopsies"]);
    expect((payload.exception_object as Error).message).toBe("Oopsies");
    expect(notifier.finishes).toHaveLength(1);
  });

  // JS can throw a non-Error; Ruby cannot, so `e.class.name` has no analogue
  // here and the fallback is what keeps payload[:exception] a [name, message]
  // pair regardless of what was thrown.
  it("instrument names a thrown non-Error without a constructor", () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = {};
    // Asserting the thrown value itself, not just toThrow(): a falsy throw is
    // exactly where "did it re-raise?" and "did it swallow?" look alike.
    let thrown: unknown = "nothing was thrown";
    try {
      new Instrumenter(notifier).instrument("crash", payload, () => {
        throw null;
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeNull();
    expect(payload.exception).toEqual(["Error", "null"]);
    expect(payload.exception_object).toBeNull();
  });

  it("instrumentAsync yields the payload for further modification", async () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = {};
    await new Instrumenter(notifier).instrumentAsync("awesome", payload, async (p) => {
      p.result = 1 + 1;
    });
    expect(payload.result).toBe(2);
    expect(notifier.finishes[0].payload).toEqual({ result: 2 });
  });

  it("instrumentAsync records the exception on the payload and re-raises", async () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = {};
    await expect(
      new Instrumenter(notifier).instrumentAsync("crash", payload, async () => {
        throw new RangeError("Oopsies");
      }),
    ).rejects.toThrow("Oopsies");
    expect(payload.exception).toEqual(["RangeError", "Oopsies"]);
    expect(payload.exception_object).toBeInstanceOf(RangeError);
  });

  // build_handle is the low-level primitive TransactionInstrumenter spans a
  // transaction with; it publishes one event carrying payload mutations made
  // between start and finish.
  it("buildHandle publishes one event spanning start→finish", () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = { a: 1 };
    const handle = new Instrumenter(notifier).buildHandle("span", payload);
    handle.start();
    payload.outcome = "done";
    handle.finish();
    expect(notifier.finishes).toHaveLength(1);
    expect(notifier.finishes[0].name).toBe("span");
    expect(notifier.finishes[0].payload.outcome).toBe("done");
    expect(notifier.finishes[0].end).not.toBeNull();
  });

  it("buildHandle raises when start/finish are called out of order", () => {
    const handle = new Instrumenter(buildNotifier()).buildHandle("span", {});
    expect(() => handle.finish()).toThrow(/expected state to be "started"/);
    handle.start();
    expect(() => handle.start()).toThrow(/expected state to be "initialized"/);
  });
});
