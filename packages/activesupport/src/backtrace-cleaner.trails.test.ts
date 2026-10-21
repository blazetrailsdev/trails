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
