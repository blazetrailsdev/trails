import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Deprecation } from "@blazetrails/activesupport";
import { deprecator, addRenderer, removeRenderer } from "./deprecator.js";
import { Renderers } from "./metal/renderers.js";

describe("ActionController.deprecator", () => {
  it("returns a Deprecation instance", () => {
    expect(deprecator()).toBeInstanceOf(Deprecation);
  });

  it("memoizes and shares the AbstractController deprecator", () => {
    expect(deprecator()).toBe(deprecator());
  });
});

describe("ActionController.addRenderer / removeRenderer", () => {
  const KEY = "test-shim-format";
  beforeEach(() => {
    Renderers.remove(KEY);
  });
  afterEach(() => {
    Renderers.remove(KEY);
  });

  it("addRenderer registers via Renderers.add", () => {
    const block = (value: unknown) => String(value);
    addRenderer(KEY, block);
    expect(Renderers.RENDERERS.has(KEY)).toBe(true);
    expect(Renderers.get(KEY)).toBe(block);
  });

  it("removeRenderer deregisters via Renderers.remove", () => {
    addRenderer(KEY, () => "");
    removeRenderer(KEY);
    expect(Renderers.RENDERERS.has(KEY)).toBe(false);
    expect(Renderers.get(KEY)).toBeUndefined();
  });
});
