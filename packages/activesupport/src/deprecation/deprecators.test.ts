/**
 * Mirrors Rails activesupport/test/deprecation/deprecators_test.rb
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Deprecation } from "../deprecation.js";
import { Deprecators } from "./deprecators.js";

describe("DeprecationTest", () => {
  const deprecatorNames = ["fubar", "foo", "bar"];
  let deprecators: Deprecators;

  beforeEach(() => {
    deprecators = new Deprecators();
    for (const name of deprecatorNames) {
      deprecators.set(name, new Deprecation("2.0", name));
    }
  });

  // Rails' assert_deprecated / assert_not_deprecated over `deprecator.warn`:
  // a silenced deprecator emits nothing to stderr.
  function assertSilencing(deprecator: Deprecation, silencing: boolean): void {
    const behaviorWas = deprecator.behavior;
    const emitted = vi.fn();
    deprecator.behavior = emitted;
    try {
      deprecator.warn("deprecated!");
      expect(emitted).toHaveBeenCalledTimes(silencing ? 0 : 1);
    } finally {
      deprecator.behavior = behaviorWas;
    }
  }

  it("#[] gets an individual deprecator", () => {
    for (const name of deprecatorNames) {
      expect(deprecators.get(name)!.gemName).toBe(name);
    }
  });

  it("#each iterates over each deprecator", () => {
    const gemNames: (string | undefined)[] = [];
    deprecators.each((deprecator) => gemNames.push(deprecator.gemName));

    expect(gemNames.sort()).toEqual([...deprecatorNames].sort());
  });

  it("#each without block returns an Enumerator", () => {
    // JS has no Enumerator; `each` always takes a block. Its iteration order
    // and membership are what the Rails assertion checks.
    const gemNames: (string | undefined)[] = [];
    deprecators.each((deprecator) => gemNames.push(deprecator.gemName));
    expect(gemNames.sort()).toEqual([...deprecatorNames].sort());
  });

  it("#silenced= applies to each deprecator", () => {
    deprecators.each((deprecator) => expect(deprecator.silenced).toBe(false));

    deprecators.setSilenced(true);
    deprecators.each((deprecator) => expect(deprecator.silenced).toBe(true));

    deprecators.setSilenced(false);
    deprecators.each((deprecator) => expect(deprecator.silenced).toBe(false));
  });

  it("#debug= applies to each deprecator", () => {
    deprecators.each((deprecator) => expect(deprecator.debug).toBe(false));

    deprecators.setDebug(true);
    deprecators.each((deprecator) => expect(deprecator.debug).toBe(true));

    deprecators.setDebug(false);
    deprecators.each((deprecator) => expect(deprecator.debug).toBe(false));
  });

  it("#behavior= applies to each deprecator", () => {
    const callback = (): void => {};

    deprecators.setBehavior(callback);
    deprecators.each((deprecator) => expect(deprecator.behavior).toBe(callback));
  });

  it("#disallowed_behavior= applies to each deprecator", () => {
    const callback = (): void => {};

    deprecators.setDisallowedBehavior(callback);
    deprecators.each((deprecator) => expect(deprecator.disallowedBehavior).toBe(callback));
  });

  it("#disallowed_warnings= applies to each deprecator", () => {
    deprecators.setDisallowedWarnings(["all"]);
    deprecators.each((deprecator) => expect(deprecator.disallowedWarnings).toEqual(["all"]));
  });

  it("#silence silences each deprecator", () => {
    deprecators.each((deprecator) => assertSilencing(deprecator, false));

    deprecators.silence(() => {
      deprecators.each((deprecator) => assertSilencing(deprecator, true));
    });

    deprecators.each((deprecator) => assertSilencing(deprecator, false));
  });

  it("#silence returns the result of the block", () => {
    expect(deprecators.silence(() => 123)).toBe(123);
  });

  it("#silence ensures silencing is reverted after an error is raised", () => {
    expect(() =>
      deprecators.silence(() => {
        throw new Error("oops");
      }),
    ).toThrow("oops");

    deprecators.each((deprecator) => assertSilencing(deprecator, false));
  });

  it("#silence blocks can be nested", () => {
    deprecators.each((deprecator) => assertSilencing(deprecator, false));

    deprecators.silence(() => {
      deprecators.each((deprecator) => assertSilencing(deprecator, true));

      deprecators.silence(() => {
        deprecators.each((deprecator) => assertSilencing(deprecator, true));
      });

      deprecators.each((deprecator) => assertSilencing(deprecator, true));
    });

    deprecators.each((deprecator) => assertSilencing(deprecator, false));
  });

  it("#silence only affects the current thread", () => {
    // JS has no threads; the silence counter is per-instance, so the
    // observable half of the Rails test is that silencing is scoped to the
    // block and reverted after it.
    deprecators.silence(() => {
      deprecators.each((deprecator) => assertSilencing(deprecator, true));
    });

    deprecators.each((deprecator) => assertSilencing(deprecator, false));
  });
});
