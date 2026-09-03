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

  it("instrument names a thrown non-Error without a constructor", () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = {};
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

  it("instrument yields the payload for further modification", async () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = {};
    await new Instrumenter(notifier).instrument("awesome", payload, async (p) => {
      p.result = 1 + 1;
    });
    expect(payload.result).toBe(2);
    expect(notifier.finishes[0].payload).toEqual({ result: 2 });
  });

  it("instrument records the exception on the payload of an awaited block and re-raises", async () => {
    const notifier = buildNotifier();
    const payload: Record<string, unknown> = {};
    await expect(
      new Instrumenter(notifier).instrument("crash", payload, async () => {
        throw new RangeError("Oopsies");
      }),
    ).rejects.toThrow("Oopsies");
    expect(payload.exception).toEqual(["RangeError", "Oopsies"]);
    expect(payload.exception_object).toBeInstanceOf(RangeError);
  });

  it("instrument finishes the handle only once an awaited block settles", async () => {
    const notifier = buildNotifier();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = new Instrumenter(notifier).instrument("slow", {}, async () => {
      await gate;
      return 42;
    });
    expect(notifier.finishes).toHaveLength(0);
    release();
    expect(await pending).toBe(42);
    expect(notifier.finishes).toHaveLength(1);
  });

  it("instrument returns a thenable block result without awaiting it", () => {
    const notifier = buildNotifier();
    const thenable = { then: (onFulfilled: (v: number) => void) => onFulfilled(1) };
    const returned = new Instrumenter(notifier).instrument("sync", {}, () => thenable);
    expect(returned).toBe(thenable);
    expect(notifier.finishes).toHaveLength(1);
  });

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

  it("buildHandle delegates to a notifier that can build handles", () => {
    const delegated = { start() {}, finish() {} };
    const calls: Array<[string, unknown]> = [];
    const notifier = {
      publish() {},
      buildHandle(name: string, id: unknown) {
        calls.push([name, id]);
        return delegated;
      },
    };
    const instrumenter = new Instrumenter(notifier);
    const handle = instrumenter.buildHandle("span", {});
    expect(handle).toBe(delegated);
    expect(calls).toEqual([["span", instrumenter.id]]);
  });

  it("instrument routes through the notifier's build_handle", () => {
    const order: string[] = [];
    const notifier = {
      publish() {
        order.push("publish");
      },
      buildHandle(_name: string, _id: unknown) {
        return {
          start() {
            order.push("start");
          },
          finish() {
            order.push("finish");
          },
        };
      },
    };
    new Instrumenter(notifier).instrument("span", {}, () => {
      order.push("block");
    });
    expect(order).toEqual(["start", "block", "finish"]);
  });
});
