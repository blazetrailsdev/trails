/**
 * ActionController::RequestForgeryProtection
 *
 * CSRF protection error classes and strategy implementations.
 * @see https://api.rubyonrails.org/classes/ActionController/RequestForgeryProtection.html
 */

import { getCrypto } from "@blazetrails/activesupport";
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

export class NullSessionHash {
  /** Rails: `NullSessionHash#initialize(req)` (request_forgery_protection.rb:271-275). */
  constructor(_req: unknown) {}

  get(_key: string): unknown {
    return undefined;
  }
  set(_key: string, _value: unknown): void {}
  has(_key: string): boolean {
    return false;
  }
  delete(_key: string): boolean {
    return false;
  }
  clear(): void {}
  exists(): boolean {
    return false;
  }
  enabled(): boolean {
    return false;
  }
  destroy(): void {}

  [key: string]: unknown;
}

export class NullCookieJar {
  get(_key: string): undefined {
    return undefined;
  }
  set(_key: string, _value: string): void {}
  has(_key: string): boolean {
    return false;
  }
  delete(_key: string): boolean {
    return false;
  }
  get signed(): NullCookieJar {
    return this;
  }
  get encrypted(): NullCookieJar {
    return this;
  }

  [key: string]: unknown;
}

type Controller = Record<string, unknown>;

export class NullSession implements ProtectionMethods {
  private _controller: Controller;
  constructor(controller: Controller) {
    this._controller = controller;
  }
  handleUnverifiedRequest(): void {
    const request = this._controller.request;
    this._controller.session = new NullSessionHash(request);
    this._controller.cookies = new NullCookieJar();
    const flash = this._controller.flash;
    if (
      flash &&
      typeof flash === "object" &&
      typeof (flash as Record<string, unknown>).clear === "function"
    ) {
      (flash as { clear(): void }).clear();
    }
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
  /**
   * Mirrors `attr_accessor :warning_message` (request_forgery_protection.rb:307).
   * Initialized so the property exists on the instance, which is what
   * `handle_unverified_request`'s `respond_to?(:warning_message)` (rb:404) is
   * spelled as here.
   */
  warningMessage: string | undefined = undefined;
  constructor(_controller: Controller) {}
  handleUnverifiedRequest(): void {
    throw new InvalidAuthenticityToken(this.warningMessage);
  }
}

const DEFAULT_TOKEN_KEY = "_csrf_token";

export class SessionStore {
  private _tokenKey: string;
  constructor(tokenKey: string = DEFAULT_TOKEN_KEY) {
    this._tokenKey = tokenKey;
  }
  read(session: Record<string, unknown>): string | null {
    const token = session[this._tokenKey];
    return typeof token === "string" ? token : null;
  }
  fetch(session: Record<string, unknown>): string | null {
    return this.read(session);
  }
  write(session: Record<string, unknown>, token: string): void {
    session[this._tokenKey] = token;
  }
  store(session: Record<string, unknown>, token: string): void {
    this.write(session, token);
  }
  reset(session: Record<string, unknown>): void {
    delete session[this._tokenKey];
  }
}

export class CookieStore {
  private _cookieName: string;
  constructor(cookieName = "csrf_token") {
    this._cookieName = cookieName;
  }
  read(cookies: Record<string, string>): string | null {
    return cookies[this._cookieName] ?? null;
  }
  fetch(cookies: Record<string, string>): string | null {
    return this.read(cookies);
  }
  write(cookies: Record<string, string>, token: string): void {
    cookies[this._cookieName] = token;
  }
  store(cookies: Record<string, string>, token: string): void {
    this.write(cookies, token);
  }
  reset(cookies: Record<string, string>): void {
    delete cookies[this._cookieName];
  }
}

export function warningMessage(origin?: string | null, baseUrl?: string | null): string {
  if (origin && baseUrl && origin !== baseUrl) {
    return `HTTP Origin header (${origin}) didn't match request.base_url (${baseUrl})`;
  }
  return "Can't verify CSRF token authenticity.";
}

export interface CsrfTokenStore<TStorage> {
  fetch(storage: TStorage): string | null;
  store(storage: TStorage, token: string): void;
  reset(storage: TStorage): void;
}

export function resetCsrfToken<T>(csrfStore: CsrfTokenStore<T>, storage: T): void {
  csrfStore.reset(storage);
}

export function commitCsrfToken<T>(csrfStore: CsrfTokenStore<T>, storage: T, token: string): void {
  csrfStore.store(storage, token);
}

export function skipForgeryProtection(
  _controller: { skipBeforeAction?: (name: string, options?: Record<string, unknown>) => void },
  options: Record<string, unknown> = {},
): void {
  const merged = { raise: false, ...options };
  _controller.skipBeforeAction?.("verifyAuthenticityToken", merged);
}

// ---------------------------------------------------------------------------
// Verification predicates (Rails: metal/request_forgery_protection.rb privates)
// ---------------------------------------------------------------------------

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
  /** Per-request token cache (mirrors `request.env[CSRF_TOKEN]`). */
  env?: Record<string, unknown>;
}

