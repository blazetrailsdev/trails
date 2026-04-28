import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  applyPermissionsPolicy,
  buildPermissionsPolicy,
  permissionsPolicy,
  type PermissionsPolicyBlock,
} from "./permissions-policy.js";
import type { CallbackOptions } from "../abstract-controller.js";

describe("applyPermissionsPolicy", () => {
  it("removes existing header when policy is false", () => {
    const headers: Record<string, string> = { "permissions-policy": "geolocation=(self)" };
    applyPermissionsPolicy(headers, false);
    expect(headers["permissions-policy"]).toBeUndefined();
  });

  it("sets the header when policy is a string", () => {
    const headers: Record<string, string> = {};
    applyPermissionsPolicy(headers, "geolocation=(self)");
    expect(headers["permissions-policy"]).toBe("geolocation=(self)");
  });
});

describe("buildPermissionsPolicy", () => {
  it("formats string values as parenthesized lists", () => {
    expect(buildPermissionsPolicy({ geolocation: "self" })).toBe("geolocation=(self)");
  });

  it("space-joins array values", () => {
    expect(buildPermissionsPolicy({ camera: ["self", '"https://x.test"'] })).toBe(
      'camera=(self "https://x.test")',
    );
  });

  it("comma-joins multiple directives", () => {
    expect(buildPermissionsPolicy({ geolocation: "self", camera: "none" })).toBe(
      "geolocation=(self), camera=(none)",
    );
  });
});

describe("permissionsPolicy class DSL", () => {
  type Registration = {
    callback: (controller: unknown) => void | boolean;
    options?: CallbackOptions;
  };

  let registered: Registration[];
  let host: {
    beforeAction: (
      callback: (controller: unknown) => void | boolean,
      options?: CallbackOptions,
    ) => void;
  };

  beforeEach(() => {
    registered = [];
    host = {
      beforeAction(callback, options) {
        registered.push({ callback, options });
      },
    };
  });

  it("registers a no-op before_action when no block is provided (matches Rails)", () => {
    permissionsPolicy.call(host, { only: ["show"] });
    expect(registered).toHaveLength(1);
    expect(registered[0].options).toEqual({ only: ["show"] });
    expect(() => registered[0].callback({})).not.toThrow();
  });

  it("registers a before_action that runs the block on each request", () => {
    const block: PermissionsPolicyBlock = (directives) => {
      directives.geolocation = "self";
    };
    permissionsPolicy.call(host, { only: ["show"] }, block);

    expect(registered).toHaveLength(1);
    expect(registered[0].options).toEqual({ only: ["show"] });
  });

  it("invokes the block with controller as `this` (mirrors Rails instance_exec)", () => {
    const block = vi.fn(function (this: unknown, directives: Record<string, string | string[]>) {
      directives.camera = "self";
    });
    permissionsPolicy.call(host, {}, block as PermissionsPolicyBlock);
    const fakeController = { name: "PostsController" };
    registered[0].callback(fakeController);
    expect(block.mock.contexts[0]).toBe(fakeController);
  });

  it("calls the block with a fresh directives object on each callback invocation", () => {
    const seen: Array<Record<string, string | string[]>> = [];
    const block: PermissionsPolicyBlock = function (directives) {
      directives.geolocation = "self";
      seen.push(directives);
    };
    permissionsPolicy.call(host, {}, block);
    registered[0].callback({});
    registered[0].callback({});

    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[0]).toEqual({ geolocation: "self" });
  });

  it("respects only/except via beforeAction options", () => {
    permissionsPolicy.call(host, { except: ["index"] }, () => {});
    expect(registered[0].options).toEqual({ except: ["index"] });
  });
});
