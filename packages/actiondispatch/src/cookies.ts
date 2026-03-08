/**
 * ActionDispatch::Cookies
 *
 * Cookie jar implementation mirroring Rails cookie handling.
 */

import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface CookieJarOptions {
  secret?: string;
  signedSecret?: string;
  encryptedSecret?: string;
  sameSite?: "strict" | "lax" | "none" | null;
  secure?: boolean;
  httpOnly?: boolean;
  domain?: string;
  path?: string;
  expires?: Date;
}

export interface SetCookieOptions {
  value: string;
  path?: string;
  domain?: string;
  expires?: Date;
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

  constructor(options: CookieJarOptions = {}) {
    this._options = options;
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
    const hmac = createHmac(this.digest, this.secret).update(value).digest("hex");
    return `${value}--${hmac}`;
  }

  private verify(signedValue: string): string | undefined {
    const idx = signedValue.lastIndexOf("--");
    if (idx === -1) return undefined;
    const value = signedValue.slice(0, idx);
    const sig = signedValue.slice(idx + 2);
    const expected = createHmac(this.digest, this.secret).update(value).digest("hex");
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
    const key = Buffer.from(this.secret.padEnd(32, "0").slice(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(value, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}--${encrypted}`;
  }

  private decrypt(encryptedValue: string): string | undefined {
    try {
      const [ivHex, encrypted] = encryptedValue.split("--");
      if (!ivHex || !encrypted) return undefined;
      const key = Buffer.from(this.secret.padEnd(32, "0").slice(0, 32));
      const iv = Buffer.from(ivHex, "hex");
      const decipher = createDecipheriv("aes-256-cbc", key, iv);
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
  if (opts.expires) header += `; expires=${opts.expires.toUTCString()}`;
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
