/**
 * ActionDispatch::Cookies
 *
 * Cookie jar implementation mirroring Rails cookie handling.
 *
 * @boundary-file: HTTP `Set-Cookie` `Expires` is defined by the cookie spec
 *   (RFC 6265 / 6265bis); its on-wire date value aligns with HTTP-date /
 *   IMF-fixdate from RFC 7231, which JS `Date#toUTCString` produces. The
 *   jar accepts `Date | Temporal.Instant` from Rails-aware callers and
 *   bridges Temporal inputs to Date for on-wire serialization.
 */

import { getCrypto } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";

/** Cookie expiry — accept either a Date or a Temporal.Instant from AR/AM. */
export type CookieExpires = Date | Temporal.Instant;

function toUTCString(expires: CookieExpires): string {
  return expires instanceof Temporal.Instant
    ? new Date(expires.epochMilliseconds).toUTCString()
    : expires.toUTCString();
}

/**
 * Rack env key under which {@link CookieJar.build} reads the app-wide
 * {@link CookieJarOptions}. The `ActionDispatch::Cookies` middleware sets
 * this so signed/encrypted cookie accessors can find their secrets.
 *
 * @internal
 */
export const COOKIES_APP_OPTIONS_KEY = "action_dispatch.cookies_app_options";

export interface CookieJarOptions {
  secret?: string;
  signedSecret?: string;
  encryptedSecret?: string;
  sameSite?: "strict" | "lax" | "none" | null;
  secure?: boolean;
  httpOnly?: boolean;
  domain?: string;
  path?: string;
  expires?: CookieExpires;
}

export interface SetCookieOptions {
  value: string;
  path?: string;
  domain?: string;
  expires?: CookieExpires;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none" | null;
}

export class CookieJar implements Iterable<[string, string]> {
  private _cookies: Map<string, string> = new Map();
  private _setCookies: Map<string, SetCookieOptions> = new Map();
  private _deletedCookies: Map<string, { path?: string; domain?: string }> = new Map();
  private _options: CookieJarOptions;
  private _committed = false;

  constructor(options: CookieJarOptions = {}) {
    this._options = options;
  }

  /**
   * Mirror of Rails `CookieJar#committed?` — true once the jar has been
   * written to a response and further mutations have no effect.
   *
   * @internal
   */
  isCommitted(): boolean {
    return this._committed;
  }

  /**
   * Mirror of Rails `CookieJar#commit!` — freezes the set/delete sets so
   * subsequent writes from downstream middleware are ignored.
   *
   * @internal
   */
  commitBang(): void {
    this._committed = true;
  }

  /**
   * Build a CookieJar seeded with `cookies` from a request. Mirrors
   * `Cookies::CookieJar.build(request, cookies)` used by
   * `ActionDispatch::TestProcess#cookies`.
   *
   * @internal
   */
  static build(
    request: { cookiesAppOptions?: CookieJarOptions } | null | undefined,
    cookies: Record<string, string>,
  ): CookieJar {
    // Rails: `jar = new(req); jar.update(cookies); jar` — the request stores
    // the options used by signed/encrypted jars. We forward
    // `request.cookiesAppOptions` if the host exposes it so signed/encrypted
    // accessors can find their secrets in test setups.
    const jar = new CookieJar(request?.cookiesAppOptions ?? {});
    for (const [k, v] of Object.entries(cookies ?? {})) {
      jar._cookies.set(k, v);
    }
    return jar;
  }

  // --- Read ---

  get(key: string): string | undefined {
    return this._cookies.get(key);
  }

  fetch(key: string, defaultValue?: string): string {
    const val = this._cookies.get(key);
    if (val !== undefined) return val;
    if (defaultValue !== undefined) return defaultValue;
    throw new KeyError(`key not found: "${key}"`);
  }

  has(key: string): boolean {
    return this._cookies.has(key);
  }

  get keys(): string[] {
    return [...this._cookies.keys()];
  }

  get values(): string[] {
    return [...this._cookies.values()];
  }

