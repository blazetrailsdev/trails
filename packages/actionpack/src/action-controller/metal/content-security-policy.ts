/**
 * ActionController::ContentSecurityPolicy
 *
 * Overrides or disables the globally configured Content-Security-Policy and
 * Content-Security-Policy-Report-Only headers on a per-controller or
 * per-action basis.
 * @see https://api.rubyonrails.org/classes/ActionController/ContentSecurityPolicy.html
 */

import type { CallbackOptions } from "../../abstract-controller/callbacks.js";
import { ContentSecurityPolicy as Policy } from "../../action-dispatch/http/content-security-policy.js";

/**
 * Block invoked with the per-request CSP. Mutate `policy` to override or
 * extend the globally configured Content-Security-Policy.
 */
export type ContentSecurityPolicyBlock = (this: unknown, policy: Policy) => void;

/**
 * Subset of the request shape this DSL touches. Rails reads/writes
 * `request.content_security_policy` and the report-only counterpart; downstream
 * middleware materializes the values into response headers.
 */
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
  /**
   * Rails resolves `current_content_security_policy` via `self`, so subclass
   * overrides win (content_security_policy.rb:42). Wired as an instance slot
   * on Base; the DSL dispatches through it to preserve that semantics.
   */
  currentContentSecurityPolicy?: typeof currentContentSecurityPolicy;
}

/**
 * Class DSL: register a per-controller Content-Security-Policy override.
 *
 * Mirrors Rails `ActionController::ContentSecurityPolicy::ClassMethods#content_security_policy`
 * (actionpack/lib/action_controller/metal/content_security_policy.rb, lines 38–49):
 *
 *     def content_security_policy(enabled = true, **options, &block)
 *       before_action(options) do
 *         if block_given?
 *           policy = current_content_security_policy
 *           instance_exec(policy, &block)
 *           request.content_security_policy = policy
 *         end
 *         unless enabled
 *           request.content_security_policy = nil
 *         end
 *       end
 *     end
 */
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
    // (enabled, options, block) — Rails canonical positional form
    resolvedEnabled = enabled;
    resolvedOptions = typeof options === "function" ? {} : options;
    resolvedBlock = typeof options === "function" ? options : block;
  } else if (typeof enabled === "function") {
    // (block) — block-only form
    resolvedEnabled = true;
    resolvedOptions = {};
    resolvedBlock = enabled;
  } else {
    // (options, block) — Rails kwargs-leading form, e.g. `content_security_policy(only: :index) do ... end`
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

/**
 * Class DSL: override the Content-Security-Policy-Report-Only header.
 *
 * Mirrors Rails `ActionController::ContentSecurityPolicy::ClassMethods#content_security_policy_report_only`
 * (actionpack/lib/action_controller/metal/content_security_policy.rb, lines 63–67):
 *
 *     def content_security_policy_report_only(report_only = true, **options)
 *       before_action(options) do
 *         request.content_security_policy_report_only = report_only
 *       end
 *     end
 */
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

/**
 * Private instance helper: truthy when a CSP is set on the current request.
 *
 * Mirrors Rails `ActionController::ContentSecurityPolicy#content_security_policy?`
 * (actionpack/lib/action_controller/metal/content_security_policy.rb, lines 72–74).
 *
 * @internal
 */
export function isContentSecurityPolicy(this: ContentSecurityPolicyInstanceHost): boolean {
  return this.request.contentSecurityPolicy != null;
}

/**
 * Private instance helper: returns the per-request nonce.
 *
 * Mirrors Rails `ActionController::ContentSecurityPolicy#content_security_policy_nonce`
 * (actionpack/lib/action_controller/metal/content_security_policy.rb, lines 76–78).
 *
 * @internal
 */
export function contentSecurityPolicyNonce(this: ContentSecurityPolicyInstanceHost): string | null {
  return this.request.contentSecurityPolicyNonce ?? null;
}

/**
 * Private instance helper: returns a duplicate of the request's current CSP
 * (so block mutations don't leak across requests), or a fresh empty policy.
 *
 * Mirrors Rails `ActionController::ContentSecurityPolicy#current_content_security_policy`
 * (actionpack/lib/action_controller/metal/content_security_policy.rb, lines 80–82):
 *
 *     request.content_security_policy&.clone || ActionDispatch::ContentSecurityPolicy.new
 *
 * @internal
 */
export function currentContentSecurityPolicy(this: ContentSecurityPolicyInstanceHost): Policy {
  const current = this.request.contentSecurityPolicy;
  return current ? current.dup() : new Policy();
}
