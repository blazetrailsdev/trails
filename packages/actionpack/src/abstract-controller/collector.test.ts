import { describe, it, expect } from "vitest";
import { MimeType } from "../action-dispatch/http/mime-type.js";
import { Collector } from "./collector.js";

class TestCollector extends Collector {
  readonly calls: [string, unknown[]][] = [];
  custom(mime: MimeType, ...args: unknown[]): unknown {
    this.calls.push([mime.symbol, args]);
    return `dispatched:${mime.symbol}`;
  }
}

describe("AbstractController::Collector", () => {
  it("dispatches per-MIME methods through custom()", () => {
    const c = new TestCollector() as TestCollector & {
      html: (...args: unknown[]) => unknown;
      json: (...args: unknown[]) => unknown;
    };
    expect(c.html(1, 2)).toBe("dispatched:html");
    expect(c.json("x")).toBe("dispatched:json");
    expect(c.calls).toEqual([
      ["html", [1, 2]],
      ["json", ["x"]],
    ]);
  });

  it("picks up MIME types registered AFTER construction", () => {
    const c = new TestCollector() as TestCollector & {
      latefmt?: (...args: unknown[]) => unknown;
    };
    expect(MimeType.lookup("latefmt")).toBeUndefined();
    MimeType.register("application/latefmt", "latefmt", [], ["latefmt"]);
    try {
      expect(c.latefmt!("ok")).toBe("dispatched:latefmt");
    } finally {
      MimeType.unregister("latefmt");
    }
  });

  it("preserves real subclass properties and methods", () => {
    class WithState extends Collector {
      counter = 0;
      bump(): number {
        return ++this.counter;
      }
      custom(_mime: MimeType): unknown {
        return null;
      }
    }
    const c = new WithState();
    expect(c.bump()).toBe(1);
    expect(c.bump()).toBe(2);
    expect(c.counter).toBe(2);
  });

  it("throws a useful error for unknown MIME symbols", () => {
    const c = new TestCollector() as TestCollector & {
      thisIsNotAMime: () => unknown;
    };
    expect(() => c.thisIsNotAMime()).toThrow(/register it as a MIME type/);
  });

  it("has() responds true for both real props and registered MIME symbols", () => {
    const c = new TestCollector();
    expect("custom" in c).toBe(true);
    expect("html" in c).toBe(true);
    expect("bogusFormatXyz" in c).toBe(false);
  });
});
