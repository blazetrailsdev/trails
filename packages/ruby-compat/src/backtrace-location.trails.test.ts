import { describe, expect, it } from "vitest";
import { Location, excBacktraceLocations } from "./backtrace-location.js";

describe("Thread::Backtrace::Location", () => {
  it("reads the label, lineno and column of a V8 frame", () => {
    const loc = new Location(
      "    at Base._app_views_posts_show (eval at compile (x.js:1:2), <anonymous>:3:11)",
    );
    expect(loc.label).toBe("_app_views_posts_show");
    expect(loc.lineno).toBe(3);
    expect(loc.column).toBe(11);
    expect(loc.toS()).toBe(
      "at Base._app_views_posts_show (eval at compile (x.js:1:2), <anonymous>:3:11)",
    );
  });

  it("answers a nil label and a 0 lineno for a frame with neither", () => {
    const loc = new Location("    at <anonymous>");
    expect(loc.label).toBeNull();
    expect(loc.lineno).toBe(0);
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