  get size(): number {
    return this._cookies.size;
  }

  get empty(): boolean {
    return this._cookies.size === 0;
  }

  toHash(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of this._cookies) {
      result[k] = v;
    }
    return result;
  }

  // --- Write ---

  set(key: string, valueOrOptions: string | SetCookieOptions): void {
    if (this._committed) return;
    if (typeof valueOrOptions === "string") {
      this._cookies.set(key, valueOrOptions);
      this._setCookies.set(key, { value: valueOrOptions });
    } else {
      if (valueOrOptions.value === undefined || valueOrOptions.value === null) return;
      this._cookies.set(key, valueOrOptions.value);
      this._setCookies.set(key, valueOrOptions);
    }
    this._deletedCookies.delete(key);
  }

  delete(key: string, options?: { path?: string; domain?: string }): string | undefined {
    if (this._committed) return undefined;
    const val = this._cookies.get(key);
    this._cookies.delete(key);
    this._setCookies.delete(key);
    this._deletedCookies.set(key, options ?? {});
    return val ?? undefined;
  }

  isDeleted(key: string, options?: { path?: string; domain?: string }): boolean {
    if (!this._deletedCookies.has(key)) return false;
    if (!options) return true;
    const delOpts = this._deletedCookies.get(key)!;
    if (options.path && delOpts.path !== options.path) return false;
    if (options.domain && delOpts.domain !== options.domain) return false;
    return true;
  }

  // --- Iteration ---

  each(fn: (key: string, value: string) => void): this {
    for (const [k, v] of this._cookies) {
      fn(k, v);
    }
    return this;
  }

  [Symbol.iterator](): Iterator<[string, string]> {
    return this._cookies[Symbol.iterator]();
  }

  // --- Permanent ---

  get permanent(): PermanentCookieJar {
    return new PermanentCookieJar(this);
  }

  // --- Signed ---

  get signed(): SignedCookieJar {
    const secret = this._options.signedSecret ?? this._options.secret;
    if (!secret) throw new Error("No secret configured for signed cookies");
    return new SignedCookieJar(this, secret);
  }

  // --- Encrypted ---

  get encrypted(): EncryptedCookieJar {
    const secret = this._options.encryptedSecret ?? this._options.secret;
    if (!secret) throw new Error("No secret configured for encrypted cookies");
    return new EncryptedCookieJar(this, secret);
  }

  // --- Response headers ---

  getSetCookieHeaders(): string[] {
    const headers: string[] = [];
    for (const [name, opts] of this._setCookies) {
      headers.push(formatSetCookie(name, opts, this._options));
    }
    for (const [name, opts] of this._deletedCookies) {
      headers.push(formatDeleteCookie(name, opts));
    }
    return headers;
  }

  // --- Parse from request ---

  /** @internal */
  static parse(cookieHeader: string, options: CookieJarOptions = {}): CookieJar {
    const jar = new CookieJar(options);
    if (!cookieHeader) return jar;
    for (const pair of cookieHeader.split(";")) {
      const [key, ...rest] = pair.split("=");
      const k = key?.trim();
      const v = rest.join("=").trim();
      if (k) jar._cookies.set(k, v);
    }
    return jar;
  }
}

export class PermanentCookieJar {
  private jar: CookieJar;
  private static readonly TWENTY_YEARS_MS = 20 * 365.25 * 24 * 60 * 60 * 1000;

  constructor(jar: CookieJar) {
    this.jar = jar;
  }

  set(key: string, valueOrOptions: string | SetCookieOptions): void {
    const expires = new Date(Date.now() + PermanentCookieJar.TWENTY_YEARS_MS);
    if (typeof valueOrOptions === "string") {
      this.jar.set(key, { value: valueOrOptions, expires });
    } else {
      this.jar.set(key, { ...valueOrOptions, expires: valueOrOptions.expires ?? expires });
    }
  }

  get(key: string): string | undefined {
    return this.jar.get(key);
  }
}

export class SignedCookieJar {
  private jar: CookieJar;
  private secret: string;
  private digest: string;

