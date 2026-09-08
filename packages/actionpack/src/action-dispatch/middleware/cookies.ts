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

import { include, KeyError, rbEqual } from "@blazetrails/ruby-compat";
import { extractOptionsBang, isPresent } from "@blazetrails/activesupport";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import {
  SERIALIZERS,
  SerializerWithFallback,
} from "@blazetrails/activesupport/messages/serializer-with-fallback";
import {
  InvalidMessage,
  MessageEncryptor,
  NullSerializer,
} from "@blazetrails/activesupport/message-encryptor";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Response } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { _RequestCtor } from "../http/request-slot.js";

export type CookieExpires = Date | Temporal.Instant;

type MetadataOptions = NonNullable<Parameters<MessageVerifier["generate"]>[1]>;

function isFromNow(expires: unknown): expires is { fromNow(): CookieExpires } {
  return expires != null && typeof (expires as { fromNow?: unknown }).fromNow === "function";
}

function toInstant(expires: CookieExpires | undefined): Temporal.Instant | null {
  if (expires == null) return null;
  return expires instanceof Date
    ? Temporal.Instant.fromEpochMilliseconds(expires.getTime())
    : expires;
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
export const COOKIES_SAME_SITE_PROTECTION = "action_dispatch.cookies_same_site_protection";

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

export class ChainedCookieJars {
  declare request: RequestCookieMethodsHost;
  declare _permanent?: PermanentCookieJar;
  declare _signed?: SignedKeyRotatingCookieJar;
  declare _encrypted?: EncryptedKeyRotatingCookieJar;
  declare _signedOrEncrypted?: SignedKeyRotatingCookieJar | EncryptedKeyRotatingCookieJar;

  get permanent(): PermanentCookieJar {
    return (this._permanent ??= new PermanentCookieJar(this as unknown as CookieJar));
  }

  get signed(): SignedKeyRotatingCookieJar {
    return (this._signed ??= new SignedKeyRotatingCookieJar(this as unknown as CookieJar));
  }

  get encrypted(): EncryptedKeyRotatingCookieJar {
    return (this._encrypted ??= new EncryptedKeyRotatingCookieJar(this as unknown as CookieJar));
  }

  get signedOrEncrypted(): SignedKeyRotatingCookieJar | EncryptedKeyRotatingCookieJar {
    return (this._signedOrEncrypted ??= isPresent(secretKeyBase.call(this.request))
      ? this.encrypted
      : this.signed);
  }

  /** @internal */
  isUpgradeLegacyHmacAesCbcCookies(): boolean {
    return Boolean(
      isPresent(secretKeyBase.call(this.request)) &&
      isPresent(encryptedSignedCookieSalt.call(this.request)) &&
      isPresent(encryptedCookieSalt.call(this.request)) &&
      useAuthenticatedCookieEncryption.call(this.request),
    );
  }

  /** @internal */
  isPrepareUpgradeLegacyHmacAesCbcCookies(): boolean {
    return Boolean(
      isPresent(secretKeyBase.call(this.request)) &&
      isPresent(authenticatedEncryptedCookieSalt.call(this.request)) &&
      !useAuthenticatedCookieEncryption.call(this.request),
    );
  }

  /** @internal */
  encryptedCookieCipher(): string {
    return encryptedCookieCipher.call(this.request) ?? "aes-256-gcm";
  }

  /** @internal */
  signedCookieDigest(): string {
    return signedCookieDigest.call(this.request) ?? "SHA1";
  }
}

export class CookieJar implements Iterable<[string, string]> {
  declare permanent: PermanentCookieJar;
  declare signed: SignedKeyRotatingCookieJar;
  declare encrypted: EncryptedKeyRotatingCookieJar;
  declare signedOrEncrypted: SignedKeyRotatingCookieJar | EncryptedKeyRotatingCookieJar;
  /** @internal */
  declare signedCookieDigest: () => string;
  /** @internal */
  declare encryptedCookieCipher: () => string;
  /** @internal */
  declare isUpgradeLegacyHmacAesCbcCookies: () => boolean;
  /** @internal */
  declare isPrepareUpgradeLegacyHmacAesCbcCookies: () => boolean;
  private _cookies: Map<string, string> = new Map();
  private _setCookies: Map<string, SetCookieOptions> = new Map();
  private _deletedCookies: Map<string, { path?: string; domain?: string }> = new Map();
  private _committed = false;
  private _request: RequestCookieMethodsHost;

  constructor(request: RequestCookieMethodsHost) {
    this._request = request;
  }

  get request(): RequestCookieMethodsHost {
    return this._request;
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
    this: new (request: RequestCookieMethodsHost) => T,
    req: RequestCookieMethodsHost,
    cookies: Record<string, string>,
  ): T {
    const jar = new this(req);
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
      options.sameSite = this.request.cookiesSameSiteProtection?.() as SetCookieOptions["sameSite"];
    }

    const request = this.request as unknown as { host?: string };
    if (options.domain === ":all" || options.domain === "all") {
      let cookieDomain = "";
      const host = request.host ?? "";
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
        return request.host === domain || (request.host ?? "").endsWith(`.${domain}`);
      });
    } else if (typeof options.domain === "function") {
      options.domain = options.domain(this.request);
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
    const request = this.request as unknown as { ssl?: boolean; host?: string };
    return (
      request.ssl === true ||
      !cookie.secure ||
      CookieJar.alwaysWriteCookie ||
      (request.host ?? "").endsWith(".onion")
    );
  }
}

