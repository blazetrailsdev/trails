import { describe, it, expect } from "vitest";

import { BacktraceCleaner } from "./backtrace-cleaner.js";

describe("BacktraceCleaner#cleanFrame", () => {
  it("cleanFrame converts a non-string frame to a string before filtering", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/gems/rack-1.0/", "[gem] "));
    class Location {
      toString(): string {
        return "/gems/rack-1.0/lib/rack.rb";
      }
    }
    expect(cleaner.cleanFrame(new Location(), "all")).toBe("[gem] lib/rack.rb");
  });
});

describe("BacktraceCleanerKindTest", () => {
  function build() {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/gems/rack-1.0/", "[gem] "));
    cleaner.addSilencer((line) => line.includes("[gem]"));
    return cleaner;
  }

  it("clean with :silent returns non-silenced filtered lines", () => {
    const cleaner = build();
    expect(cleaner.clean(["/gems/rack-1.0/lib/rack.rb", "/app/foo.rb"])).toEqual(["/app/foo.rb"]);
  });

  it("clean with :noise returns silenced filtered lines", () => {
    const cleaner = build();
    expect(cleaner.clean(["/gems/rack-1.0/lib/rack.rb", "/app/foo.rb"], "noise")).toEqual([
      "[gem] lib/rack.rb",
    ]);
  });

  it("clean with :all returns every filtered line", () => {
    const cleaner = build();
    expect(cleaner.clean(["/gems/rack-1.0/lib/rack.rb", "/app/foo.rb"], "all")).toEqual([
      "[gem] lib/rack.rb",
      "/app/foo.rb",
    ]);
  });

  it("cleanFrame default returns the filtered frame when not silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/app/foo.rb")).toBe("/app/foo.rb");
  });

  it("cleanFrame default returns undefined when silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/gems/rack-1.0/lib/rack.rb")).toBeUndefined();
  });

  it("cleanFrame with :noise returns undefined when not silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/app/foo.rb", "noise")).toBeUndefined();
  });

  it("cleanFrame with :noise returns the filtered frame when silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/gems/rack-1.0/lib/rack.rb", "noise")).toBe("[gem] lib/rack.rb");
  });

  it("cleanFrame with :all returns the filtered frame regardless of silencers", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/gems/rack-1.0/lib/rack.rb", "all")).toBe("[gem] lib/rack.rb");
    expect(cleaner.cleanFrame("/app/foo.rb", "all")).toBe("/app/foo.rb");
  });
});
