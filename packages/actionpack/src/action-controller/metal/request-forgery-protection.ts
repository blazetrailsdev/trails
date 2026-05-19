/**
 * ActionController::RequestForgeryProtection
 *
 * CSRF protection error classes and strategy implementations.
 * @see https://api.rubyonrails.org/classes/ActionController/RequestForgeryProtection.html
 */

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
    this._controller.session = Object.create(null);
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
  constructor(_controller: Controller) {}
  handleUnverifiedRequest(): void {
    throw new InvalidAuthenticityToken();
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
  mediaType?: string | null;
  xhr?: boolean;
  xCsrfToken?: string | null;
}

/** @internal */
export interface CsrfController {
  request: CsrfRequest;
  session?: { enabled?: () => boolean } | Record<string, unknown> | null;
  allowForgeryProtection?: boolean;
  forgeryProtectionOriginCheck?: boolean;
  _markedForSameOriginVerification?: boolean;
  logger?: { warn(msg: string): void } | null;
  logWarningOnCsrfFailure?: boolean;
  /** Supplied by P20c (token validation). */
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
export function isProtectAgainstForgery(controller: CsrfController): boolean {
  if (controller.allowForgeryProtection === false) return false;
  const session = controller.session;
  if (session && typeof (session as { enabled?: unknown }).enabled === "function") {
    return (session as { enabled: () => boolean }).enabled();
  }
  return true;
}

/** @internal */
export function isValidRequestOrigin(controller: CsrfController): boolean {
  if (controller.forgeryProtectionOriginCheck === false) return true;
  const origin = controller.request.origin;
  if (origin === "null") throw new InvalidAuthenticityToken(NULL_ORIGIN_MESSAGE);
  return origin == null || origin === controller.request.baseUrl;
}

/** @internal */
export function markForSameOriginVerificationBang(controller: CsrfController): boolean {
  const value = controller.request.method.toUpperCase() === "GET";
  controller._markedForSameOriginVerification = value;
  return value;
}

/** @internal */
export function isMarkedForSameOriginVerification(controller: CsrfController): boolean {
  return controller._markedForSameOriginVerification ?? false;
}

/** @internal */
export function isNonXhrJavascriptResponse(controller: CsrfController): boolean {
  const mediaType = controller.request.mediaType ?? "";
  return /^(?:text|application)\/javascript/.test(mediaType) && !controller.request.xhr;
}

/** @internal */
export function verifySameOriginRequest(controller: CsrfController): void {
  if (isMarkedForSameOriginVerification(controller) && isNonXhrJavascriptResponse(controller)) {
    if (controller.logger && controller.logWarningOnCsrfFailure !== false) {
      controller.logger.warn(CROSS_ORIGIN_JAVASCRIPT_WARNING);
    }
    throw new InvalidCrossOriginRequest(CROSS_ORIGIN_JAVASCRIPT_WARNING);
  }
}

/** @internal */
export function unverifiedRequestWarningMessage(controller: CsrfController): string {
  if (isValidRequestOrigin(controller)) {
    return "Can't verify CSRF token authenticity.";
  }
  return `HTTP Origin header (${controller.request.origin}) didn't match request.base_url (${controller.request.baseUrl})`;
}

/** @internal */
export function isVerifiedRequest(controller: CsrfController): boolean {
  if (!isProtectAgainstForgery(controller)) return true;
  if (isGetOrHead(controller.request.method)) return true;
  return isValidRequestOrigin(controller) && (controller.isAnyAuthenticityTokenValid?.() ?? false);
}

/** @internal */
export function normalizeRelativeActionPath(relActionPath: string, requestPath: string): string {
  let path = requestPath + "/" + relActionPath;
  path = path.replace(/\/\.\//g, "/");
  return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}

/** @internal */
export function normalizeActionPath(actionPath: string, requestPath: string): string {
  // Mirrors Ruby's URI.parse: relative inputs without a leading "/" pass
  // through unparsed; absolute paths, protocol-relative ("//host/x"), and
  // absolute URLs all have their `.pathname` extracted (using a dummy base
  // so the URL constructor accepts the schemeless cases).
  if (actionPath === "" || !actionPath.startsWith("/")) {
    const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
    if (!SCHEME_RE.test(actionPath)) {
      return normalizeRelativeActionPath(actionPath, requestPath);
    }
  }
  let parsedPath: string;
  try {
    parsedPath = new URL(actionPath, "http://_placeholder_").pathname;
  } catch {
    parsedPath = actionPath;
  }
  return parsedPath.endsWith("/") && parsedPath.length > 1 ? parsedPath.slice(0, -1) : parsedPath;
}
