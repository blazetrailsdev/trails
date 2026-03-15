import { describe, expect, it } from "vitest";
import { defineCallbacks, runCallbacks, setCallback, skipCallback } from "./callbacks.js";

describe("BasicCallbacksTest", () => {
  it("basic conditional callback1", () => {
    const target = { log: [] as string[], condition: true };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("before"), {
      if: (t: any) => t.condition,
    });
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["before", "action"]);
  });

  it("basic conditional callback2", () => {
    const target = { log: [] as string[], condition: false };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("before"), {
      if: (t: any) => t.condition,
    });
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["action"]);
  });

  it("basic conditional callback3", () => {
    const target = { log: [] as string[], condition: true };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("before"), {
      unless: (t: any) => t.condition,
    });
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["action"]);
  });
});

describe("InheritedCallbacksTest", () => {
  it("inherited excluded", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    const cb = (t: any) => t.log.push("base_cb");
    setCallback(target, "save", "before", cb);
    skipCallback(target, "save", "before", cb);
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["action"]);
  });

  it("inherited not excluded", () => {
    const base = { log: [] as string[] };
    defineCallbacks(base, "save");
    setCallback(base, "save", "before", (t: any) => t.log.push("base_cb"));

    const child = Object.create(base);
    child.log = [];
    runCallbacks(child, "save", () => child.log.push("action"));
    expect(child.log).toContain("action");
  });

  it("partially excluded", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("cb1"));
    setCallback(target, "save", "before", (t: any) => t.log.push("cb2"));
    skipCallback(target, "save", "before");
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toContain("action");
  });
});

describe("InheritedCallbacksTest2", () => {
  it("complex mix on", () => {
    const target = { log: [] as string[], enabled: true };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("cb"), {
      if: (t: any) => t.enabled,
    });
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["cb", "action"]);
  });

  it("complex mix off", () => {
    const target = { log: [] as string[], enabled: false };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("cb"), {
      if: (t: any) => t.enabled,
    });
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["action"]);
  });
});

describe("DynamicInheritedCallbacks", () => {
  it("callbacks looks to the superclass before running", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("parent_cb"));
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["parent_cb", "action"]);
  });

  it("callbacks should be performed once in child class", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", (t: any) => t.log.push("cb"));
    runCallbacks(target, "save");
    expect(target.log).toEqual(["cb"]);
  });
});

describe("DynamicDefinedCallbacks", () => {
  it("callbacks should be performed once in child class after dynamic define", () => {
    const target = { log: [] as string[] };
    defineCallbacks(target, "save");
    runCallbacks(target, "save", () => target.log.push("action"));
    setCallback(target, "save", "before", (t: any) => t.log.push("dynamic_cb"));
    target.log = [];
    runCallbacks(target, "save", () => target.log.push("action"));
    expect(target.log).toEqual(["dynamic_cb", "action"]);
  });
});