/** @internal */
export interface CsrfTokenStorage {
  fetch(controller: CsrfController): string | null | undefined;
  store(controller: CsrfController, token: string): void;
  reset(controller: CsrfController): void;
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
  /** Cookie jar — required when `storageStrategy("cookie")` is configured. */
  cookies?: Record<string, string>;
  _markedForSameOriginVerification?: boolean;
  logger?: { warn(msg: string): void } | null;
  logWarningOnCsrfFailure?: boolean;
  /**
   * Mirrors the `forgery_protection_strategy` class_attribute
   * (request_forgery_protection.rb:104), which `protect_from_forgery` sets to
   * `protection_method_class(name)` (rb:207).
   */
  forgeryProtectionStrategy?: new (controller: CsrfController) => ProtectionMethods;
  /** Optional override used by tests/legacy callers. */
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

/**
 * Mirrors: `handle_unverified_request` (request_forgery_protection.rb:401-409).
 *
 * Ruby's `respond_to?(:warning_message)` is spelled as an `in` check: only
 * `ProtectionMethods::Exception` carries the accessor (rb:307), and it is the
 * strategy that turns the message into the raised `InvalidAuthenticityToken`.
 *
 * `forgery_protection_strategy` gets no fallback here: rb:104 declares it with
 * no default (unlike `csrf_token_storage_strategy`, rb:100-101), so
 * `protect_from_forgery` (rb:203) is what puts a class there and Ruby raises on
 * nil — hence the non-null assertion rather than an invented default.
 *
 * @internal
 */
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
  // Rails: valid_request_origin? && any_authenticity_token_valid? — origin
  // check short-circuits so a bad origin never reaches token storage.
  if (!isValidRequestOrigin.call(this)) return false;
  return this.isAnyAuthenticityTokenValid
    ? this.isAnyAuthenticityTokenValid()
    : isAnyAuthenticityTokenValid.call(this);
}

// ---------------------------------------------------------------------------
// Token primitives + P20c verification predicates + strategy plumbing
// (Rails: request_forgery_protection.rb privates)
// ---------------------------------------------------------------------------

const AUTHENTICITY_TOKEN_LENGTH = 32;
// Rails: CSRF_TOKEN = "action_controller.csrf_token" (request_forgery_protection.rb:64).
const CSRF_TOKEN_ENV_KEY = "action_controller.csrf_token";
const GLOBAL_CSRF_TOKEN_IDENTIFIER = "!real_csrf_token";

/** @internal */
export function generateCsrfToken(): string {
  // Rails: SecureRandom.urlsafe_base64(AUTHENTICITY_TOKEN_LENGTH).
  return encodeCsrfToken(getCrypto().randomBytes(AUTHENTICITY_TOKEN_LENGTH));
}