  constructor(jar: CookieJar, secret: string, digest = "sha256") {
    this.jar = jar;
    this.secret = secret;
    this.digest = digest;
  }

  set(key: string, valueOrOptions: string | SetCookieOptions): void {
    const value = typeof valueOrOptions === "string" ? valueOrOptions : valueOrOptions.value;
    const signed = this.sign(value);
    if (typeof valueOrOptions === "string") {
      this.jar.set(key, signed);
    } else {
      this.jar.set(key, { ...valueOrOptions, value: signed });
    }
  }

  get(key: string): string | undefined {
    const raw = this.jar.get(key);
    if (!raw) return undefined;
    return this.verify(raw);
  }

  private sign(value: string): string {
    const hmac = getCrypto().createHmac(this.digest, this.secret).update(value).digest("hex");
    return `${value}--${hmac}`;
  }

  private verify(signedValue: string): string | undefined {
    const idx = signedValue.lastIndexOf("--");
    if (idx === -1) return undefined;
    const value = signedValue.slice(0, idx);
    const sig = signedValue.slice(idx + 2);
    const expected = getCrypto().createHmac(this.digest, this.secret).update(value).digest("hex");
    if (sig.length !== expected.length) return undefined;
    // Constant-time comparison
    let match = true;
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] !== expected[i]) match = false;
    }
    return match ? value : undefined;
  }
}

export class EncryptedCookieJar {
  private jar: CookieJar;
  private secret: string;

  constructor(jar: CookieJar, secret: string) {
    this.jar = jar;
    this.secret = secret;
  }

  set(key: string, valueOrOptions: string | SetCookieOptions): void {
    const value = typeof valueOrOptions === "string" ? valueOrOptions : valueOrOptions.value;
    const encrypted = this.encrypt(value);
    if (typeof valueOrOptions === "string") {
      this.jar.set(key, encrypted);
    } else {
      this.jar.set(key, { ...valueOrOptions, value: encrypted });
    }
  }

  get(key: string): string | undefined {
    const raw = this.jar.get(key);
    if (!raw) return undefined;
    return this.decrypt(raw);
  }

