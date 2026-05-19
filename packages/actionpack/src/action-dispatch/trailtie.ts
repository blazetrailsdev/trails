/**
 * Trailtie — initialization hooks for ActionDispatch.
 *
 * Mirrors: ActionDispatch::Railtie < Rails::Railtie (railtie.rb)
 *
 * Registers the ActionDispatch config namespace and two initializers:
 *   - `action_dispatch.deprecator` — installs the ActionDispatch deprecator
 *     into the shared `deprecators` registry.
 *   - `action_dispatch.configure` — copies `config.actionDispatch.*` values
 *     (trails camelCase mirror of Rails' `config.action_dispatch.*`) onto
 *     the framework-level holders (URL, QueryParser, Request::Utils,
 *     Cache::Request, ...).
 *
 * Unported targets (ExceptionWrapper.rescue_responses/_templates,
 * CookieJar.always_write_cookie, Mapper.route_source_locations,
 * Response.default_headers, Request.ignore_accept_header,
 * ParamBuilder.ignore_leading_brackets, ActionDispatch.test_app) are left
 * out of the configure body and will wire in as those classes gain the
 * matching surface — see actionpack-100-percent.md.
 */
import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";
import { X_REQUEST_ID } from "./constants.js";
import { URL as HttpURL } from "./http/url.js";
import { QueryParser } from "./http/query-parser.js";
import { RequestUtils } from "./request/utils.js";
import { CacheConfig } from "./http/cache.js";
import { Response } from "./http/response.js";
import {
  ContentSecurityPolicy,
  type NonceGenerator,
  type CspRequestHost,
  setContentSecurityPolicy,
  setContentSecurityPolicyReportOnly,
  setContentSecurityPolicyNonceGenerator,
  setContentSecurityPolicyNonceDirectives,
} from "./http/content-security-policy.js";
import { ContentSecurityPolicyMiddleware } from "./middleware/content-security-policy.js";
import { MiddlewareStack } from "./middleware/stack.js";

/**
 * Shape of `config.actionDispatch` — mirrors the
 * `ActiveSupport::OrderedOptions` block at the top of Rails' railtie.rb.
 */
export interface ActionDispatchConfig {
  xSendfileHeader: string | null;
  ipSpoofingCheck: boolean;
  showExceptions: "all" | "rescuable" | "none";
  tldLength: number;
  ignoreAcceptHeader: boolean;
  rescueTemplates: Record<string, string>;
  rescueResponses: Record<string, number | string>;
  defaultCharset: string | null;
  rackCache: boolean;
  httpAuthSalt: string;
  signedCookieSalt: string;
  encryptedCookieSalt: string;
  encryptedSignedCookieSalt: string;
  authenticatedEncryptedCookieSalt: string;
  useAuthenticatedCookieEncryption: boolean;
  useCookiesWithMetadata: boolean;
  performDeepMunge: boolean;
  requestIdHeader: string;
  logRescuedResponses: boolean;
  debugExceptionLogLevel: "debug" | "info" | "warn" | "error" | "fatal";
  strictFreshness: boolean;
  ignoreLeadingBrackets: boolean | null;
  strictQueryStringSeparator: boolean | null;
  defaultHeaders: Record<string, string>;
  /**
   * Mirrors `ActiveSupport::Messages::RotationConfiguration.new`. The
   * messages rotation-configuration port has not landed yet, so this slot
   * is typed `unknown` and defaults to `null` until that arrives.
   */
  cookiesRotations: unknown | null;
  alwaysWriteCookie?: boolean;
}

