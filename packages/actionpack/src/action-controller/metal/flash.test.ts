import { describe, it, expect } from "vitest";
import { FlashTypeRegistry } from "./flash.js";

describe("FlashTypeRegistry", () => {
  describe("actionMethods", () => {
    it("filters flash type names out of the action methods set", () => {
      const registry = new FlashTypeRegistry();
      const methods = new Set(["index", "show", "alert", "notice", "create"]);
      const result = registry.actionMethods(methods);
      expect(result.has("alert")).toBe(false);
      expect(result.has("notice")).toBe(false);
      expect(result.has("index")).toBe(true);
      expect(result.has("show")).toBe(true);
      expect(result.has("create")).toBe(true);
    });

    it("removes custom flash types added via addFlashTypes", () => {
      const registry = new FlashTypeRegistry();
      registry.addFlashTypes("error", "success");
      const methods = new Set(["index", "show", "error", "success"]);
      const result = registry.actionMethods(methods);
      expect(result.has("error")).toBe(false);
      expect(result.has("success")).toBe(false);
      expect(result.has("index")).toBe(true);
    });

    it("does not mutate the input set", () => {
      const registry = new FlashTypeRegistry();
      const methods = new Set(["index", "alert"]);
      registry.actionMethods(methods);
      expect(methods.has("alert")).toBe(true);
    });

    it("returns full set when no flash types match", () => {
      const registry = new FlashTypeRegistry();
      const methods = new Set(["index", "show", "create"]);
      const result = registry.actionMethods(methods);
      expect(result.size).toBe(3);
    });
  });

  describe("extractFlashFromOptions", () => {
    it("extracts known flash types from options", () => {
      const registry = new FlashTypeRegistry();
      const flash: Record<string, unknown> = {};
      const remaining = registry.extractFlashFromOptions(flash, { alert: "Saved!", other: "x" });
      expect(flash).toEqual({ alert: "Saved!" });
      expect(remaining).toEqual({ other: "x" });
    });

    it("extracts nested flash hash", () => {
      const registry = new FlashTypeRegistry();
      const flash: Record<string, unknown> = {};
      const remaining = registry.extractFlashFromOptions(flash, {
        flash: { info: "Hello" },
        keep: "y",
      });
      expect(flash).toEqual({ info: "Hello" });
      expect(remaining).toEqual({ keep: "y" });
    });
  });
});
