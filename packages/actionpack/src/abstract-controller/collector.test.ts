import { describe, expect, it } from "vitest";
import { MimeType } from "../action-dispatch/http/mime-type.js";
import { Collector, generateMethodForMime } from "./collector.js";

// ==========================================================================
// abstract/collector_test.rb
// ==========================================================================

// Rails' `MyCollector` records each per-MIME invocation as
// `[mime, args, kwargs, block]`. JS has no kwargs/block distinction;
// we record `[mime, args]` and treat the last arg as the "block" when
// it's a function (mirroring Rails' &block sugar).
class MyCollector extends Collector {
  responses: [MimeType, unknown[], (() => unknown) | null][] = [];
  custom(mime: MimeType, ...args: unknown[]): unknown {
    const last = args[args.length - 1];
    const block = typeof last === "function" ? (last as () => unknown) : null;
    const positional = block ? args.slice(0, -1) : args;
    this.responses.push([mime, positional, block]);
    return undefined;
  }
}

describe("TestCollector", () => {
  it("responds to default mime types", () => {
    const collector = new MyCollector();
    expect("html" in collector).toBe(true);
    expect("text" in collector).toBe(true);
  });

  it("does not respond to unknown mime types", () => {
    const collector = new MyCollector();
    expect("unknown" in collector).toBe(false);
  });

  it("register mime types on method missing", () => {
    // Rails: `remove_method :js`; first call → method_missing →
    // define_method. JS has no method_missing; trails' Proxy dispatches
    // dynamically every call. The behavioral parity is "MIME types
    // become reachable as soon as they're registered" — exercise that
    // by unregistering and re-registering js.
    MimeType.unregister("js");
    try {
      const collector = new MyCollector();
      expect("js" in collector).toBe(false);
      MimeType.register("text/javascript", "js", ["application/javascript"], ["js"]);
      const c = collector as MyCollector & { js: (...a: unknown[]) => unknown };
      c.js();
      expect("js" in c).toBe(true);
    } finally {
      if (!MimeType.isRegistered("js")) {
        MimeType.register("text/javascript", "js", ["application/javascript"], ["js"]);
      }
    }
  });

  it("does not register unknown mime types", () => {
    const collector = new MyCollector() as MyCollector & { unknown: () => void };
    expect(() => collector.unknown()).toThrow(/register it as a MIME type/);
  });

  it("generated methods call custom with arguments received", () => {
    const collector = new MyCollector() as MyCollector & {
      html: (...a: unknown[]) => unknown;
      text: (...a: unknown[]) => unknown;
      js: (...a: unknown[]) => unknown;
    };
    collector.html();
    collector.text("foo", { bar: "baz" });
    const block = (): string => "baz";
    collector.js("bar", block);

    expect(collector.responses[0]).toEqual([MimeType.HTML, [], null]);
    expect(collector.responses[1]).toEqual([MimeType.TEXT, ["foo", { bar: "baz" }], null]);
    expect(collector.responses[2].slice(0, 2)).toEqual([MimeType.JS, ["bar"]]);
    expect((collector.responses[2][2] as () => string)()).toBe("baz");
  });
});

// ==========================================================================
// trails-only Proxy-shape coverage — no Rails counterpart. Kept here
// because every assertion targets a Proxy edge case that doesn't exist
// in Rails (then/catch/inspect collisions, JSON.stringify, late MIME
// registration via the Proxy, undefined-shadowing).
// ==========================================================================
class TestCollector extends Collector {
  readonly calls: [string, unknown[]][] = [];
  custom(mime: MimeType, ...args: unknown[]): unknown {
    this.calls.push([mime.symbol, args]);
    return `dispatched:${mime.symbol}`;
  }
}

describe("AbstractController::Collector — trails-only Proxy edges", () => {
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
    expect(MimeType.isRegistered("latefmt")).toBe(false);
    MimeType.register("application/latefmt", "latefmt");
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

  it("binds `this` inside custom() to the Proxy receiver, not the raw target", () => {
    class ThisChecker extends Collector {
      seenThis: unknown;
      custom(_mime: MimeType): unknown {
        this.seenThis = this;
        return null;
      }
    }
    const c = new ThisChecker() as ThisChecker & { html: () => unknown };
    c.custom(MimeType.HTML);
    const viaDirect = c.seenThis;
    c.seenThis = undefined;
    c.html();
    expect(c.seenThis).toBe(viaDirect);
  });

  it("is not assimilated by Promise.resolve (no synthesized `then`)", async () => {
    const c = new TestCollector();
    const resolved = await Promise.resolve(c);
    expect(resolved).toBe(c);
  });

  it("JSON.stringify does not trip the unknown-format thrower (toJSON is inert)", () => {
    const c = new TestCollector();
    expect(() => JSON.stringify(c)).not.toThrow();
  });

  it("util.inspect / logging does not trip the unknown-format thrower", () => {
    const c = new TestCollector();
    expect((c as unknown as { inspect?: unknown }).inspect).toBeUndefined();
    expect("inspect" in c).toBe(false);
  });

  it("`has` returns false for reserved keys even when a MIME type collides", () => {
    const c = new TestCollector();
    MimeType.register("application/then", "then");
    try {
      expect("then" in c).toBe(false);
      expect((c as unknown as { then?: unknown }).then).toBeUndefined();
    } finally {
      MimeType.unregister("then");
    }
  });

  it("shadows real properties even when they hold undefined", () => {
    class WithUndef extends Collector {
      myFlag: string | undefined = undefined;
      custom(_mime: MimeType): unknown {
        return null;
      }
    }
    const c = new WithUndef();
    expect(c.myFlag).toBeUndefined();
  });

  it("has() responds true for both real props and registered MIME symbols", () => {
    const c = new TestCollector();
    expect("custom" in c).toBe(true);
    expect("html" in c).toBe(true);
    expect("bogusFormatXyz" in c).toBe(false);
  });
});

describe("generateMethodForMime", () => {
  it("accepts a registered MIME symbol without throwing", () => {
    expect(() => generateMethodForMime("html")).not.toThrow();
  });

  it("accepts a MimeType instance without throwing", () => {
    const mime = MimeType.lookup("json")!;
    expect(() => generateMethodForMime(mime)).not.toThrow();
  });

  it("throws for an unregistered MIME symbol", () => {
    expect(() => generateMethodForMime("bogusFormatXyz")).toThrow(/unknown MIME "bogusFormatXyz"/);
  });
});
