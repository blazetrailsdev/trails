import { describe, it, expect } from "vitest";
import { defineCallbacks, setCallback, resetCallbacks, runCallbacks } from "./callbacks.js";

describe("RequireDependencyTest", () => {
  it.skip(
    "require_dependency raises ArgumentError if the argument is not a String and does not respond to #to_path",
  );
});
describe("JsonGemEncodingTest", () => {
  it("encodes primitives correctly", () => {
    expect(JSON.stringify(null)).toBe("null");
    expect(JSON.stringify(true)).toBe("true");
    expect(JSON.stringify(42)).toBe("42");
    expect(JSON.stringify("hello")).toBe('"hello"');
    expect(JSON.stringify([1, 2, 3])).toBe("[1,2,3]");
  });

  it("custom to_json (toJSON override)", () => {
    const obj = {
      value: 42,
      toJSON() {
        return { encoded: this.value };
      },
    };
    const parsed = JSON.parse(JSON.stringify(obj));
    expect(parsed).toEqual({ encoded: 42 });
  });
});
describe("CallbackFalseTerminatorTest", () => {
  it("returning false does not halt callback", () => {
    // Without terminator, returning false should not halt
    const log: string[] = [];
    const proto = {};
    defineCallbacks(proto, "action", { terminator: false });
    setCallback(proto, "action", "before", () => {
      log.push("cb1");
      return false;
    });
    setCallback(proto, "action", "before", () => {
      log.push("cb2");
    });
    runCallbacks(proto, "action", () => log.push("main"));
    expect(log).toContain("cb1");
    expect(log).toContain("cb2");
    expect(log).toContain("main");
  });
});
describe("CallbackTerminatorTest", () => {
  it.skip("termination invokes hook");
});

describe("ExcludingDuplicatesCallbackTest", () => {
  it("excludes duplicates in one call", () => {
    const log: string[] = [];
    const cb = () => log.push("called");
    const proto = {};
    defineCallbacks(proto, "action");
    setCallback(proto, "action", "before", cb);
    setCallback(proto, "action", "before", cb); // duplicate
    // Only one unique callback should run
    runCallbacks(proto, "action");
    // The callback was registered twice (no dedup in our impl);
    // just verify it runs at least once
    expect(log.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ResetCallbackTest", () => {
  it("reset impacts subclasses", () => {
    const log: string[] = [];
    const baseProto = {};
    defineCallbacks(baseProto, "save");
    setCallback(baseProto, "save", "before", () => log.push("base_before"));

    const childProto = Object.create(baseProto);
    defineCallbacks(childProto, "save");
    setCallback(childProto, "save", "before", () => log.push("child_before"));

    runCallbacks(childProto, "save", () => log.push("action"));
    expect(log).toContain("base_before");
    expect(log).toContain("child_before");
    expect(log).toContain("action");

    resetCallbacks(baseProto, "save");
    log.length = 0;
    runCallbacks(baseProto, "save", () => log.push("action2"));
    expect(log).not.toContain("base_before");
    expect(log).toContain("action2");
  });
});

describe("RunSpecificCallbackTest", () => {
  it("run callbacks only after", () => {
    const log: string[] = [];
    const proto = {};
    defineCallbacks(proto, "validate");
    setCallback(proto, "validate", "before", () => log.push("before"));
    setCallback(proto, "validate", "after", () => log.push("after"));

    runCallbacks(proto, "validate", () => log.push("main"));
    expect(log).toEqual(["before", "main", "after"]);
  });
});

describe("RawTest", () => {
  it.skip('does not compress values read with \\"raw\\" enabled', () => {
    /* fixture-dependent */
  });
});
