import { type Deprecators } from "@blazetrails/activesupport";
import {
  deprecator,
  X_REQUEST_ID,
  URL as HttpURL,
  QueryParser,
  RequestUtils,
  CacheConfig,
  Response,
  ContentSecurityPolicy,
  type NonceGenerator,
  type CspRequestHost,
  ContentSecurityPolicyRequest as CspRequest,
  ContentSecurityPolicyMiddleware,
  PermissionsPolicyMiddleware,
  MiddlewareStack,
} from "@blazetrails/actionpack";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

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

export interface ContentSecurityPolicyConfig {
  policy: ContentSecurityPolicy | null;
  reportOnly: boolean;
  nonceGenerator: NonceGenerator | null;
  nonceDirectives: readonly string[] | null;
}

function defaultContentSecurityPolicyConfig(): ContentSecurityPolicyConfig {
  return { policy: null, reportOnly: false, nonceGenerator: null, nonceDirectives: null };
}

function cspAccessors(host: CspRequestHost): CspRequest {
  return Object.create(CspRequest.prototype, {
    getHeader: { value: (k: string) => host.getHeader(k) },
    setHeader: { value: (k: string, v: unknown) => host.setHeader(k, v) },
  }) as CspRequest;
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionDispatch", defaultActionDispatchConfig());
    this.config.set("contentSecurityPolicy", defaultContentSecurityPolicyConfig());

    this.initializer("action_dispatch.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("actionDispatch", deprecator());
    });

    this.initializer("action_dispatch.configure", () => {
      const cfg = this.config.get("actionDispatch") as ActionDispatchConfig;

      HttpURL.tldLength = cfg.tldLength;
      QueryParser.strictQueryStringSeparator = cfg.strictQueryStringSeparator;
      RequestUtils.performDeepMunge = cfg.performDeepMunge;
      CacheConfig.strictFreshness = cfg.strictFreshness;
      Response.defaultCharset = cfg.defaultCharset ?? "utf-8";
    });
  }

  static defaultMiddleware(): MiddlewareStack {
    const stack = new MiddlewareStack();
    stack.use(ContentSecurityPolicyMiddleware);
    stack.use(PermissionsPolicyMiddleware);
    return stack;
  }

  static seedContentSecurityPolicyEnv(request: CspRequestHost): void {
    const cfg = this.config.get("contentSecurityPolicy") as ContentSecurityPolicyConfig;
    const csp = cspAccessors(request);
    csp.contentSecurityPolicy = cfg.policy;
    csp.contentSecurityPolicyReportOnly = cfg.reportOnly;
    csp.contentSecurityPolicyNonceGenerator = cfg.nonceGenerator;
    csp.contentSecurityPolicyNonceDirectives = cfg.nonceDirectives;
  }
}
