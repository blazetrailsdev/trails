/**
 * Smoke tests for ActionDispatch::DebugView. Full Rails-mirrored cases
 * (actionpack/test/dispatch/debug_exceptions_test.rb) follow up once
 * ActionView::Base is ported.
 */

import { describe, it, expect } from "vitest";
import { DebugView } from "./debug-view.js";
import { BadRequest } from "../../action-controller/metal/exceptions.js";

describe("DebugView", () => {
  it("RESCUES_TEMPLATE_PATHS resolves alongside the source file", () => {
    expect(DebugView.RESCUES_TEMPLATE_PATHS).toHaveLength(1);
    expect(DebugView.RESCUES_TEMPLATE_PATHS[0]).toMatch(/templates$/);
    expect(DebugView.RESCUES_TEMPLATE_PATHS[0]).toMatch(/^(file:|https?:)/);
  });

  describe("debugParams", () => {
    it("strips action and controller", () => {
      const view = new DebugView({});
      expect(view.debugParams({ action: "show", controller: "users", id: 1 })).toContain("id");
      expect(view.debugParams({ action: "show", controller: "users", id: 1 })).not.toContain(
        "action",
      );
    });

    it("returns 'None' when only action/controller present", () => {
      const view = new DebugView({});
      expect(view.debugParams({ action: "show", controller: "users" })).toBe("None");
    });
  });

  describe("debugHeaders", () => {
    it("returns 'None' for empty headers", () => {
      const view = new DebugView({});
      expect(view.debugHeaders({})).toBe("None");
      expect(view.debugHeaders(null)).toBe("None");
    });

    it("inspects and wraps commas with newlines", () => {
      const view = new DebugView({});
      const out = view.debugHeaders({ a: "1", b: "2" });
      expect(out).toContain("\n");
    });
  });

  describe("debugHash", () => {
    it("sorts keys and inspects values", () => {
      const view = new DebugView({});
      const out = view.debugHash({ b: 2, a: 1 });
      expect(out.indexOf("a:")).toBeLessThan(out.indexOf("b:"));
    });

    it("uses toHash() when available", () => {
      const view = new DebugView({});
      const out = view.debugHash({ toHash: () => ({ x: "y" }) });
      expect(out).toBe('x: "y"');
    });
  });

  it("protectAgainstForgery returns false", () => {
    expect(new DebugView({}).protectAgainstForgery()).toBe(false);
  });

  describe("paramsValid", () => {
    it("returns false when request parameter access throws BadRequest", () => {
      const view = new DebugView({
        request: {
          get parameters() {
            throw new BadRequest();
          },
        },
      });
      expect(view.paramsValid()).toBe(false);
    });

    it("returns true when parameters are accessible", () => {
      const view = new DebugView({ request: { parameters: { id: 1 } } });
      expect(view.paramsValid()).toBe(true);
    });
  });
});
