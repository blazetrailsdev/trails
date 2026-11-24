import { afterEach, describe, expect, it } from "vitest";
import { callerLocations } from "../lib/deprecation.js";
import { Delegation } from "../lib/delegation.js";

describe("callerLocations on a runtime with no V8 stack positions", () => {
  const realStack = Object.getOwnPropertyDescriptor(Error.prototype, "stack");

  afterEach(() => {
    if (realStack) Object.defineProperty(Error.prototype, "stack", realStack);
    else delete (Error.prototype as { stack?: unknown }).stack;
  });

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
    expect(locations[0]).toBeDefined();
    expect(typeof locations[0].path).toBe("string");
    expect(typeof locations[0].lineno).toBe("number");
  });

  it("lets a top-level `delegate` initialise instead of throwing on `.path`", () => {
    installPositionlessStack();
    class Target {
      greeter = { hello: () => "hi" };
    }
    expect(() => Delegation.generate(Target.prototype, ["hello"], { to: "greeter" })).not.toThrow();
  });

  it("is not used when the V8 path works, so Node behaviour is unchanged", () => {
    const locations = callerLocations(1, 1);
    expect(locations).toHaveLength(1);
    expect(locations[0].path).not.toBe("");
    expect(locations[0].path).toMatch(/\.(ts|js|mjs|cjs)$/);
    expect(locations[0].lineno).toBeGreaterThan(0);
    expect(locations[0].callSite).toBeDefined();
  });

  it("names the same frame as the V8 path", () => {
    const viaV8 = callerLocations(0, 1)[0];
    installPositionlessStack();
    const viaCallSites = callerLocations(0, 1)[0];
    expect(viaCallSites.path).toBe(viaV8.path);
  });

  it("start counts from the caller's caller", () => {
    const direct = callerLocations(0, 1);
    expect(direct[0].path).toMatch(/caller-locations-fallback\.trails\.test\.ts$/);
  });

  it("parses a SpiderMonkey / JavaScriptCore stack", () => {
    const RealError = Error;
    globalThis.Error = class extends RealError {
      constructor() {
        super();
        Object.defineProperty(this, "stack", {
          value:
            "callerLocations@https://x.test/a.js:1:1\n" +
            "delegate@https://x.test/b.js:2:3\n" +
            "@https://x.test/models/post.js:7:5\n" +
            "load@https://x.test/app.js:12\n",
        });
      }
    } as ErrorConstructor;
    let locations: ReturnType<typeof callerLocations>;
    try {
      locations = callerLocations(1, 2);
    } finally {
      globalThis.Error = RealError;
    }
    expect(locations).toHaveLength(2);
    expect(locations[0].path).toBe("https://x.test/models/post.js");
    expect(locations[0].lineno).toBe(7);
    expect(locations[0].label).toBe("");
    expect(locations[1].path).toBe("https://x.test/app.js");
    expect(locations[1].lineno).toBe(12);
    expect(locations[1].label).toBe("load");
  });
});