  private encrypt(value: string): string {
    const crypto = getCrypto();
    const key = Buffer.from(this.secret.padEnd(32, "0").slice(0, 32));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(value, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${Buffer.from(iv).toString("hex")}--${encrypted}`;
  }

  private decrypt(encryptedValue: string): string | undefined {
    try {
      const [ivHex, encrypted] = encryptedValue.split("--");
      if (!ivHex || !encrypted) return undefined;
      const key = Buffer.from(this.secret.padEnd(32, "0").slice(0, 32));
      const iv = Buffer.from(ivHex, "hex");
      const decipher = getCrypto().createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return undefined;
    }
  }
}

class KeyError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "KeyError";
  }
}

function formatSetCookie(name: string, opts: SetCookieOptions, defaults: CookieJarOptions): string {
  let header = `${encodeURIComponent(name)}=${encodeURIComponent(opts.value)}`;
  const path = opts.path ?? defaults.path ?? "/";
  header += `; path=${path}`;
  if (opts.domain ?? defaults.domain) header += `; domain=${opts.domain ?? defaults.domain}`;
  if (opts.expires) header += `; expires=${toUTCString(opts.expires)}`;
  if (opts.maxAge !== undefined) header += `; max-age=${opts.maxAge}`;
  if (opts.secure ?? defaults.secure) header += "; secure";
  if (opts.httpOnly ?? defaults.httpOnly) header += "; HttpOnly";
  const sameSite = opts.sameSite !== undefined ? opts.sameSite : defaults.sameSite;
  if (sameSite) header += `; SameSite=${capitalize(sameSite)}`;
  return header;
}

function formatDeleteCookie(name: string, opts: { path?: string; domain?: string }): string {
  let header = `${encodeURIComponent(name)}=; path=${opts.path ?? "/"}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  if (opts.domain) header += `; domain=${opts.domain}`;
  return header;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ===========================================================================
// ActionDispatch::Cookies — middleware
// ===========================================================================

/**
 * Rack env key under which the constructed {@link CookieJar} is cached for
 * the duration of the request. Mirrors `ActionDispatch::Cookies::COOKIES_KEY`.
 *
 * @internal
 */
export const COOKIES_KEY = "action_dispatch.cookies";

/**
 * `ActionDispatch::Cookies` middleware. Mirrors Rails' shape: the jar is
 * built lazily by downstream code via `request.cookie_jar`; this middleware
 * only flushes accumulated cookies on the way out if the jar was touched
 * and not yet committed.
 */
export class Cookies {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const response = await this.app(env);
    const jar = env[COOKIES_KEY] as CookieJar | undefined;
    if (!jar || jar.isCommitted()) return response;

    const [status, headers, body] = response;
    const outHeaders: Record<string, string> = { ...headers };
    const setHeaders = jar.getSetCookieHeaders();
    if (setHeaders.length > 0) {
      // Rack 3 standardizes on lowercase header keys, but Rails-shaped
      // middleware can still emit `Set-Cookie` (or stranger casings).
      // Accumulate values from *every* set-cookie variant the response
      // carries so nothing is dropped when more than one casing is
      // present (e.g. both "Set-Cookie" and "set-cookie"), then
      // canonicalize on lowercase `set-cookie`.
      const existingList: string[] = [];
      for (const key of Object.keys(outHeaders)) {
        if (key.toLowerCase() !== "set-cookie") continue;
        // Although the RackResponse tuple types headers as
        // Record<string, string>, downstream apps backed by
        // `Rack::Response` (Record<string, string | string[]>) can
        // hand back set-cookie as an array — splatting it into a
        // string template would stringify with commas and corrupt the
        // header. Normalize both shapes to a flat string[].
        const v = outHeaders[key] as unknown as string | string[];
        if (Array.isArray(v)) existingList.push(...v);
        else existingList.push(v);
        if (key !== "set-cookie") delete outHeaders[key];
      }
      // Rack's wire convention is newline-joined values within a
      // single set-cookie header.
      outHeaders["set-cookie"] = [...existingList, ...setHeaders].join("\n");
    }
    jar.commitBang();
    return [status, outHeaders, body];
  }
}

// ===========================================================================
// ActionDispatch::RequestCookieMethods — Request mixin
// ===========================================================================

/**
 * Host shape used by {@link cookieJar}, {@link isHaveCookieJar}, and
 * the `action_dispatch.*` env-key accessors below ({@link keyGenerator}
 * et al.). The `env` is the underlying Rack env on the request; trails
 * reads/writes Rails `action_dispatch.*` keys there.
 *
 * @internal
 */
export interface RequestCookieMethodsHost {
  env: RackEnv;
  cookiesAppOptions?: CookieJarOptions;
  cookies: Record<string, string>;
}

const COOKIE_JAR_ENV = COOKIES_KEY;

/** Returns the {@link CookieJar} for this request, building it on demand. */
export function cookieJar(this: RequestCookieMethodsHost, jar?: CookieJar): CookieJar {
  if (jar !== undefined) {
    this.env[COOKIE_JAR_ENV] = jar;
    return jar;
  }
  const existing = this.env[COOKIE_JAR_ENV] as CookieJar | undefined;
  if (existing) return existing;
  const built = CookieJar.build(this, this.cookies);
  this.env[COOKIE_JAR_ENV] = built;
  return built;
}

/** True iff a cookie jar has already been built for this request. */
export function isHaveCookieJar(this: RequestCookieMethodsHost): boolean {
  return this.env[COOKIE_JAR_ENV] !== undefined;
}

const requestEnvAccessor = <T>(key: string) =>
  function (this: RequestCookieMethodsHost): T | undefined {
    return this.env[key] as T | undefined;
  };

/** Rails: `request.key_generator` — the app key generator. @internal */
export const keyGenerator = requestEnvAccessor<unknown>("action_dispatch.key_generator");
/** @internal */
export const signedCookieSalt = requestEnvAccessor<string>("action_dispatch.signed_cookie_salt");
/** @internal */
export const encryptedCookieSalt = requestEnvAccessor<string>(
  "action_dispatch.encrypted_cookie_salt",
);
/** @internal */
export const encryptedSignedCookieSalt = requestEnvAccessor<string>(
  "action_dispatch.encrypted_signed_cookie_salt",
);
/** @internal */
export const authenticatedEncryptedCookieSalt = requestEnvAccessor<string>(
  "action_dispatch.authenticated_encrypted_cookie_salt",
);
/** @internal */
export const useAuthenticatedCookieEncryption = requestEnvAccessor<boolean>(
  "action_dispatch.use_authenticated_cookie_encryption",
);
/** @internal */
export const encryptedCookieCipher = requestEnvAccessor<string>(
  "action_dispatch.encrypted_cookie_cipher",
);
/** @internal */
export const signedCookieDigest = requestEnvAccessor<string>(
  "action_dispatch.signed_cookie_digest",
);
/** @internal */
export const secretKeyBase = requestEnvAccessor<string>("action_dispatch.secret_key_base");
/** @internal */
export const cookiesSerializer = requestEnvAccessor<string>("action_dispatch.cookies_serializer");
/** @internal */
export const cookiesSameSiteProtection = requestEnvAccessor<unknown>(
  "action_dispatch.cookies_same_site_protection",
);
/** @internal */
export const cookiesDigest = requestEnvAccessor<string>("action_dispatch.cookies_digest");
/** @internal */
export const cookiesRotations = requestEnvAccessor<unknown>("action_dispatch.cookies_rotations");
/** @internal */
export const useCookiesWithMetadata = requestEnvAccessor<boolean>(
  "action_dispatch.use_cookies_with_metadata",
);

// ===========================================================================
// ActionDispatch::Cookies::ChainedCookieJars
// ===========================================================================

/**
 * Host shape for {@link signedOrEncrypted} and the upgrade-path predicates.
 * Matches the `request: RequestCookieMethods` view Rails' ChainedCookieJars
 * relies on.
 *
 * @internal
 */
export interface ChainedCookieJarsHost {
  request: RequestCookieMethodsHost;
  signed: SignedCookieJar;
  encrypted: EncryptedCookieJar;
}

/**
 * Returns the `encrypted` jar when `secret_key_base` is configured on the
 * request, otherwise falls back to `signed`. Mirrors Rails'
 * `signed_or_encrypted`, used by `ActionDispatch::Session::CookieStore`.
 */
export function signedOrEncrypted(
  this: ChainedCookieJarsHost,
): SignedCookieJar | EncryptedCookieJar {
  return secretKeyBase.call(this.request) ? this.encrypted : this.signed;
}

/**
 * Rails: true while the deprecated HMAC-AES-CBC cookie format is still
 * being decoded alongside the newer AEAD format. Faithful predicate:
 * secret_key_base present, both legacy salts present, and the
 * authenticated-encryption flag set.
 *
 * @internal
 */
export function isUpgradeLegacyHmacAesCbcCookies(this: ChainedCookieJarsHost): boolean {
  const req = this.request;
  return Boolean(
    secretKeyBase.call(req) &&
    encryptedSignedCookieSalt.call(req) &&
    encryptedCookieSalt.call(req) &&
    useAuthenticatedCookieEncryption.call(req),
  );
}

/**
 * Rails: rewriter predicate — true when the legacy CBC salt is configured
 * but authenticated encryption is *off*, signalling we should rewrite
 * authenticated-encrypted cookies back into the legacy format.
 *
 * @internal
 */
export function isPrepareUpgradeLegacyHmacAesCbcCookies(this: ChainedCookieJarsHost): boolean {
  const req = this.request;
  return Boolean(
    secretKeyBase.call(req) &&
    authenticatedEncryptedCookieSalt.call(req) &&
    !useAuthenticatedCookieEncryption.call(req),
  );
}

// ===========================================================================
// ActionDispatch::Cookies::SerializedCookieJars
// ===========================================================================

const MAX_COOKIE_SIZE = 4096;

/**
 * Serializer protocol mirroring `ActiveSupport::Messages::SerializerWithFallback`.
 * `dumped` lets the jar detect cookies written by a different serializer
 * so {@link isReserialize} can flag them for rewrite.
 */
export interface CookieSerializer {
  dump(value: unknown): string;
  load(dumped: string): unknown;
  dumped(payload: string): boolean;
}

/**
 * Host shape for the SerializedCookieJars module. Carries the request
 * (for `cookies_serializer` lookup) and a memoization slot.
 *
 * @internal
 */
export interface SerializedCookieJarsHost {
  request: RequestCookieMethodsHost;
  _serializer?: CookieSerializer;
}

const JSON_SERIALIZER: CookieSerializer = {
  dump: (v) => {
    // JSON.stringify returns `undefined` for `undefined`/functions/symbols.
    // Rails' JSON serializer raises on those; do the same so
    // unserializable values aren't silently dropped by CookieJar#set's
    // `value === undefined` guard.
    const out = JSON.stringify(v);
    if (out === undefined) {
      throw new TypeError(`cannot serialize ${typeof v} as a cookie value`);
    }
    return out;
  },
  load: (s) => JSON.parse(s),
  dumped: (s) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Selects and memoizes the cookie value serializer. Rails dispatches on
 * `request.cookies_serializer` (`:json`, `:hybrid`, `:marshal`, a custom
 * serializer object, or `nil`); trails ports `:json` / `:hybrid` to the
 * JSON serializer (Marshal isn't a portable on-disk format in JS) and
 * honors a caller-supplied custom serializer object verbatim. Anything
 * else falls back to JSON.
 *
 * @internal
 */
export function serializer(this: SerializedCookieJarsHost): CookieSerializer {
  if (this._serializer) return this._serializer;
  // Read the env slot directly so a caller-supplied object serializer
  // is visible (the public `cookiesSerializer` accessor narrows to
  // string for the common Symbol-name case).
  const configured = this.request.env["action_dispatch.cookies_serializer"];
  if (
    configured &&
    typeof configured === "object" &&
    typeof (configured as CookieSerializer).dump === "function" &&
    typeof (configured as CookieSerializer).load === "function"
  ) {
    this._serializer = configured as CookieSerializer;
  } else {
    // `:json`, `:hybrid`, `nil`, unknown symbol → JSON.
    this._serializer = JSON_SERIALIZER;
  }
  return this._serializer;
}

/**
 * Returns true when `dumped` was produced by a serializer that differs
 * from the currently-configured one, so the jar should rewrite it next
 * commit. Mirrors Rails' `reserialize?`.
 *
 * @internal
 */
export function isReserialize(this: SerializedCookieJarsHost, dumped: string): boolean {
  return !serializer.call(this).dumped(dumped);
}

/**
 * Rails: `commit(name, options)` — final transformation applied to a
 * cookie's `:value` before it is written. The serialized cookie jars use
 * this to call `serializer.dump`. Mutates `options.value` in place.
 *
 * @internal
 */
export function commit(
  this: SerializedCookieJarsHost,
  _name: string,
  options: { value: unknown },
): void {
  options.value = serializer.call(this).dump(options.value);
}

/**
 * Rails raises `CookieOverflow` when a serialized value exceeds 4096
 * bytes (the browser-imposed cookie ceiling). Faithful port: checks
 * `options.value.bytesize` post-serialization.
 *
 * @internal
 */
export function checkForOverflowBang(name: string, options: { value: string }): void {
  const size = Buffer.byteLength(options.value, "utf8");
  if (size > MAX_COOKIE_SIZE) {
    throw new CookieOverflow(`${name} cookie overflowed with size ${size} bytes`);
  }
}

export class CookieOverflow extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "CookieOverflow";
  }
}
