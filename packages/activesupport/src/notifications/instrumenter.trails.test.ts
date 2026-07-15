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
    expect(() =>
      new Instrumenter(notifier).instrument("crash", payload, () => {
        throw null;
      }),
    ).toThrow();
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
});
