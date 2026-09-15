import { beforeEach, describe, expect, it, vi } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { Deprecation } from "../deprecation.js";
import { assertNotPredicate, assertPredicate } from "../testing/assertions.js";
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
    expect(deprecators.each()).toBeInstanceOf(
      (globalThis as unknown as { Iterator: abstract new () => unknown }).Iterator,
    );
    expect(Array.from(deprecators.each(), (deprecator) => deprecator.gemName).sort()).toEqual(
      [...deprecatorNames].sort(),
    );
  });

  it("#silenced= applies to each deprecator", () => {
    deprecators.each((deprecator) => assertNotPredicate(deprecator, (d) => d.silenced));

    deprecators.setSilenced(true);
    deprecators.each((deprecator) => assertPredicate(deprecator, (d) => d.silenced));

    deprecators.setSilenced(false);
    deprecators.each((deprecator) => assertNotPredicate(deprecator, (d) => d.silenced));
  });

  it("#debug= applies to each deprecator", () => {
    deprecators.each((deprecator) => assertNotPredicate(deprecator, (d) => d.debug));

    deprecators.setDebug(true);
    deprecators.each((deprecator) => assertPredicate(deprecator, (d) => d.debug));

    deprecators.setDebug(false);
    deprecators.each((deprecator) => assertNotPredicate(deprecator, (d) => d.debug));
  });

  it("#behavior= applies to each deprecator", () => {
    const callback = (): void => {};

    deprecators.setBehavior(callback);
    deprecators.each((deprecator) => expect(deprecator.behavior).toEqual([callback]));
  });

  it("#disallowed_behavior= applies to each deprecator", () => {
    const callback = (): void => {};

    deprecators.setDisallowedBehavior(callback);
    deprecators.each((deprecator) => expect(deprecator.disallowedBehavior).toEqual([callback]));
  });

  it("#disallowed_warnings= applies to each deprecator", () => {
    deprecators.setDisallowedWarnings(":all");
    deprecators.each((deprecator) => expect(deprecator.disallowedWarnings).toEqual(":all"));
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
    deprecators.silence(() => {
      deprecators.each((deprecator) => assertSilencing(deprecator, true));

      new Thread(() => {
        deprecators.each((deprecator) => assertSilencing(deprecator, false));

        deprecators.silence(() => {
          deprecators.each((deprecator) => assertSilencing(deprecator, true));
        });

        deprecators.each((deprecator) => assertSilencing(deprecator, false));
      }).value();

      deprecators.each((deprecator) => assertSilencing(deprecator, true));
    });
  });
});
