import { NoMethodError, include, symbolToS } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Mime, MimeType } from "../action-dispatch/http/mime-type.js";
import { Collector } from "./collector.js";

class MyCollector {
  responses: [MimeType, unknown[], (() => unknown) | null][] = [];
  custom(mime: MimeType, ...args: unknown[]): unknown {
    const last = args[args.length - 1];
    const block = typeof last === "function" ? (last as () => unknown) : null;
    const positional = block ? args.slice(0, -1) : args;
    this.responses.push([mime, positional, block]);
    return undefined;
  }
}
include(MyCollector, Collector);

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
    Collector.removeMethod("js");
    try {
      const collector = new MyCollector() as MyCollector & { js: (...a: unknown[]) => unknown };
      expect("js" in collector).toBe(false);
      collector.js();
      expect("js" in collector).toBe(true);
    } finally {
      if (!Collector.isMethodDefined("js")) {
        Collector.generateMethodForMime(":js");
      }
    }
  });

  it("does not register unknown mime types", () => {
    const collector = new MyCollector() as MyCollector & { unknown: () => void };
    expect(() => collector.unknown()).toThrow(NoMethodError);
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

class TestCollector {
  readonly calls: [string, unknown[]][] = [];
  custom(mime: MimeType, ...args: unknown[]): unknown {
    this.calls.push([symbolToS(mime.symbol!), args]);
    return `dispatched:${symbolToS(mime.symbol!)}`;
  }
}
include(TestCollector, Collector);

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
    expect(Mime.get(":latefmt")).toBeUndefined();
    MimeType.register("application/latefmt", ":latefmt");
    try {
      expect(c.latefmt!("ok")).toBe("dispatched:latefmt");
    } finally {
      MimeType.unregister(":latefmt");
      Collector.removeMethod("latefmt");
    }
  });

  it("preserves real subclass properties and methods", () => {
    class WithState {
      counter = 0;
      bump(): number {
        return ++this.counter;
      }
      custom(_mime: MimeType): unknown {
        return null;
      }
    }
    include(WithState, Collector);
    const c = new WithState();
    expect(c.bump()).toBe(1);
    expect(c.bump()).toBe(2);
    expect(c.counter).toBe(2);
  });

  it("binds `this` inside custom() to the Proxy receiver, not the raw target", () => {
    class ThisChecker {
      seenThis: unknown;
      custom(_mime: MimeType): unknown {
        this.seenThis = this;
        return null;
      }
    }
    include(ThisChecker, Collector);
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

  it("shadows real properties even when they hold undefined", () => {
    class WithUndef {
      myFlag: string | undefined = undefined;
      custom(_mime: MimeType): unknown {
        return null;
      }
    }
    include(WithUndef, Collector);
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
  it("defines the method for a MIME symbol", () => {
    Collector.removeMethod("html");
    Collector.generateMethodForMime(":html");
    expect(Collector.isMethodDefined("html")).toBe(true);
  });

  it("defines the method for a MimeType instance", () => {
    Collector.removeMethod("json");
    Collector.generateMethodForMime(Mime.get(":json")!);
    expect(Collector.isMethodDefined("json")).toBe(true);
  });

  it("camelizes a multi-word MIME symbol", () => {
    expect(Collector.isMethodDefined("urlEncodedForm")).toBe(true);
  });
});
