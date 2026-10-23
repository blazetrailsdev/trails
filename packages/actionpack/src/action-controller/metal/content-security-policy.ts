import { ActionController } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Concern, extend, include } from "@blazetrails/activesupport";
import { rbObjClone } from "@blazetrails/ruby-compat";
import { Callbacks, type CallbackOptions } from "../../abstract-controller/callbacks.js";
import { Helpers, type HelpersClass } from "../../abstract-controller/helpers.js";
import { ContentSecurityPolicy as Policy } from "../../action-dispatch/http/content-security-policy.js";

export type ContentSecurityPolicyBlock = (this: unknown, policy: Policy) => void;

interface CspRequest {
  contentSecurityPolicy?: Policy | null;
  contentSecurityPolicyReportOnly?: Policy | boolean | null;
  contentSecurityPolicyNonce?: string | null;
}

interface ContentSecurityPolicyClassHost {
  beforeAction(
    callback: (controller: unknown) => void | boolean | Promise<void | boolean>,
    options: CallbackOptions,
  ): void;
}

interface ContentSecurityPolicyInstanceHost {
  request: CspRequest;
}

interface ContentSecurityPolicyController extends ContentSecurityPolicyInstanceHost {
  currentContentSecurityPolicy(): Policy;
}

export function contentSecurityPolicy(
  this: ContentSecurityPolicyClassHost,
  enabled: boolean = true,
  options: CallbackOptions = {},
  block?: ContentSecurityPolicyBlock,
): void {
  this.beforeAction(function (controller: unknown) {
    const host = controller as ContentSecurityPolicyController;
    if (block) {
      const policy = host.currentContentSecurityPolicy();
      block.call(controller, policy);
      host.request.contentSecurityPolicy = policy;
    }

    if (!enabled) {
      host.request.contentSecurityPolicy = null;
    }
  }, options);
}

export function contentSecurityPolicyReportOnly(
  this: ContentSecurityPolicyClassHost,
  reportOnly: boolean = true,
  options: CallbackOptions = {},
): void {
  this.beforeAction(function (controller: unknown) {
    const host = controller as ContentSecurityPolicyInstanceHost;
    host.request.contentSecurityPolicyReportOnly = reportOnly;
  }, options);
}

/** @internal */
export function isContentSecurityPolicy(
  this: ContentSecurityPolicyInstanceHost,
): Policy | null | undefined {
  return this.request.contentSecurityPolicy;
}

/** @internal */
export function contentSecurityPolicyNonce(this: ContentSecurityPolicyInstanceHost): string | null {
  return this.request.contentSecurityPolicyNonce ?? null;
}

/** @internal */
export function currentContentSecurityPolicy(this: ContentSecurityPolicyInstanceHost): Policy {
  const policy = this.request.contentSecurityPolicy;
  return (policy && rbObjClone(policy)) || new Policy();
}

export const ClassMethods = { contentSecurityPolicy, contentSecurityPolicyReportOnly };

export const ContentSecurityPolicy = {
  ClassMethods,
  isContentSecurityPolicy,
  contentSecurityPolicyNonce,
  currentContentSecurityPolicy,
};
extend(ContentSecurityPolicy, Concern);
include(ContentSecurityPolicy, Helpers);
include(ContentSecurityPolicy, Callbacks);
(
  ContentSecurityPolicy as unknown as {
    included(base: null, block: (this: HelpersClass) => void): void;
  }
).included(null, function () {
  this.helperMethod("isContentSecurityPolicy");
  this.helperMethod("contentSecurityPolicyNonce");
});

rbModConstSet(ActionController, "ContentSecurityPolicy", ContentSecurityPolicy);
