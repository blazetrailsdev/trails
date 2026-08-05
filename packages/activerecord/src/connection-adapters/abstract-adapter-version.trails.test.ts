import { describe, expect, it } from "vitest";
import { Version } from "./abstract-adapter.js";

// Rails has no test of its own for `AbstractAdapter::Version`'s state
// (abstract_adapter.rb:243-259); these pin the shape its callers depend on.
describe("AbstractAdapter::Version", () => {
  it("stringifies the parsed parts, not the string it was built from", () => {
    expect(new Version("8.0.31-log").toString()).toBe("8.0.31");
    expect(new Version("10.6.5-MariaDB").toString()).toBe("10.6.5");
    expect(new Version("5.7.22").toString()).toBe("5.7.22");
  });

  it("carries the full version string its caller passed", () => {
    const version = new Version("8.0.31", "8.0.31-log");
    expect(version.fullVersionString).toBe("8.0.31-log");
    expect(version.toString()).toBe("8.0.31");
  });

  it("has no full version string when the caller passed none", () => {
    expect(new Version("3.45.0").fullVersionString).toBeNull();
  });

  it("compares by parsed part, longer version winning a tie", () => {
    expect(new Version("8.0.31").compare("8.0.4")).toBe(1);
    expect(new Version("5.7.22").compare("5.7.22")).toBe(0);
    expect(new Version("10.2").compare("10.2.1")).toBe(-1);
  });
});
