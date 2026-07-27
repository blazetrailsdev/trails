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
    const policy = request.contentSecurityPolicy;
    if (!policy) return response;

    const nonce = request.contentSecurityPolicyNonce;
    const nonceDirectives = request.contentSecurityPolicyNonceDirectives;
    // Rails: `context = request.controller_instance || request`
    // (content_security_policy.rb:51).
    const context = request.controllerInstance ?? request;

    headers[this.headerName(request)] = policy.build(context, nonce, nonceDirectives ?? undefined);
    return response;
  }

  private headerName(request: Request): string {
    return request.contentSecurityPolicyReportOnly
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
