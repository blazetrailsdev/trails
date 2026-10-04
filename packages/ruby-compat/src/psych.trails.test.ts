import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Psych } from "./psych.js";
import { registerConstant, registeredConstant, unregisterConstant } from "./variable.js";

describe("Psych with Date, DateTime and Time unseated", () => {
  const seats = new Map<string, unknown>();

  beforeEach(() => {
    for (const name of ["Date", "DateTime", "Time"]) {
      seats.set(name, registeredConstant(name));
      unregisterConstant(name, seats.get(name));
    }
  });

  afterEach(() => {
    for (const [name, klass] of seats) if (klass !== undefined) registerConstant(name, klass);
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
