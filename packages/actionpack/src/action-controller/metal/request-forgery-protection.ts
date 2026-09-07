import {
  ArgumentError,
  getCrypto,
  chomp,
  OpenSSL,
  SecureRandom,
  URI,
  type Bytes,
} from "@blazetrails/ruby-compat";
import { isBlank } from "@blazetrails/activesupport";
import {
  CookieJar,
  cookieJar,
  type RequestCookieMethodsHost,
} from "../../action-dispatch/middleware/cookies.js";
import { SessionHash, setRubyClassPath } from "@blazetrails/rack-session";
import type { Persisted, PersistedRequest } from "@blazetrails/rack-session";
import type { Req } from "../../action-dispatch/request/session.js";
import { ActionControllerError } from "./exceptions.js";

export class InvalidAuthenticityToken extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Invalid authenticity token");
    this.name = "InvalidAuthenticityToken";
  }
}

export class InvalidCrossOriginRequest extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Invalid cross-origin request");
    this.name = "InvalidCrossOriginRequest";
  }
}

export interface ProtectionMethods {
  handleUnverifiedRequest(): void;
}

/** @noRailsEquivalent PERMANENT */
export type NullSessionRequest = Req &
  PersistedRequest &
  RequestCookieMethodsHost & {
    session: unknown;
    flash: unknown;
    sessionOptions: Record<string, unknown>;
  };

export class NullSessionHash extends SessionHash {
  constructor(req: PersistedRequest) {
    super(null as unknown as Persisted, req);
    this.data = {};
    this.loaded = true;
  }

  override destroy(): void {}

  override isExists(): boolean {
    return true;
  }

  isEnabled(): boolean {
    return false;
  }
}

export class NullCookieJar extends CookieJar {
  override write(..._args: unknown[]): void {}
}

type Controller = Record<string, unknown>;

export class NullSession implements ProtectionMethods {
  private _controller: Controller;
  constructor(controller: Controller) {
    this._controller = controller;
  }
  handleUnverifiedRequest(): void {
    const request = this._controller.request as NullSessionRequest;
    request.session = new NullSessionHash(request);
    request.flash = null;
    request.sessionOptions = { skip: true };
    cookieJar.call(request, NullCookieJar.build(request, {}));
  }
}

export class ResetSession implements ProtectionMethods {
  private _controller: Controller;
  constructor(controller: Controller) {
    this._controller = controller;
  }
  handleUnverifiedRequest(): void {
    const session = this._controller.session;
    if (session && typeof session === "object") {
      for (const key of Object.keys(session as Record<string, unknown>)) {
        delete (session as Record<string, unknown>)[key];
      }
    } else {
      this._controller.session = {};
    }
  }
}

export class Exception implements ProtectionMethods {
  warningMessage: string | undefined = undefined;
  constructor(_controller: Controller) {}
  handleUnverifiedRequest(): void {
    throw new InvalidAuthenticityToken(this.warningMessage);
  }
}

const CSRF_TOKEN_SESSION_KEY = "_csrf_token";

export class SessionStore {
  fetch(request: CsrfRequest): string | null {
    const token = request.session?.[CSRF_TOKEN_SESSION_KEY];
    return typeof token === "string" ? token : null;
  }

  store(request: CsrfRequest, csrfToken: string): void {
    (request.session ??= {})[CSRF_TOKEN_SESSION_KEY] = csrfToken;
  }

  reset(request: CsrfRequest): void {
    delete request.session?.[CSRF_TOKEN_SESSION_KEY];
  }
}

export class CookieStore {
  private _cookieName: string;

  constructor(cookie = "csrf_token") {
    this._cookieName = cookie;
  }

  fetch(request: CsrfRequest): string | null {
    return request.cookies?.[this._cookieName] ?? null;
  }

  store(request: CsrfRequest, csrfToken: string): void {
    (request.cookies ??= {})[this._cookieName] = csrfToken;
  }

  reset(request: CsrfRequest): void {
    delete request.cookies?.[this._cookieName];
  }
}

export function warningMessage(origin?: string | null, baseUrl?: string | null): string {
  if (origin && baseUrl && origin !== baseUrl) {
    return `HTTP Origin header (${origin}) didn't match request.base_url (${baseUrl})`;
  }
  return "Can't verify CSRF token authenticity.";
}

export function resetCsrfToken(this: CsrfController, request: CsrfRequest): void {
  delete (request.env ??= {})[CSRF_TOKEN_ENV_KEY];
  (this.csrfTokenStorageStrategy ??= storageStrategy("session")).reset(request);
}

