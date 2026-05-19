/**
 * ActionDispatch::ContentSecurityPolicy::Middleware
 *
 * Materializes a per-request `ActionDispatch::ContentSecurityPolicy` into the
 * `Content-Security-Policy` (or `-Report-Only`) response header. Mirrors
 * actionpack/lib/action_dispatch/http/content_security_policy.rb:32-71.
 */

import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_REPORT_ONLY } from "../constants.js";
import { Request } from "../http/request.js";
import {
  contentSecurityPolicy,
  contentSecurityPolicyNonce,
  contentSecurityPolicyNonceDirectives,
  contentSecurityPolicyReportOnly,
} from "../http/content-security-policy.js";

export class ContentSecurityPolicyMiddleware {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const response = await this.app(env);
    const [status, headers] = response;

    // Returning CSP headers with a 304 Not Modified is harmful, since nonces
    // in the new CSP headers might not match nonces in the cached HTML.
    if (status === 304) return response;
    if (this.policyPresent(headers)) return response;

    const request = new Request(env);
    const policy = contentSecurityPolicy.call(request);
    if (!policy) return response;

    const nonce = contentSecurityPolicyNonce.call(request);
    const nonceDirectives = contentSecurityPolicyNonceDirectives.call(request);
    // Rails: `context = request.controller_instance || request`
    // (content_security_policy.rb:51). `controller_instance` reads the
    // `action_controller.instance` env slot (http/request.rb:190-192). Until
    // the trails metal sets that env slot consistently, the fallback to
    // `request` is what gets exercised — but we keep the env lookup so that
    // wiring lands without revisiting this file.
    const context = env["action_controller.instance"] ?? request;

    headers[this.headerName(request)] = policy.build(context, nonce, nonceDirectives);
    return response;
  }

  private headerName(request: Request): string {
    return contentSecurityPolicyReportOnly.call(request)
      ? CONTENT_SECURITY_POLICY_REPORT_ONLY
      : CONTENT_SECURITY_POLICY;
  }

  private policyPresent(headers: Record<string, string>): boolean {
    return (
      headers[CONTENT_SECURITY_POLICY] != null ||
      headers[CONTENT_SECURITY_POLICY_REPORT_ONLY] != null
    );
  }
}