export type SerializedSetOptions = Omit<SetCookieOptions, "value"> & { value: unknown };

function isHash(value: unknown): value is SerializedSetOptions {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AbstractCookieJar {
  declare permanent: PermanentCookieJar;
  declare signed: SignedKeyRotatingCookieJar;
  declare encrypted: EncryptedKeyRotatingCookieJar;
  declare signedOrEncrypted: SignedKeyRotatingCookieJar | EncryptedKeyRotatingCookieJar;
  /** @internal */
  declare signedCookieDigest: () => string;
  /** @internal */
  declare encryptedCookieCipher: () => string;
  /** @internal */
  declare isUpgradeLegacyHmacAesCbcCookies: () => boolean;
  /** @internal */
  declare isPrepareUpgradeLegacyHmacAesCbcCookies: () => boolean;
  protected parentJar: CookieJar | AbstractCookieJar;

  constructor(parentJar: CookieJar | AbstractCookieJar) {
    this.parentJar = parentJar;
  }

  get(name: string): unknown {
    const data = this.parentJar.get(name);
    if (data != null) {
      const result = this.parse(name, data, `cookie.${name}`);

      if (result == null) {
        return this.parse(name, data);
      } else {
        return result;
      }
    }
    return undefined;
  }

  set(name: string, options: unknown): SerializedSetOptions {
    if (!isHash(options)) {
      options = { value: options };
    }

    this.commit(name, options as SerializedSetOptions);
    this.parentJar.set(name, options as SetCookieOptions);
    return options as SerializedSetOptions;
  }

  /** @internal */
  get request(): RequestCookieMethodsHost {
    return this.parentJar.request;
  }

  /** @internal */
  protected expiryOptions(options: SerializedSetOptions): MetadataOptions {
    if (isFromNow(options.expires)) {
      return { expiresIn: options.expires as unknown as number };
    } else {
      return { expiresAt: toInstant(options.expires) };
    }
  }

  /** @internal */
  protected cookieMetadata(name: string, options: SerializedSetOptions): MetadataOptions {
    const metadata = this.expiryOptions(options);
    if (useCookiesWithMetadata.call(this.request)) metadata.purpose = `cookie.${name}`;
    return metadata;
  }

  protected parse(_name: string, data: unknown, _purpose?: string): unknown {
    return data;
  }

  protected commit(_name: string, _options: SerializedSetOptions): void {}
}

include(CookieJar, ChainedCookieJars);
include(AbstractCookieJar, ChainedCookieJars);

export class PermanentCookieJar extends AbstractCookieJar {
  private static readonly TWENTY_YEARS_MS = 20 * 365.25 * 24 * 60 * 60 * 1000;

  protected commit(_name: string, options: SerializedSetOptions): void {
    options.expires = new Date(Date.now() + PermanentCookieJar.TWENTY_YEARS_MS);
  }
}

export class SignedKeyRotatingCookieJar extends AbstractCookieJar {
  private verifier: MessageVerifier;

  constructor(parentJar: CookieJar | AbstractCookieJar) {
    super(parentJar);

    const secret = keyGenerator
      .call(this.request)!
      .generateKey(signedCookieSalt.call(this.request)!);
    this.verifier = new MessageVerifier(secret as string, {
      digest: this.signedCookieDigest(),
      serializer: NullSerializer,
    });

    for (const entry of cookiesRotations.call(this.request)!.signed) {
      const [secrets, options] = extractOptionsBang(entry);
      this.verifier.rotate(...secrets, { serializer: NullSerializer, ...options });
    }
  }

  protected parse(name: string, signedMessage: unknown, purpose?: string): unknown {
    let rotated = false;
    const data = this.verifier.verified(signedMessage as string, {
      purpose,
      onRotation: () => {
        rotated = true;
      },
    });
    return parse.call(this, name, data, rotated);
  }

  protected commit(name: string, options: SerializedSetOptions): void {
    commit.call(this, name, options);
    options.value = this.verifier.generate(options.value, this.cookieMetadata(name, options));
    checkForOverflowBang(name, options as { value: string });
  }
}

export class EncryptedKeyRotatingCookieJar extends AbstractCookieJar {
  private encryptor: MessageEncryptor;

  constructor(parentJar: CookieJar | AbstractCookieJar) {
    super(parentJar);

    if (useAuthenticatedCookieEncryption.call(this.request)) {
      const keyLen = MessageEncryptor.keyLen(this.encryptedCookieCipher());
      const secret = keyGenerator
        .call(this.request)!
        .generateKey(authenticatedEncryptedCookieSalt.call(this.request)!, keyLen);
      this.encryptor = new MessageEncryptor(secret as Buffer, {
        cipher: this.encryptedCookieCipher(),
        serializer: NullSerializer,
      });
    } else {
      const keyLen = MessageEncryptor.keyLen("aes-256-cbc");
      const secret = keyGenerator
        .call(this.request)!
        .generateKey(encryptedCookieSalt.call(this.request)!, keyLen);
      const signSecret = keyGenerator
        .call(this.request)!
        .generateKey(encryptedSignedCookieSalt.call(this.request)!);
      this.encryptor = new MessageEncryptor(secret as Buffer, signSecret as Buffer, {
        cipher: "aes-256-cbc",
        serializer: NullSerializer,
      });
    }

    for (const entry of cookiesRotations.call(this.request)!.encrypted) {
      const [secrets, options] = extractOptionsBang(entry);
      this.encryptor.rotate(...secrets, { serializer: NullSerializer, ...options });
    }

    if (this.isUpgradeLegacyHmacAesCbcCookies()) {
      const legacyCipher = "aes-256-cbc";
      const secret = keyGenerator
        .call(this.request)!
        .generateKey(
          encryptedCookieSalt.call(this.request)!,
          MessageEncryptor.keyLen(legacyCipher),
        );
      const signSecret = keyGenerator
        .call(this.request)!
        .generateKey(encryptedSignedCookieSalt.call(this.request)!);

      this.encryptor.rotate(secret, signSecret, {
        cipher: legacyCipher,
        digest: digest.call(this),
        serializer: NullSerializer,
      });
    } else if (this.isPrepareUpgradeLegacyHmacAesCbcCookies()) {
      const futureCipher = this.encryptedCookieCipher();
      const secret = keyGenerator
        .call(this.request)!
        .generateKey(
          authenticatedEncryptedCookieSalt.call(this.request)!,
          MessageEncryptor.keyLen(futureCipher),
        );

      this.encryptor.rotate(secret, null, { cipher: futureCipher, serializer: NullSerializer });
    }
  }

  protected parse(name: string, encryptedMessage: unknown, purpose?: string): unknown {
    let rotated = false;
    try {
      const data = this.encryptor.decryptAndVerify(encryptedMessage as string, {
        purpose,
        onRotation: () => {
          rotated = true;
        },
      });
      return parse.call(this, name, data, rotated);
    } catch (error) {
      if (error instanceof InvalidMessage || error instanceof InvalidSignature) return undefined;
      throw error;
    }
  }

  protected commit(name: string, options: SerializedSetOptions): void {
    commit.call(this, name, options);
    options.value = this.encryptor.encryptAndSign(
      options.value,
      this.cookieMetadata(name, options),
    );
    checkForOverflowBang(name, options as { value: string });
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
  cookies: Record<string, string>;
  cookiesSameSiteProtection?(): unknown;
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
export const keyGenerator = requestEnvAccessor<{
  generateKey(salt: string, keySize?: number): Buffer | string;
}>("action_dispatch.key_generator");
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
export const cookiesSerializer = requestEnvAccessor<unknown>("action_dispatch.cookies_serializer");
/**
 * @internal
 * @missingRailsCall call — PERMANENT
 */
export function cookiesSameSiteProtection(this: RequestCookieMethodsHost): unknown {
  return (
    this.getHeader(COOKIES_SAME_SITE_PROTECTION) as
      | ((request: unknown) => unknown)
      | undefined
      | null
  )?.(this);
}
/** @internal */
export const cookiesDigest = requestEnvAccessor<string>("action_dispatch.cookies_digest");
/** @internal */
export const cookiesRotations = requestEnvAccessor<RotationConfiguration>(
  "action_dispatch.cookies_rotations",
);
/** @internal */
export const useCookiesWithMetadata = requestEnvAccessor<boolean>(
  "action_dispatch.use_cookies_with_metadata",
);

const MAX_COOKIE_SIZE = 4096;

export interface CookieSerializer {
  dump(value: unknown): string;
  load(dumped: string): unknown;
  dumped(payload: string): boolean;
}

/** @internal */
export interface SerializedCookieJarsHost {
  request: RequestCookieMethodsHost;
  set(name: string, options: SerializedSetOptions): unknown;
  _serializer?: CookieSerializer;
}

/** @internal */
export function digest(this: SerializedCookieJarsHost): string {
  return cookiesDigest.call(this.request) ?? "SHA1";
}

/** @internal */
export function serializer(this: SerializedCookieJarsHost): CookieSerializer {
  if (this._serializer) return this._serializer;
  const configured = cookiesSerializer.call(this.request);
  if (configured == null) {
    this._serializer = SerializerWithFallback.get("marshal");
  } else if (configured === "hybrid") {
    this._serializer = SerializerWithFallback.get("json_allow_marshal");
  } else if (typeof configured === "string") {
    this._serializer = SerializerWithFallback.get(configured);
  } else {
    this._serializer = configured as CookieSerializer;
  }
  return this._serializer;
}

/** @internal */
export function isReserialize(this: SerializedCookieJarsHost, dumped: string): boolean {
  const configured = serializer.call(this);
  return (
    Object.values(SERIALIZERS).includes(configured as (typeof SERIALIZERS)["json"]) &&
    configured !== SERIALIZERS.marshal &&
    !configured.dumped(dumped)
  );
}

/** @internal */
export function parse(
  this: SerializedCookieJarsHost,
  name: string,
  dumped: unknown,
  forceReserialize: boolean = false,
): unknown {
  if (dumped != null) {
    let value: unknown;
    try {
      value = serializer.call(this).load(dumped as string);
    } catch {
      return undefined;
    }

    if (forceReserialize || isReserialize.call(this, dumped as string)) {
      this.set(name, { value });
    }

    return value;
  }
  return undefined;
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
