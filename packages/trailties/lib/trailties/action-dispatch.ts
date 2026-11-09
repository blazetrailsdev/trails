import { TopLevel, onLoad } from "@blazetrails/activesupport";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import {
  ActionDispatch,
  Request,
  deprecator,
  X_REQUEST_ID,
  URL as HttpURL,
  QueryParser,
  CacheRequest,
  Response,
  ExceptionWrapper,
  ParamBuilder,
  CookieJar,
  Mapper,
  type CustomProxies,
} from "@blazetrails/actionpack";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { Trails } from "../trails.js";

export interface ActionDispatchConfig {
  xSendfileHeader: string | null;
  ipSpoofingCheck: boolean;
  trustedProxies?: CustomProxies | null;
  showExceptions: "all" | "rescuable" | "none";
  tldLength: number;
  ignoreAcceptHeader: boolean;
  rescueTemplates: Record<string, string>;
  rescueResponses: Record<string, string>;
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
  debugExceptionLogLevel: ":debug" | ":info" | ":warn" | ":error" | ":fatal";
  strictFreshness: boolean;
  ignoreLeadingBrackets: boolean | null;
  strictQueryStringSeparator: boolean | null;
  defaultHeaders: Record<string, string>;
  cookiesRotations: RotationConfiguration;
  alwaysWriteCookie?: boolean;
  encryptedCookieCipher?: string | null;
  signedCookieDigest?: string | null;
  cookiesSerializer?: string | null;
  cookiesDigest?: string | null;
  cookiesSameSiteProtection?: unknown;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    actionDispatch: ActionDispatchConfig;
  }
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionDispatch", {
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
      debugExceptionLogLevel: ":fatal",
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
      cookiesRotations: new RotationConfiguration(),
    } satisfies ActionDispatchConfig);

    this.initializer("action_dispatch.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("actionDispatch", deprecator());
    });

    this.initializer("action_dispatch.configure", (app) => {
      HttpURL.secureProtocol = app.config.forceSsl;
      HttpURL.tldLength = app.config.actionDispatch.tldLength;

      ParamBuilder.ignoreLeadingBrackets = app.config.actionDispatch.ignoreLeadingBrackets;
      QueryParser.strictQueryStringSeparator = app.config.actionDispatch.strictQueryStringSeparator;

      onLoad("action_dispatch_request", function (this: typeof Request) {
        this.ignoreAcceptHeader = app.config.actionDispatch.ignoreAcceptHeader;
        Request.Utils.performDeepMunge = app.config.actionDispatch.performDeepMunge;
      });

      onLoad("action_dispatch_response", function (this: typeof Response) {
        this.defaultCharset = app.config.actionDispatch.defaultCharset || app.config.encoding;
        this.defaultHeaders = app.config.actionDispatch.defaultHeaders;
      });

      Object.assign(ExceptionWrapper.rescueResponses, this.config.actionDispatch.rescueResponses);
      Object.assign(ExceptionWrapper.rescueTemplates, this.config.actionDispatch.rescueTemplates);

      if (this.config.actionDispatch.alwaysWriteCookie == null) {
        this.config.actionDispatch.alwaysWriteCookie = Trails.env["development?"]();
      }
      CookieJar.alwaysWriteCookie = this.config.actionDispatch.alwaysWriteCookie;

      Mapper.routeSourceLocations = Trails.env["development?"]();

      CacheRequest.strictFreshness = app.config.actionDispatch.strictFreshness;
      ActionDispatch.testApp = app;
    });

    this.initializer("action_dispatch.require_message_pack", async () => {
      const cookiesSerializer = this.config.actionDispatch.cookiesSerializer;
      if (
        typeof cookiesSerializer === "string" &&
        cookiesSerializer.includes("message_pack") &&
        TopLevel.ActiveSupport!.MessagePack === undefined
      ) {
        await TopLevel.ActiveSupport!.loadPath["active_support/message_pack"]();
      }
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActionDispatch::Railtie" });
