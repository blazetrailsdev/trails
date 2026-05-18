import { describe, it, expect, beforeEach } from "vitest";
import {
  contentSecurityPolicy,
  contentSecurityPolicyNonce,
  contentSecurityPolicyReportOnly,
  currentContentSecurityPolicy,
  isContentSecurityPolicy,
  type ContentSecurityPolicyBlock,
} from "./content-security-policy.js";
import { ContentSecurityPolicy as Policy } from "../../action-dispatch/http/content-security-policy.js";
import type { CallbackOptions } from "../../abstract-controller/callbacks.js";

type Registration = {
  callback: (controller: unknown) => void | boolean | Promise<void | boolean>;
  options?: CallbackOptions;
};

function makeHost() {
  const registered: Registration[] = [];
  const host = {
    beforeAction(
      callback: (controller: unknown) => void | boolean | Promise<void | boolean>,
      options?: CallbackOptions,
    ) {
      registered.push({ callback, options });
    },
  };
  return { host, registered };
}

function makeController(initial: Policy | null = null) {
  return { request: { contentSecurityPolicy: initial } };
}

describe("contentSecurityPolicy class DSL", () => {
  let host: ReturnType<typeof makeHost>["host"];
  let registered: Registration[];

  beforeEach(() => {
    ({ host, registered } = makeHost());
  });

  it("registers a before_action and yields a cloned current policy to the block", async () => {
    const existing = new Policy((p) => p.defaultSrc(":self"));
    const controller = makeController(existing);
    let yielded: Policy | undefined;
    const block: ContentSecurityPolicyBlock = function (policy) {
      yielded = policy;
      policy.scriptSrc(":self");
    };
    contentSecurityPolicy.call(host, true, { only: ["show"] }, block);

    expect(registered).toHaveLength(1);
    expect(registered[0].options).toEqual({ only: ["show"] });

    await registered[0].callback(controller);
    expect(yielded).toBeInstanceOf(Policy);
    expect(yielded).not.toBe(existing);
    expect(controller.request.contentSecurityPolicy).toBe(yielded);
  });

  it("starts from a fresh policy when the request has none", async () => {
    const controller = makeController(null);
    contentSecurityPolicy.call(host, true, {}, function (policy) {
      policy.defaultSrc(":self");
    });
    await registered[0].callback(controller);
    expect(controller.request.contentSecurityPolicy).toBeInstanceOf(Policy);
  });

  it("nils the request CSP when disabled", async () => {
    const controller = makeController(new Policy());
    contentSecurityPolicy.call(host, false, { only: ["index"] });
    await registered[0].callback(controller);
    expect(controller.request.contentSecurityPolicy).toBeNull();
  });

  it("treats a first-positional options object as enabled=true and accepts a block in arg 2 (Rails kwargs shape)", async () => {
    const controller = makeController(null);
    let blockRan = false;
    contentSecurityPolicy.call(host, { only: ["show"] }, function (policy) {
      blockRan = true;
      policy.defaultSrc(":self");
    });
    expect(registered[0].options).toEqual({ only: ["show"] });
    await registered[0].callback(controller);
    expect(blockRan).toBe(true);
    expect(controller.request.contentSecurityPolicy).toBeInstanceOf(Policy);
  });

  it("accepts a block-only form (no enabled, no options)", async () => {
    const controller = makeController(null);
    contentSecurityPolicy.call(host, function (policy) {
      policy.defaultSrc(":self");
    });
    await registered[0].callback(controller);
    expect(controller.request.contentSecurityPolicy).toBeInstanceOf(Policy);
  });
});

describe("contentSecurityPolicyReportOnly class DSL", () => {
  let host: ReturnType<typeof makeHost>["host"];
  let registered: Registration[];

  beforeEach(() => {
    ({ host, registered } = makeHost());
  });

  it("registers a before_action that sets request.contentSecurityPolicyReportOnly", async () => {
    const controller: { request: { contentSecurityPolicyReportOnly?: boolean | Policy | null } } = {
      request: {},
    };
    contentSecurityPolicyReportOnly.call(host, true, { only: ["show"] });
    expect(registered[0].options).toEqual({ only: ["show"] });
    await registered[0].callback(controller);
    expect(controller.request.contentSecurityPolicyReportOnly).toBe(true);
  });

  it("clears the report-only header when passed false", async () => {
    const controller: { request: { contentSecurityPolicyReportOnly?: boolean | Policy | null } } = {
      request: { contentSecurityPolicyReportOnly: true },
    };
    contentSecurityPolicyReportOnly.call(host, false);
    await registered[0].callback(controller);
    expect(controller.request.contentSecurityPolicyReportOnly).toBe(false);
  });

  it("treats a first-positional options object as reportOnly=true", async () => {
    const controller: { request: { contentSecurityPolicyReportOnly?: boolean | Policy | null } } = {
      request: {},
    };
    contentSecurityPolicyReportOnly.call(host, { except: ["index"] });
    expect(registered[0].options).toEqual({ except: ["index"] });
    await registered[0].callback(controller);
    expect(controller.request.contentSecurityPolicyReportOnly).toBe(true);
  });
});

describe("private instance helpers", () => {
  it("isContentSecurityPolicy reflects request.contentSecurityPolicy presence", () => {
    expect(isContentSecurityPolicy.call({ request: { contentSecurityPolicy: null } })).toBe(false);
    expect(isContentSecurityPolicy.call({ request: { contentSecurityPolicy: new Policy() } })).toBe(
      true,
    );
  });

  it("contentSecurityPolicyNonce returns the request nonce or null", () => {
    expect(contentSecurityPolicyNonce.call({ request: {} })).toBeNull();
    expect(
      contentSecurityPolicyNonce.call({ request: { contentSecurityPolicyNonce: "abc" } }),
    ).toBe("abc");
  });

  it("currentContentSecurityPolicy dups the request policy", () => {
    const existing = new Policy((p) => p.defaultSrc(":self"));
    const dup = currentContentSecurityPolicy.call({
      request: { contentSecurityPolicy: existing },
    });
    expect(dup).toBeInstanceOf(Policy);
    expect(dup).not.toBe(existing);
  });

  it("currentContentSecurityPolicy returns a fresh policy when none is set", () => {
    const fresh = currentContentSecurityPolicy.call({ request: { contentSecurityPolicy: null } });
    expect(fresh).toBeInstanceOf(Policy);
  });
});
