import { describe, expect, it } from "vitest";
import { TypeError } from "./type-error.js";
import { Thread, rbIterBreakValue } from "./thread.js";
import {
  Location,
  excBacktrace,
  excBacktraceLocations,
  excSetBacktrace,
} from "./backtrace-location.js";

describe("Thread::Backtrace::Location", () => {
  it("reads the label, lineno and column of a V8 frame", () => {
    const loc = new Location(
      "    at Base._app_views_posts_show (eval at compile (x.js:1:2), <anonymous>:3:11)",
    );
    expect(loc.label).toBe("_app_views_posts_show");
    expect(loc.lineno).toBe(3);
    expect(loc.column).toBe(11);
    expect(loc.path).toBe("(eval at compile (x.js:1:2))");
    expect(loc.toString()).toBe(
      "at Base._app_views_posts_show (eval at compile (x.js:1:2), <anonymous>:3:11)",
    );
  });

  it("answers a nil label and a 0 lineno for a frame with neither", () => {
    const loc = new Location("    at <anonymous>");
    expect(loc.label).toBeNull();
    expect(loc.lineno).toBe(0);
  });

  it("reads the path of a named and an anonymous V8 frame", () => {
    expect(new Location("    at foo (/app/a.js:1:2)").path).toBe("/app/a.js");
    expect(new Location("    at async /app/b.js:3:4").path).toBe("/app/b.js");
    expect(new Location("    at file:///app/c.mjs:5:6").path).toBe("file:///app/c.mjs");
    expect(new Location("    at page (webpack-internal:///(app-pages)/x.js:7:8)").path).toBe(
      "webpack-internal:///(app-pages)/x.js",
    );
    expect(new Location("    at new Foo (/app/d.js:9:1)").path).toBe("/app/d.js");
    expect(new Location("    at eval (eval at compile (x.js:1:2), <anonymous>:3:11)").path).toBe(
      "(eval at compile (x.js:1:2))",
    );
    expect(new Location("    at <anonymous>").path).toBe("<anonymous>");
    expect(new Location("    at new Promise (<anonymous>)").path).toBe("<anonymous>");
  });
});

describe("Exception#backtrace_locations", () => {
  it("answers one Location per frame, skipping a multi-line message", () => {
    const exc = new Error("first\nsecond");
    exc.stack = "Error: first\nsecond\n    at foo (a.js:1:2)\n    at bar (b.js:3:4)";
    expect(excBacktraceLocations(exc)!.map((loc) => [loc.label, loc.lineno])).toEqual([
      ["foo", 1],
      ["bar", 3],
    ]);
  });

  it("answers nil for an exception with no backtrace", () => {
    const exc = new Error("x");
    exc.stack = undefined;
    expect(excBacktraceLocations(exc)).toBeNull();
  });
});

describe("Exception#backtrace", () => {
  it("answers one String per frame, or nil with no backtrace", () => {
    const exc = new Error("x");
    exc.stack = "Error: x\n    at foo (/a/b.ts:3:5)\n    at /a/c.ts:7:1";
    expect(excBacktrace(exc)).toEqual(excBacktraceLocations(exc)!.map(String));
    expect(excBacktrace(exc)).toHaveLength(2);
    exc.stack = undefined;
    expect(excBacktrace(exc)).toBeNull();
  });
});

describe("Exception#set_backtrace", () => {
  it("replaces the frames and keeps the message line", () => {
    const exc = new Error("boom");
    excSetBacktrace(exc, ["at foo (a.js:1:2)", "at bar (b.js:3:4)"]);
    expect(exc.stack).toBe("Error: boom\n    at foo (a.js:1:2)\n    at bar (b.js:3:4)");
    expect(excBacktraceLocations(exc)!.map((loc) => loc.label)).toEqual(["foo", "bar"]);
  });

  it("dispatches to an exception's own backtrace and backtraceLocations", () => {
    const locations = [new Location("    at foo (a.js:1:2)")];
    class Proxy extends Error {
      backtrace(): string[] {
        return ["proxied"];
      }
      backtraceLocations(): Location[] {
        return locations;
      }
    }
    const exc = new Proxy("boom");
    expect(excBacktrace(exc)).toEqual(["proxied"]);
    expect(excBacktraceLocations(exc)).toBe(locations);
  });
});

describe("Exception#set_backtrace", () => {
  it("stores nil, wraps a String and keeps an Array of Strings", () => {
    const exc = new Error("x");
    expect(excSetBacktrace(exc, null)).toBeNull();
    expect(excBacktrace(exc)).toBeNull();
    expect(excSetBacktrace(exc, "a:1")).toEqual(["a:1"]);
    expect(excBacktrace(exc)).toEqual(["a:1"]);
    expect(excSetBacktrace(exc, ["a", "b"])).toEqual(["a", "b"]);
    expect(excBacktrace(exc)).toEqual(["a", "b"]);
  });

  it("raises TypeError for anything but an Array of Strings", () => {
    const exc = new Error("x");
    expect(() => excSetBacktrace(exc, 1 as never)).toThrow(TypeError);
    expect(() => excSetBacktrace(exc, ["a", 1] as never)).toThrow(
      "backtrace must be Array of String",
    );
  });
});

describe("Thread.each_caller_location", () => {
  function inner(): string[] {
    const labels: string[] = [];
    Thread.eachCallerLocation((location) => {
      labels.push(String(location.label));
    });
    return labels;
  }
  function outer(): string[] {
    return inner();
  }

  it("yields from the caller of the calling method", () => {
    expect(outer()[0]).toBe("outer");
  });

  it("stops the walk at rbIterBreakValue and answers its value", () => {
    let seen = 0;
    const result = Thread.eachCallerLocation<number>(() => {
      seen += 1;
      rbIterBreakValue(5);
    });
    expect(result).toBe(5);
    expect(seen).toBe(1);
  });
});
