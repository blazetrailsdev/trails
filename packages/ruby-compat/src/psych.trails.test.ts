import { beforeEach, describe, it, expect, vi } from "vitest";
import type { ArgumentError as ArgumentErrorClass } from "./argument-error.js";
import type { Psych as PsychModule } from "./psych.js";

describe("Psych with Date, DateTime and Time unseated", () => {
  let Psych: typeof PsychModule;
  let ArgumentError: typeof ArgumentErrorClass;

  // `ClassLoader::CACHE` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/class_loader.rb:58-65`)
  beforeEach(async () => {
    vi.resetModules();
    ({ Psych } = await import("./psych.js"));
    ({ ArgumentError } = await import("./argument-error.js"));
  });

  it("keeps a date-shaped or time-shaped scalar a String", () => {
    expect(Psych.unsafeLoad("--- 2024-01-02")).toBe("2024-01-02");
    expect(Psych.unsafeLoad("--- 2024-01-02 03:04:05 Z")).toBe("2024-01-02 03:04:05 Z");
  });

  it("raises ArgumentError for a !ruby/object:DateTime scalar", () => {
    const load = () => Psych.unsafeLoad("--- !ruby/object:DateTime 2024-01-02 03:04:05 Z");
    expect(load).toThrow(ArgumentError);
    expect(load).toThrow("undefined class/module DateTime");
  });

  it("round-trips plain data", () => {
    const yaml = Psych.dump({ a: [1, "x", null] });
    expect(Psych.unsafeLoad(yaml)).toEqual({ a: [1, "x", null] });
  });
});
