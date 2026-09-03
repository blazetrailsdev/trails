import type { CallbackOptions } from "../../abstract-controller/callbacks.js";
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
    options?: CallbackOptions,
  ): void;
}

interface ContentSecurityPolicyInstanceHost {
  request: CspRequest;
  currentContentSecurityPolicy?: typeof currentContentSecurityPolicy;
}

export function contentSecurityPolicy(
  this: ContentSecurityPolicyClassHost,
  enabled: boolean | CallbackOptions | ContentSecurityPolicyBlock = true,
  options: CallbackOptions | ContentSecurityPolicyBlock = {},
  block?: ContentSecurityPolicyBlock,
): void {
  let resolvedEnabled: boolean;
  let resolvedOptions: CallbackOptions;
  let resolvedBlock: ContentSecurityPolicyBlock | undefined;
  if (typeof enabled === "boolean") {
    resolvedEnabled = enabled;
    resolvedOptions = typeof options === "function" ? {} : options;
    resolvedBlock = typeof options === "function" ? options : block;
  } else if (typeof enabled === "function") {
    resolvedEnabled = true;
    resolvedOptions = {};
    resolvedBlock = enabled;
  } else {
    resolvedEnabled = true;
    resolvedOptions = enabled;
    resolvedBlock = typeof options === "function" ? options : block;
  }
  this.beforeAction(function (controller: unknown) {
    const host = controller as ContentSecurityPolicyInstanceHost;
    if (resolvedBlock) {
      const resolveCurrent = host.currentContentSecurityPolicy ?? currentContentSecurityPolicy;
      const policy = resolveCurrent.call(host);
      resolvedBlock.call(controller, policy);
      host.request.contentSecurityPolicy = policy;
    }
    if (!resolvedEnabled) {
      host.request.contentSecurityPolicy = null;
    }
  }, resolvedOptions);
}

export function contentSecurityPolicyReportOnly(
  this: ContentSecurityPolicyClassHost,
  reportOnly: boolean | CallbackOptions = true,
  options: CallbackOptions = {},
): void {
  let resolvedReportOnly: boolean;
  let resolvedOptions: CallbackOptions;
  if (typeof reportOnly === "boolean") {
    resolvedReportOnly = reportOnly;
    resolvedOptions = options;
  } else {
    resolvedReportOnly = true;
    resolvedOptions = reportOnly;
  }
  this.beforeAction(function (controller: unknown) {
    const host = controller as ContentSecurityPolicyInstanceHost;
    host.request.contentSecurityPolicyReportOnly = resolvedReportOnly;
  }, resolvedOptions);
}

/** @internal */
export function isContentSecurityPolicy(this: ContentSecurityPolicyInstanceHost): boolean {
  return this.request.contentSecurityPolicy != null;
}

/** @internal */
export function contentSecurityPolicyNonce(this: ContentSecurityPolicyInstanceHost): string | null {
  return this.request.contentSecurityPolicyNonce ?? null;
}

/** @internal */
export function currentContentSecurityPolicy(this: ContentSecurityPolicyInstanceHost): Policy {
  const current = this.request.contentSecurityPolicy;
  return current ? current.dup() : new Policy();
}
