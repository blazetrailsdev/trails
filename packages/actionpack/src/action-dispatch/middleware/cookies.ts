/**
 * ActionDispatch::Cookies
 *
 * Cookie jar implementation mirroring Rails cookie handling.
 *
 * @boundary-file: HTTP `Set-Cookie` `Expires` is defined by the cookie spec
 *   (RFC 6265 / 6265bis); its on-wire date value aligns with HTTP-date /
 *   IMF-fixdate from RFC 7231. The jar accepts `Date | Temporal.Instant` from
 *   Rails-aware callers, the trails counterpart of the
 *   `ActiveSupport::TimeWithZone` Rails stores.
 */

import { getCrypto, KeyError, rbEqual } from "@blazetrails/ruby-compat";
import { isPresent } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Response } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { _RequestCtor } from "../http/request-slot.js";

export type CookieExpires = Date | Temporal.Instant;

function isFromNow(expires: unknown): expires is { fromNow(): CookieExpires } {
  return expires != null && typeof (expires as { fromNow?: unknown }).fromNow === "function";
}

function hashEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown>): boolean {
  if (a === undefined) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && rbEqual(a[key], b[key]),
  );
}

/** @internal */
export const COOKIES_APP_OPTIONS_KEY = "action_dispatch.cookies_app_options";

export interface CookieJarOptions {
  secret?: string;
  signedSecret?: string;
  encryptedSecret?: string;
  sameSite?: "strict" | "lax" | "none" | null;
}

export interface SetCookieOptions {
  value: string;
  path?: string;
  domain?: string | string[] | ((request: unknown) => string | undefined);
  tldLength?: number;
  expires?: CookieExpires;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none" | null;
}

/** @noRailsEquivalent PERMANENT */
export interface CookieResponse {
  setCookie(name: string, value: SetCookieOptions): void;
  deleteCookie(name: string, options: { path?: string; domain?: string }): void;
}

export class CookieJar implements Iterable<[string, string]> {
  private _cookies: Map<string, string> = new Map();
  private _setCookies: Map<string, SetCookieOptions> = new Map();
  private _deletedCookies: Map<string, { path?: string; domain?: string }> = new Map();
  private _options: CookieJarOptions;
  private _committed = false;
  /** @internal */
  _request?: RequestCookieMethodsHost;

  constructor(options: CookieJarOptions = {}) {
    this._options = options;
  }

  /** @internal */
  isCommitted(): boolean {
    return this._committed;
  }

  /** @internal */
  commitBang(): void {
    this._committed = true;
  }

  /** @internal */
  static build<T extends CookieJar>(
    this: new (options?: CookieJarOptions) => T,
    req: RequestCookieMethodsHost | { cookiesAppOptions?: CookieJarOptions } | null | undefined,
    cookies: Record<string, string>,
  ): T {
    const jar = new this(req?.cookiesAppOptions ?? {});
    if (req && "env" in req) jar._request = req;
    for (const [k, v] of Object.entries(cookies ?? {})) {
      jar._cookies.set(k, v);
    }
    return jar;
  }

  get(key: string): string | undefined {
    return this._cookies.get(key);
  }

