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

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.config["actionDispatch"] = defaultActionDispatchConfig();

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
}
