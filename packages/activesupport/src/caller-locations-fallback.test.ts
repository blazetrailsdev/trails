import { afterEach, describe, expect, it } from "vitest";
import { callerLocations } from "./deprecation.js";
import { Delegation } from "./delegation.js";

/**
 * `callerLocations` parses `new Error().stack` after installing an
 * `Error.prepareStackTrace` hook. Both are V8 internals. A runtime can be a
 * valid Node target and provide neither — perry accepts the hook assignment
 * without ever invoking it and emits frames as a bare `at <anonymous>` with no
 * file, line or column.
 *
 * These tests reproduce that stack shape on Node, so the fallback is covered
 * here rather than only on the other runtime.
 */
describe("callerLocations on a runtime with no V8 stack positions", () => {
  const realStack = Object.getOwnPropertyDescriptor(Error.prototype, "stack");

  afterEach(() => {
    if (realStack) Object.defineProperty(Error.prototype, "stack", realStack);
    else delete (Error.prototype as { stack?: unknown }).stack;
  });

  /** Exactly what perry produces: a message line plus one position-less frame. */
  function installPositionlessStack(): void {
    Object.defineProperty(Error.prototype, "stack", {
      configurable: true,
      get: () => "Error: x\n    at <anonymous>",
    });
  }

  it("still returns a usable location when no frame carries a position", () => {
    installPositionlessStack();
    const locations = callerLocations(1, 1);
    expect(locations).toHaveLength(1);
    // The defect being fixed: this was `undefined`, so `.path` threw.
    expect(locations[0]).toBeDefined();
    expect(typeof locations[0].path).toBe("string");
    expect(typeof locations[0].lineno).toBe("number");
  });

  it("lets a top-level `delegate` initialise instead of throwing on `.path`", () => {
    installPositionlessStack();
    class Target {
      greeter = { hello: () => "hi" };
    }
    // Delegation.generate reads `callerLocations(1, 1)[0].path`; before the
    // fallback this threw "Cannot read properties of undefined (reading 'path')"
    // and took module initialisation down with it.
    expect(() => Delegation.generate(Target.prototype, ["hello"], { to: "greeter" })).not.toThrow();
  });

  it("is not used when the V8 path works, so Node behaviour is unchanged", () => {
    // `start` counts from the caller's caller, so this names vitest's runner
    // rather than this file — the point is that the V8 path yields a REAL
    // position, which the fallback cannot.
    const locations = callerLocations(1, 1);
    expect(locations).toHaveLength(1);
    expect(locations[0].path).not.toBe("");
    expect(locations[0].path).toMatch(/\.(ts|js|mjs|cjs)$/);
    expect(locations[0].lineno).toBeGreaterThan(0);
    expect(locations[0].callSite).toBeDefined();
  });

  it("start counts from the caller's caller", () => {
    // Guards the index base the fallback has to match: `sites[1 + start + i]`.
    const direct = callerLocations(0, 1);
    expect(direct[0].path).toMatch(/caller-locations-fallback\.test\.ts$/);
  });
});