export function commitCsrfToken(this: CsrfController, request: CsrfRequest): void {
  const csrfToken = (request.env ??= {})[CSRF_TOKEN_ENV_KEY];
  if (csrfToken != null)
    (this.csrfTokenStorageStrategy ??= storageStrategy("session")).store(
      request,
      csrfToken as string,
    );
}

export function skipForgeryProtection(
  _controller: { skipBeforeAction?: (name: string, options?: Record<string, unknown>) => void },
  options: Record<string, unknown> = {},
): void {
  const merged = { raise: false, ...options };
  _controller.skipBeforeAction?.("verifyAuthenticityToken", merged);
}

/** @internal */
export interface CsrfRequest {
  method: string;
  origin?: string | null;
  baseUrl: string;
  path?: string;
  requestMethod?: string;
  mediaType?: string | null;
  xhr?: boolean;
  xCsrfToken?: string | null;
  env?: Record<string, unknown>;
  session?: Record<string, unknown>;
  cookies?: Record<string, string>;
}

/** @internal */
export interface CsrfTokenStorage {
  fetch(request: CsrfRequest): string | null | undefined;
  store(request: CsrfRequest, csrfToken: string): void;
  reset(request: CsrfRequest): void;
}

/** @internal */
export interface CsrfController {
  request: CsrfRequest;
  session?: { enabled?: () => boolean } | Record<string, unknown> | null;
  params?: Record<string, unknown>;
  allowForgeryProtection?: boolean;
  forgeryProtectionOriginCheck?: boolean;
  perFormCsrfTokens?: boolean;
  requestForgeryProtectionToken?: string;
  csrfTokenStorageStrategy?: CsrfTokenStorage;
  cookies?: Record<string, string>;
  _markedForSameOriginVerification?: boolean;
  logger?: { warn(msg: string): void } | null;
  logWarningOnCsrfFailure?: boolean;
  forgeryProtectionStrategy?: new (controller: CsrfController) => ProtectionMethods;
  isAnyAuthenticityTokenValid?: () => boolean;
}

const CROSS_ORIGIN_JAVASCRIPT_WARNING =
  "Security warning: an embedded <script> tag on another site requested " +
  "protected JavaScript. If you know what you're doing, go ahead and disable " +
  "forgery protection on this action to permit cross-origin JavaScript embedding.";

const NULL_ORIGIN_MESSAGE =
  "The browser returned a 'null' origin for a request with origin-based " +
  "forgery protection turned on. This usually means you have the 'no-referrer' " +
  "Referrer-Policy header enabled, or that the request came from a site that " +
  "refused to give its origin. This makes it impossible for Rails to verify " +
  "the source of the requests. Likely the best solution is to change your " +
  "referrer policy to something less strict like same-origin or strict-origin. " +
  "If you cannot change the referrer policy, you can disable origin checking " +
  "with the Rails.application.config.action_controller.forgery_protection_origin_check setting.";

function isGetOrHead(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD";
}

/** @internal */
export function isProtectAgainstForgery(this: CsrfController): boolean {
  if (this.allowForgeryProtection === false) return false;
  const session = this.session;
  if (session && typeof (session as { enabled?: unknown }).enabled === "function") {
    return (session as { enabled: () => boolean }).enabled();
  }
  return true;
}

/** @internal */
export function isValidRequestOrigin(this: CsrfController): boolean {
  if (this.forgeryProtectionOriginCheck === false) return true;
  const origin = this.request.origin;
  if (origin === "null") throw new InvalidAuthenticityToken(NULL_ORIGIN_MESSAGE);
  return origin == null || origin === this.request.baseUrl;
}

/** @internal */
export function markForSameOriginVerificationBang(this: CsrfController): boolean {
  const value = this.request.method.toUpperCase() === "GET";
  this._markedForSameOriginVerification = value;
  return value;
}

/** @internal */
export function isMarkedForSameOriginVerification(this: CsrfController): boolean {
  return this._markedForSameOriginVerification ?? false;
}

/** @internal */
export function isNonXhrJavascriptResponse(this: CsrfController): boolean {
  const mediaType = this.request.mediaType ?? "";
  return /^(?:text|application)\/javascript/.test(mediaType) && !this.request.xhr;
}

/** @internal */
export function verifySameOriginRequest(this: CsrfController): void {
  if (isMarkedForSameOriginVerification.call(this) && isNonXhrJavascriptResponse.call(this)) {
    if (this.logger && this.logWarningOnCsrfFailure !== false) {
      this.logger.warn(CROSS_ORIGIN_JAVASCRIPT_WARNING);
    }
    throw new InvalidCrossOriginRequest(CROSS_ORIGIN_JAVASCRIPT_WARNING);
  }
}