function defaultActionDispatchConfig(): ActionDispatchConfig {
  return {
    xSendfileHeader: null,
    ipSpoofingCheck: true,
    showExceptions: "all",
    tldLength: 1,
    ignoreAcceptHeader: false,
    rescueTemplates: {},
    rescueResponses: {},
    defaultCharset: null,
    rackCache: false,
    httpAuthSalt: "http authentication",
    signedCookieSalt: "signed cookie",
    encryptedCookieSalt: "encrypted cookie",
    encryptedSignedCookieSalt: "signed encrypted cookie",
    authenticatedEncryptedCookieSalt: "authenticated encrypted cookie",
    useAuthenticatedCookieEncryption: false,
    useCookiesWithMetadata: false,
    performDeepMunge: true,
    requestIdHeader: X_REQUEST_ID,
    logRescuedResponses: true,
    debugExceptionLogLevel: "fatal",
    strictFreshness: false,
    ignoreLeadingBrackets: null,
    strictQueryStringSeparator: null,
    defaultHeaders: {
      "X-Frame-Options": "SAMEORIGIN",
      "X-XSS-Protection": "1; mode=block",
      "X-Content-Type-Options": "nosniff",
      "X-Download-Options": "noopen",
      "X-Permitted-Cross-Domain-Policies": "none",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    cookiesRotations: null,
  };
}

/**
 * Shape of `config.contentSecurityPolicy` — mirrors the top-level CSP slots
 * on `Rails::Application::Configuration` (`content_security_policy`,
 * `_report_only`, `_nonce_generator`, `_nonce_directives`). Rails routes
 * these into the env via `application.rb:342-346`; the
 * `action_dispatch.content_security_policy` initializer below mirrors that
 * by seeding per-request env keys via [[seedContentSecurityPolicyEnv]].
 */
export interface ContentSecurityPolicyConfig {
  policy: ContentSecurityPolicy | null;
  reportOnly: boolean;
  nonceGenerator: NonceGenerator | null;
  nonceDirectives: readonly string[] | null;
}

function defaultContentSecurityPolicyConfig(): ContentSecurityPolicyConfig {
  return { policy: null, reportOnly: false, nonceGenerator: null, nonceDirectives: null };
}

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.config["actionDispatch"] = defaultActionDispatchConfig();
    this.config["contentSecurityPolicy"] = defaultContentSecurityPolicyConfig();

    this.initializer("action_dispatch.deprecator", () => {
      BaseRailtie.deprecators["actionDispatch"] = deprecator;
    });

    this.initializer("action_dispatch.configure", () => {
      const cfg = this.config["actionDispatch"] as ActionDispatchConfig;

      HttpURL.tldLength = cfg.tldLength;
      QueryParser.strictQueryStringSeparator = cfg.strictQueryStringSeparator;
      RequestUtils.performDeepMunge = cfg.performDeepMunge;
      CacheConfig.strictFreshness = cfg.strictFreshness;
      // Rails: `on_load(:action_dispatch_response) { self.default_charset =
      //   app.config.action_dispatch.default_charset || app.config.encoding }`
      // (railtie.rb:65-68). Rails assigns unconditionally — a null cfg
      // falls through to `app.config.encoding` (defaults to "utf-8"). trails
      // has no app-level `encoding` config yet, so a null cfg restores
      // "utf-8" so initializer state doesn't leak across runs.
      Response.defaultCharset = cfg.defaultCharset ?? "utf-8";
    });
  }

  /**
   * Default ActionDispatch middleware contributed by this trailtie. Apps
   * compose this into their own stack on boot. Mirrors the per-framework
   * middleware insertions Rails performs in
   * `railties/lib/rails/application/default_middleware_stack.rb`.
   */
  static defaultMiddleware(): MiddlewareStack {
    const stack = new MiddlewareStack();
    stack.use(ContentSecurityPolicyMiddleware);
    return stack;
  }

  /**
   * Seed per-request CSP env keys from `config.contentSecurityPolicy`.
   * Called by hosts at the start of request processing — mirrors the
   * `env_config` propagation in `railties/lib/rails/application.rb:342-346`.
   */
  static seedContentSecurityPolicyEnv(request: CspRequestHost): void {
    const cfg = this.config["contentSecurityPolicy"] as ContentSecurityPolicyConfig;
    // Mirror Rails application.rb:342-346 — all four slots are copied
    // unconditionally so toggling app config back to a falsy value
    // overwrites any stale env carried over from a prior request.
    setContentSecurityPolicy.call(request, cfg.policy);
    setContentSecurityPolicyReportOnly.call(request, cfg.reportOnly);
    setContentSecurityPolicyNonceGenerator.call(request, cfg.nonceGenerator);
    setContentSecurityPolicyNonceDirectives.call(request, cfg.nonceDirectives);
  }
}
