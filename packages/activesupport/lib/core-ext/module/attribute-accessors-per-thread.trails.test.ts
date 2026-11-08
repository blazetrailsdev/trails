import { describe, expect, it } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { threadMattrAccessor } from "./attribute-accessors-per-thread.js";

describe("thread_mattr_accessor on a namespace object", () => {
  it("defines the module half on a receiver with no prototype", () => {
    const mod: Record<string, unknown> = {};
    threadMattrAccessor.call(mod, "stack");

    expect(mod.stack).toBeNull();
    mod.stack = [1];
    expect(mod.stack).toEqual([1]);
  });

  it("keeps the value per thread", () => {
    const mod: Record<string, unknown> = {};
    threadMattrAccessor.call(mod, "stack");
    mod.stack = [1];

    new Thread(() => {
      expect(mod.stack).toBeNull();
    }).value();

    expect(mod.stack).toEqual([1]);
  });

  it("answers the default on a receiver with no prototype", () => {
    const mod: Record<string, unknown> = {};
    threadMattrAccessor.call(mod, "stack", { default: [] });

    expect(mod.stack).toEqual([]);
  });
});