/** @internal */
export function handleUnverifiedRequest(this: CsrfController): void {
  const protectionStrategy = new this.forgeryProtectionStrategy!(this);

  if ("warningMessage" in protectionStrategy) {
    (protectionStrategy as Exception).warningMessage = unverifiedRequestWarningMessage.call(this);
  }

  protectionStrategy.handleUnverifiedRequest();
}

/** @internal */
export function unverifiedRequestWarningMessage(this: CsrfController): string {
  if (isValidRequestOrigin.call(this)) {
    return "Can't verify CSRF token authenticity.";
  }
  return `HTTP Origin header (${this.request.origin}) didn't match request.base_url (${this.request.baseUrl})`;
}

/** @internal */
export function isVerifiedRequest(this: CsrfController): boolean {
  if (!isProtectAgainstForgery.call(this)) return true;
  if (isGetOrHead(this.request.method)) return true;
  if (!isValidRequestOrigin.call(this)) return false;
  return this.isAnyAuthenticityTokenValid
    ? this.isAnyAuthenticityTokenValid()
    : isAnyAuthenticityTokenValid.call(this);
}

const AUTHENTICITY_TOKEN_LENGTH = 32;
const CSRF_TOKEN_ENV_KEY = "action_controller.csrf_token";
const GLOBAL_CSRF_TOKEN_IDENTIFIER = "!real_csrf_token";

/** @internal */
export function generateCsrfToken(): string {
  return encodeCsrfToken(SecureRandom.randomBytes(AUTHENTICITY_TOKEN_LENGTH));
}