/** @internal */
export function encodeCsrfToken(rawToken: Buffer): string {
  // Rails: Base64.urlsafe_encode64(csrf_token, padding: false)
  return rawToken.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @internal */
export function decodeCsrfToken(encodedToken: string): Buffer {
  // Rails: Base64.urlsafe_decode64 — raises ArgumentError on invalid input.
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(encodedToken)) throw new TypeError("invalid base64");
  // Reject impossible base64 lengths (length % 4 === 1 cannot encode any bytes).
  const stripped = encodedToken.replace(/=+$/, "");
  if (stripped.length % 4 === 1) throw new TypeError("invalid base64 length");
  return Buffer.from(stripped.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** @internal */
export function xorByteStrings(s1: Buffer, s2: Buffer): Buffer {
  const out = Buffer.alloc(s1.length);
  for (let i = 0; i < s1.length; i++) out[i] = s1[i] ^ s2[i];
  return out;
}

/** @internal */
export function realCsrfToken(this: CsrfController, _session?: unknown): Buffer {
  const env = (this.request.env ??= {});
  let encoded = env[CSRF_TOKEN_ENV_KEY] as string | undefined;
  if (encoded == null) {
    // Rails: csrf_token_storage_strategy defaults to SessionStore.new at the
    // class level (line 100 of request_forgery_protection.rb); mirror that
    // here so a session-backed controller without explicit config still
    // verifies tokens against its session-stored real token.
    const strategy = (this.csrfTokenStorageStrategy ??= storageStrategy("session"));
    encoded = strategy.fetch(this) ?? generateCsrfToken();
    env[CSRF_TOKEN_ENV_KEY] = encoded;
  }
  return decodeCsrfToken(encoded);
}

/** @internal */
export function csrfTokenHmac(this: CsrfController, session: unknown, identifier: string): Buffer {
  return getCrypto()
    .createHmac("sha256", realCsrfToken.call(this, session))
    .update(identifier)
    .digest()
    .subarray(0, AUTHENTICITY_TOKEN_LENGTH);
}

/** @internal */
export function globalCsrfToken(this: CsrfController, session?: unknown): Buffer {
  return csrfTokenHmac.call(this, session, GLOBAL_CSRF_TOKEN_IDENTIFIER);
}

/** @internal */
export function perFormCsrfToken(
  this: CsrfController,
  session: unknown,
  actionPath: string,
  method: string,
): Buffer {
  return csrfTokenHmac.call(this, session, `${actionPath}#${method.toLowerCase()}`);
}

/** @internal */
export function maskToken(rawToken: Buffer): string {
  const otp = getCrypto().randomBytes(AUTHENTICITY_TOKEN_LENGTH);
  return encodeCsrfToken(Buffer.concat([otp, xorByteStrings(otp, rawToken)]));
}

/** @internal */
export function unmaskToken(masked: Buffer): Buffer {
  return xorByteStrings(
    masked.subarray(0, AUTHENTICITY_TOKEN_LENGTH),
    masked.subarray(AUTHENTICITY_TOKEN_LENGTH),
  );
}

/** @internal */
export function maskedAuthenticityToken(
  this: CsrfController,
  formOptions: { action?: string; method?: string } = {},
): string {
  const { action, method } = formOptions;
  // Rails: `per_form_csrf_tokens && action && method` — Ruby `&&` only treats
  // nil/false as falsy, so an empty-string action ("submit to current path")
  // still triggers per-form generation.
  let rawToken: Buffer;
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

function compareBuffers(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && getCrypto().timingSafeEqual(a, b);
}

/** @internal */
export function compareWithRealToken(
  this: CsrfController,
  token: Buffer,
  session?: unknown,
): boolean {
  return compareBuffers(token, realCsrfToken.call(this, session));
}

/** @internal */
export function compareWithGlobalToken(
  this: CsrfController,
  token: Buffer,
  session?: unknown,
): boolean {
  return compareBuffers(token, globalCsrfToken.call(this, session));
}

/** @internal */
export function isValidPerFormCsrfToken(
  this: CsrfController,
  token: Buffer,
  session?: unknown,
): boolean {
  if (!this.perFormCsrfTokens) return false;
  // Rails: request.path.chomp("/") — strips a single trailing slash, so "/" → "".
  const path = (this.request.path ?? "").replace(/\/$/, "");
  const method = this.request.requestMethod ?? this.request.method;
  return compareBuffers(token, perFormCsrfToken.call(this, session, path, method));
}

/** @internal */
export function isValidAuthenticityToken(
  this: CsrfController,
  session: unknown,
  encoded: unknown,
): boolean {
  if (typeof encoded !== "string" || encoded.length === 0) return false;
  let masked: Buffer;
  try {
    masked = decodeCsrfToken(encoded);
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
  throw new TypeError(
    "Invalid request forgery protection method, use :null_session, :exception, :reset_session, or a custom forgery protection class.",
  );
}

/** @internal */
export function isStorageStrategy(o: unknown): o is CsrfTokenStorage {
  const s = o as CsrfTokenStorage | null;
  return (
    !!s &&
    typeof s.fetch === "function" &&
    typeof s.store === "function" &&
    typeof s.reset === "function"
  );
}

/** @internal */
export function storageStrategy(name: "session" | "cookie" | CsrfTokenStorage): CsrfTokenStorage {
  if (name === "session") {
    const s = new SessionStore();
    return {
      fetch: (c) => s.fetch((c.session as Record<string, unknown>) ?? {}),
      store: (c, t) => s.write((c.session ??= {}) as Record<string, unknown>, t),
      reset: (c) => s.reset((c.session as Record<string, unknown>) ?? {}),
    };
  }
  if (name === "cookie") {
    const k = new CookieStore("csrf_token");
    return {
      fetch: (c) => k.fetch(c.cookies ?? {}),
      store: (c, t) => k.write((c.cookies ??= {}), t),
      reset: (c) => k.reset(c.cookies ?? {}),
    };
  }
  if (isStorageStrategy(name)) return name;
  throw new TypeError(
    "Invalid CSRF token storage strategy, use :session, :cookie, or a custom CSRF token storage class.",
  );
}

/** @internal */
export function normalizeRelativeActionPath(this: CsrfController, relActionPath: string): string {
  let path = (this.request.path ?? "/") + "/" + relActionPath;
  path = path.replace(/\/\.\//g, "/");
  // Rails: uri.path.chomp("/") — single trailing slash, so "/" → "".
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

/** @internal */
export function normalizeActionPath(this: CsrfController, actionPath: string): string {
  // Mirrors Ruby's URI.parse: relative inputs without a leading "/" pass
  // through unparsed; absolute paths, protocol-relative ("//host/x"), and
  // absolute URLs all have their `.pathname` extracted (using a dummy base
  // so the URL constructor accepts the schemeless cases).
  if (actionPath === "" || !actionPath.startsWith("/")) {
    const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
    if (!SCHEME_RE.test(actionPath)) {
      return normalizeRelativeActionPath.call(this, actionPath);
    }
  }
  let parsedPath: string;
  try {
    parsedPath = new URL(actionPath, "http://_placeholder_").pathname;
  } catch {
    parsedPath = actionPath;
  }
  // Rails: uri.path.chomp("/") — single trailing slash, so "/" → "".
  return parsedPath.endsWith("/") ? parsedPath.slice(0, -1) : parsedPath;
}