  fetch(name: string, args?: string): string {
    const val = this._cookies.get(name);
    if (val !== undefined) return val;
    if (args !== undefined) return args;
    throw new KeyError(`key not found: "${name}"`);
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

  set(name: string, options: string | SetCookieOptions): string | undefined {
    let value: string | undefined;
    if (typeof options === "string") {
      value = options;
      options = { value };
    } else {
      value = options.value;
    }

    this.handleOptions(options);

    if (this._cookies.get(name) !== value || options.expires) {
      this._cookies.set(name, value);
      this._setCookies.set(name, options);
      this._deletedCookies.delete(name);
    }

    return value;
  }

  /**
   * @missingRailsCall call — PERMANENT
   * @missingRailsArgs split — PERMANENT
   */
  private handleOptions(options: Partial<SetCookieOptions>): void {
    if (isFromNow(options.expires)) {
      options.expires = options.expires.fromNow();
    }

    options.path ||= "/";

    if (!("sameSite" in options)) {
      options.sameSite = this._options.sameSite;
    }

    const request = this._request as unknown as { host?: string } | undefined;
    if (options.domain === ":all" || options.domain === "all") {
      let cookieDomain = "";
      const host = request?.host ?? "";
      const dotSplittedHost = host.split(".");

      if (/^[\d.]+$/.test(host) || dotSplittedHost.includes("") || dotSplittedHost.length === 1) {
        options.domain = undefined;
        return;
      }

      if (isPresent(options.tldLength)) {
        if (dotSplittedHost.length >= options.tldLength!) {
          cookieDomain = dotSplittedHost.slice(-options.tldLength!).join(".");
        }
      } else {
        if (!/\.[^.]{2,3}\.[^.]{2}$/.test(host)) {
          cookieDomain = dotSplittedHost.slice(-2).join(".");
        } else {
          cookieDomain = dotSplittedHost.slice(-3).join(".");
        }
      }

      options.domain = isPresent(cookieDomain) ? cookieDomain : undefined;
    } else if (Array.isArray(options.domain)) {
      options.domain = options.domain.find((domain) => {
        domain = domain.replace(/^\./, "");
        return request?.host === domain || (request?.host ?? "").endsWith(`.${domain}`);
      });
    } else if (typeof options.domain === "function") {
      options.domain = options.domain(this._request);
    }
  }

  delete(name: string, options: { path?: string; domain?: string } = {}): string | undefined {
    if (!this._cookies.has(name)) return undefined;

    this.handleOptions(options);

    const value = this._cookies.get(name);
    this._cookies.delete(name);
    this._deletedCookies.set(name, options);
    return value;
  }

  isDeleted(name: string, options: { path?: string; domain?: string } = {}): boolean {
    this.handleOptions(options);
    return hashEqual(this._deletedCookies.get(name), options);
  }

  each(fn: (key: string, value: string) => void): this {
    for (const [k, v] of this._cookies) {
      fn(k, v);
    }
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<[string, string]> {
    return this._cookies[Symbol.iterator]();
  }

  get permanent(): PermanentCookieJar {
    return new PermanentCookieJar(this);
  }

  get signed(): SignedCookieJar {
    const secret = this._options.signedSecret ?? this._options.secret;
    if (!secret) throw new Error("No secret configured for signed cookies");
    return new SignedCookieJar(this, secret, this._request);
  }

  get encrypted(): EncryptedCookieJar {
    const secret = this._options.encryptedSecret ?? this._options.secret;
    if (!secret) throw new Error("No secret configured for encrypted cookies");
    return new EncryptedCookieJar(this, secret, this._request);
  }

  get signedOrEncrypted(): SignedCookieJar | EncryptedCookieJar {
    const skb = this._request ? secretKeyBase.call(this._request) : undefined;
    return skb ? this.encrypted : this.signed;
  }

  write(response: CookieResponse): void {
    for (const [name, value] of this._setCookies) {
      if (this.isWriteCookie(value)) {
        response.setCookie(name, value);
      }
    }

    for (const [name, value] of this._deletedCookies) {
      response.deleteCookie(name, value);
    }
  }

  static alwaysWriteCookie = false;

  /** @internal */
  private isWriteCookie(cookie: SetCookieOptions): boolean {
    const request = this._request as unknown as { ssl?: boolean; host?: string } | undefined;
    return (
      request?.ssl === true ||
      !cookie.secure ||
      CookieJar.alwaysWriteCookie ||
      (request?.host ?? "").endsWith(".onion")
    );
  }

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
    // boundary: the cookie `Expires` attribute is serialized as an HTTP-date.
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

export type SerializedSetOptions = Omit<SetCookieOptions, "value"> & { value: unknown };

/** @internal */
function makeSerializedHost(
  request: RequestCookieMethodsHost | undefined,
): SerializedCookieJarsHost {
  return {
    request: request ?? {
      env: {},
      getHeader: () => undefined,
      hasHeader: () => false,
      cookies: {},
    },
  };
}

/** @internal */
function normalizeSerializedInput(input: unknown): SerializedSetOptions {
  if (input !== null && typeof input === "object" && Object.hasOwn(input, "value")) {
    return { ...(input as SerializedSetOptions) };
  }
  return { value: input };
}

export class SignedCookieJar {
  private jar: CookieJar;
  private secret: string;
  private digest: string;
  private host: SerializedCookieJarsHost;

  constructor(
    jar: CookieJar,
    secret: string,
    request?: RequestCookieMethodsHost,
    digest = "sha256",
  ) {
    this.jar = jar;
    this.secret = secret;
    this.digest = digest;
    this.host = makeSerializedHost(request);
  }

  set(key: string, valueOrOptions: unknown): void {
    const options = normalizeSerializedInput(valueOrOptions);
    commit.call(this.host, key, options);
    const signed = this.sign(options.value as string);
    checkForOverflowBang(key, { value: signed });
    this.jar.set(key, { ...(options as SetCookieOptions), value: signed });
  }

  get permanent(): PermanentCookieJar {
    return new PermanentCookieJar(this as unknown as CookieJar);
  }

  get(key: string): unknown {
    const raw = this.jar.get(key);
    if (raw === undefined) return undefined;
    const verified = this.verify(raw);
    if (verified === undefined) return undefined;
    try {
      return serializer.call(this.host).load(verified);
    } catch {
      return undefined;
    }
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
  private host: SerializedCookieJarsHost;

  constructor(jar: CookieJar, secret: string, request?: RequestCookieMethodsHost) {
    this.jar = jar;
    this.secret = secret;
    this.host = makeSerializedHost(request);
  }

  set(key: string, valueOrOptions: unknown): void {
    const options = normalizeSerializedInput(valueOrOptions);
    commit.call(this.host, key, options);
    const encrypted = this.encrypt(options.value as string);
    checkForOverflowBang(key, { value: encrypted });
    this.jar.set(key, { ...(options as SetCookieOptions), value: encrypted });
  }

  get(key: string): unknown {
    const raw = this.jar.get(key);
    if (raw === undefined) return undefined;
    const decrypted = this.decrypt(raw);
    if (decrypted === undefined) return undefined;
    try {
      return serializer.call(this.host).load(decrypted);
    } catch {
      return undefined;
    }
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

/** @internal */
export const COOKIES_KEY = "action_dispatch.cookies";

type CookiesRequest = RequestCookieMethodsHost & {
  isHaveCookieJar(): boolean;
  cookieJar(): CookieJar;
};

export class Cookies {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const request = new _RequestCtor!(env) as CookiesRequest;
    let response: RackResponse | Response = await this.app(env);

    if (request.isHaveCookieJar()) {
      const cookieJar = request.cookieJar();
      if (!cookieJar.isCommitted()) {
        response = Response.create(...response);
        cookieJar.write(response);
      }
    }

    return (response instanceof Response ? response.toArray() : response) as RackResponse;
  }
}

/** @internal */
export interface RequestCookieMethodsHost {
  env: RackEnv;
  getHeader(name: string): any;
  hasHeader(name: string): boolean;
  cookiesAppOptions?: CookieJarOptions;
  cookies: Record<string, string>;
}

const COOKIE_JAR_ENV = COOKIES_KEY;

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

export function isHaveCookieJar(this: RequestCookieMethodsHost): boolean {
  return this.hasHeader("action_dispatch.cookies");
}

const requestEnvAccessor = <T>(key: string) =>
  function (this: RequestCookieMethodsHost): T | undefined {
    return this.env[key] as T | undefined;
  };

/** @internal */
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

/** @internal */
export interface ChainedCookieJarsHost {
  request: RequestCookieMethodsHost;
  signed: SignedCookieJar;
  encrypted: EncryptedCookieJar;
}

export function signedOrEncrypted(
  this: ChainedCookieJarsHost,
): SignedCookieJar | EncryptedCookieJar {
  return secretKeyBase.call(this.request) ? this.encrypted : this.signed;
}

/** @internal */
export function isUpgradeLegacyHmacAesCbcCookies(this: ChainedCookieJarsHost): boolean {
  const req = this.request;
  return Boolean(
    secretKeyBase.call(req) &&
    encryptedSignedCookieSalt.call(req) &&
    encryptedCookieSalt.call(req) &&
    useAuthenticatedCookieEncryption.call(req),
  );
}

/** @internal */
export function isPrepareUpgradeLegacyHmacAesCbcCookies(this: ChainedCookieJarsHost): boolean {
  const req = this.request;
  return Boolean(
    secretKeyBase.call(req) &&
    authenticatedEncryptedCookieSalt.call(req) &&
    !useAuthenticatedCookieEncryption.call(req),
  );
}

const MAX_COOKIE_SIZE = 4096;

export interface CookieSerializer {
  dump(value: unknown): string;
  load(dumped: string): unknown;
  dumped(payload: string): boolean;
}

/** @internal */
export interface SerializedCookieJarsHost {
  request: RequestCookieMethodsHost;
  _serializer?: CookieSerializer;
}

const JSON_SERIALIZER: CookieSerializer = {
  dump: (v) => {
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

/** @internal */
export function serializer(this: SerializedCookieJarsHost): CookieSerializer {
  if (this._serializer) return this._serializer;
  const configured = this.request.env["action_dispatch.cookies_serializer"];
  if (
    configured &&
    typeof configured === "object" &&
    typeof (configured as CookieSerializer).dump === "function" &&
    typeof (configured as CookieSerializer).load === "function"
  ) {
    this._serializer = configured as CookieSerializer;
  } else {
    this._serializer = JSON_SERIALIZER;
  }
  return this._serializer;
}

/** @internal */
export function isReserialize(this: SerializedCookieJarsHost, dumped: string): boolean {
  return !serializer.call(this).dumped(dumped);
}

/** @internal */
export function commit(
  this: SerializedCookieJarsHost,
  _name: string,
  options: { value: unknown },
): void {
  options.value = serializer.call(this).dump(options.value);
}

/** @internal */
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