/** @internal */
export function encodeCsrfToken(csrfToken: Bytes): string {
  return csrfToken.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @internal */
export function decodeCsrfToken(encodedCsrfToken: string): Bytes {
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(encodedCsrfToken)) throw new TypeError("invalid base64");
  const stripped = encodedCsrfToken.replace(/=+$/, "");
  if (stripped.length % 4 === 1) throw new TypeError("invalid base64 length");
  return Buffer.from(stripped.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** @internal */
export function xorByteStrings(s1: Bytes, s2: Bytes): Bytes {
  const out = Buffer.alloc(s1.length);
  for (let i = 0; i < s1.length; i++) out[i] = s1[i] ^ s2[i];
  return out;
}

/** @internal */
export function realCsrfToken(this: CsrfController, _session?: unknown): Bytes {
  const env = (this.request.env ??= {});
  let encoded = env[CSRF_TOKEN_ENV_KEY] as string | undefined;
  if (encoded == null) {
    encoded =
      (this.csrfTokenStorageStrategy ??= storageStrategy("session")).fetch(this.request) ??
      generateCsrfToken();
    env[CSRF_TOKEN_ENV_KEY] = encoded;
  }
  return decodeCsrfToken(encoded);
}

/** @internal */
export function csrfTokenHmac(this: CsrfController, session: unknown, identifier: string): Bytes {
  return OpenSSL.HMAC.digest("SHA256", realCsrfToken.call(this, session), identifier).subarray(
    0,
    AUTHENTICITY_TOKEN_LENGTH,
  ) as Bytes;
}

/** @internal */
export function globalCsrfToken(this: CsrfController, session?: unknown): Bytes {
  return csrfTokenHmac.call(this, session, GLOBAL_CSRF_TOKEN_IDENTIFIER);
}

/** @internal */
export function perFormCsrfToken(
  this: CsrfController,
  session: unknown,
  actionPath: string,
  method: string,
): Bytes {
  return csrfTokenHmac.call(this, session, `${actionPath}#${method.toLowerCase()}`);
}

/** @internal */
export function maskToken(rawToken: Bytes): string {
  const otp = SecureRandom.randomBytes(AUTHENTICITY_TOKEN_LENGTH);
  return encodeCsrfToken(Buffer.concat([otp, xorByteStrings(otp, rawToken)]));
}

/** @internal */
export function unmaskToken(maskedToken: Bytes): Bytes {
  return xorByteStrings(
    maskedToken.subarray(0, AUTHENTICITY_TOKEN_LENGTH),
    maskedToken.subarray(AUTHENTICITY_TOKEN_LENGTH),
  );
}

/** @internal */
export function maskedAuthenticityToken(
  this: CsrfController,
  formOptions: { action?: string; method?: string } = {},
): string {
  const { action, method } = formOptions;
  let rawToken: Bytes;
  if (this.perFormCsrfTokens && action != null && method != null) {
    const actionPath = normalizeActionPath.call(this, action);
    rawToken = perFormCsrfToken.call(this, null, actionPath, method);
  } else {
    rawToken = globalCsrfToken.call(this);
  }
  return maskToken(rawToken);
}

/** @internal */
export function formAuthenticityParam(this: CsrfController): unknown {
  return this.params?.[this.requestForgeryProtectionToken ?? "authenticity_token"];
}

/** @internal */
export function requestAuthenticityTokens(this: CsrfController): unknown[] {
  return [formAuthenticityParam.call(this), this.request.xCsrfToken];
}

function compareBuffers(a: Bytes, b: Bytes): boolean {
  return a.length === b.length && getCrypto().timingSafeEqual(a, b);
}

/** @internal */
export function compareWithRealToken(
  this: CsrfController,
  token: Bytes,
  session?: unknown,
): boolean {
  return compareBuffers(token, realCsrfToken.call(this, session));
}

/** @internal */
export function compareWithGlobalToken(
  this: CsrfController,
  token: Bytes,
  session?: unknown,
): boolean {
  return compareBuffers(token, globalCsrfToken.call(this, session));
}

/** @internal */
export function isValidPerFormCsrfToken(
  this: CsrfController,
  token: Bytes,
  session?: unknown,
): boolean {
  if (!this.perFormCsrfTokens) return false;
  const path = chomp(this.request.path ?? "", "/");
  const method = this.request.requestMethod ?? this.request.method;
  return compareBuffers(token, perFormCsrfToken.call(this, session, path, method));
}

/** @internal */
export function isValidAuthenticityToken(
  this: CsrfController,
  session: unknown,
  encodedMaskedToken: unknown,
): boolean {
  if (typeof encodedMaskedToken !== "string" || encodedMaskedToken.length === 0) return false;
  let masked: Bytes;
  try {
    masked = decodeCsrfToken(encodedMaskedToken);
  } catch {
    return false;
  }
  if (masked.length === AUTHENTICITY_TOKEN_LENGTH) return compareWithRealToken.call(this, masked);
  if (masked.length === AUTHENTICITY_TOKEN_LENGTH * 2) {
    const csrfToken = unmaskToken(masked);
    return (
      compareWithGlobalToken.call(this, csrfToken) ||
      compareWithRealToken.call(this, csrfToken) ||
      isValidPerFormCsrfToken.call(this, csrfToken)
    );
  }
  return false;
}

/** @internal */
export function isAnyAuthenticityTokenValid(this: CsrfController): boolean {
  for (const token of requestAuthenticityTokens.call(this)) {
    if (isValidAuthenticityToken.call(this, this.session, token)) return true;
  }
  return false;
}

export type ProtectionMethodName = "null_session" | "reset_session" | "exception";
type ProtectionMethodCtor = new (controller: Controller) => ProtectionMethods;

/** @internal */
export function protectionMethodClass(
  name: ProtectionMethodName | ProtectionMethodCtor,
): ProtectionMethodCtor {
  if (typeof name === "function") return name;
  if (name === "null_session") return NullSession;
  if (name === "reset_session") return ResetSession;
  if (name === "exception") return Exception;
  throw new ArgumentError(
    "Invalid request forgery protection method, use :null_session, :exception, :reset_session, or a custom forgery protection class.",
  );
}

/** @internal */
export function isStorageStrategy(object: unknown): object is CsrfTokenStorage {
  const s = object as CsrfTokenStorage | null;
  return (
    !!s &&
    typeof s.fetch === "function" &&
    typeof s.store === "function" &&
    typeof s.reset === "function"
  );
}

/** @internal */
export function storageStrategy(name: "session" | "cookie" | CsrfTokenStorage): CsrfTokenStorage {
  if (name === "session") return new SessionStore();
  if (name === "cookie") return new CookieStore("csrf_token");
  if (isStorageStrategy(name)) return name;
  throw new ArgumentError(
    "Invalid CSRF token storage strategy, use :session, :cookie, or a custom CSRF token storage class.",
  );
}

/**
 * @internal
 * @missingRailsArgs chomp — PERMANENT
 */
export function normalizeRelativeActionPath(this: CsrfController, relActionPath: string): string {
  const uri = URI.parse(this.request.path ?? "/");
  uri.path = uri.path + `/${relActionPath}`;
  uri.path = uri.path.replace(/\/\.\//g, "/");

  return chomp(uri.path, "/");
}

/**
 * @internal
 * @missingRailsArgs chomp — PERMANENT
 */
export function normalizeActionPath(this: CsrfController, actionPath: string): string {
  const uri = URI.parse(actionPath);

  if (uri.isRelative() && (isBlank(actionPath) || !actionPath.startsWith("/"))) {
    return normalizeRelativeActionPath.call(this, uri.path!);
  } else {
    return chomp(uri.path!, "/");
  }
}

setRubyClassPath(
  NullSessionHash,
  "ActionController::RequestForgeryProtection::ProtectionMethods::NullSession::NullSessionHash",
);
