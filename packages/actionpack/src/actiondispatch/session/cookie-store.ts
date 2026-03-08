/**
 * ActionDispatch::Session::CookieStore
 *
 * Session store backed by encrypted/signed cookies.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

export interface CookieStoreOptions {
  /** Secret key for signing/encryption (must be at least 32 bytes) */
  secret: string;
  /** Cookie name (default: "_session_id") */
  key?: string;
  /** Session expiry in seconds (default: no expiry) */
  expireAfter?: number;
  /** Cookie domain */
  domain?: string | string[] | null;
  /** Cookie path (default: "/") */
  path?: string;
  /** Secure flag (default: auto-detect from request) */
  secure?: boolean;
  /** HttpOnly flag (default: true) */
  httpOnly?: boolean;
  /** SameSite attribute (default: "Lax") */
  sameSite?: "Strict" | "Lax" | "None" | null;
  /** Max cookie size in bytes (default: 4096) */
  maxSize?: number;
}

export interface SessionData {
  [key: string]: unknown;
  _session_id?: string;
  _expires_at?: number;
}

export class CookieOverflow extends Error {
  constructor() {
    super("ActionDispatch::Cookies::CookieOverflow");
    this.name = "CookieOverflow";
  }
}

export class CookieStore {
  private secret: string;
  readonly key: string;
  private expireAfter: number | null;
  private domain: string | string[] | null;
  private path: string;
  private secure: boolean | undefined;
  private httpOnly: boolean;
  private sameSite: "Strict" | "Lax" | "None" | null;
  private maxSize: number;

  constructor(options: CookieStoreOptions) {
    if (options.secret.length < 32) {
      throw new Error("Secret must be at least 32 bytes");
    }
    this.secret = options.secret;
    this.key = options.key ?? "_session_id";
    this.expireAfter = options.expireAfter ?? null;
    this.domain = options.domain !== undefined ? options.domain : null;
    this.path = options.path ?? "/";
    this.secure = options.secure;
    this.httpOnly = options.httpOnly !== false;
    this.sameSite = options.sameSite !== undefined ? options.sameSite : "Lax";
    this.maxSize = options.maxSize ?? 4096;
  }

  /** Generate a new session ID. */
  generateSessionId(): string {
    return randomBytes(16).toString("hex");
  }

  /** Load session data from a cookie value. Returns null if invalid/tampered. */
  load(cookieValue: string | undefined | null): SessionData | null {
    if (!cookieValue) return null;
    try {
      const data = this.decrypt(cookieValue);
      if (!data) return null;
      const session = JSON.parse(data) as SessionData;

      // Check expiration
      if (session._expires_at && Date.now() > session._expires_at) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  /** Save session data to a cookie value string. Throws CookieOverflow if too large. */
  save(session: SessionData): string {
    // Ensure session has an ID
    if (!session._session_id) {
      session._session_id = this.generateSessionId();
    }

    // Set expiration if configured
    if (this.expireAfter) {
      session._expires_at = Date.now() + this.expireAfter * 1000;
    }

    const value = this.encrypt(JSON.stringify(session));
    if (value.length > this.maxSize) {
      throw new CookieOverflow();
    }
    return value;
  }

  /** Get cookie options for setting the session cookie. */
  cookieOptions(isSecure?: boolean): Record<string, unknown> {
    const opts: Record<string, unknown> = {
      path: this.path,
      httpOnly: this.httpOnly,
    };
    if (this.domain !== null) {
      opts.domain = this.domain;
    }
    if (this.secure !== undefined) {
      opts.secure = this.secure;
    } else if (isSecure !== undefined) {
      opts.secure = isSecure;
    }
    if (this.sameSite !== null) {
      opts.sameSite = this.sameSite;
    }
    if (this.expireAfter) {
      opts.maxAge = this.expireAfter;
    }
    return opts;
  }

  /** Check if session data has changed compared to original. */
  hasChanged(original: SessionData | null, current: SessionData): boolean {
    if (!original) return true;
    const origKeys = Object.keys(original).filter((k) => !k.startsWith("_"));
    const currKeys = Object.keys(current).filter((k) => !k.startsWith("_"));
    if (origKeys.length !== currKeys.length) return true;
    for (const key of currKeys) {
      if (original[key] !== current[key]) return true;
    }
    return false;
  }

  /** Create a new empty session. */
  newSession(): SessionData {
    return { _session_id: this.generateSessionId() };
  }

  /** Get the session ID from session data. */
  getSessionId(session: SessionData): string | undefined {
    return session._session_id;
  }

  /** Clear session data (preserves session ID). */
  clear(session: SessionData): SessionData {
    const id = session._session_id;
    const cleared: SessionData = {};
    if (id) cleared._session_id = id;
    return cleared;
  }

  /** Reset session (new session ID). */
  reset(): SessionData {
    return this.newSession();
  }

  private encrypt(data: string): string {
    const key = Buffer.from(this.secret.slice(0, 32), "utf-8");
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(data, "utf-8", "base64");
    encrypted += cipher.final("base64");
    const payload = iv.toString("base64") + "--" + encrypted;
    const hmac = createHmac("sha256", key).update(payload).digest("base64");
    return payload + "--" + hmac;
  }

  private decrypt(value: string): string | null {
    const parts = value.split("--");
    if (parts.length !== 3) return null;
    const [ivB64, encrypted, hmac] = parts;
    const key = Buffer.from(this.secret.slice(0, 32), "utf-8");

    // Verify HMAC
    const expectedHmac = createHmac("sha256", key)
      .update(ivB64 + "--" + encrypted)
      .digest("base64");
    if (hmac !== expectedHmac) return null;

    try {
      const iv = Buffer.from(ivB64, "base64");
      const decipher = createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encrypted, "base64", "utf-8");
      decrypted += decipher.final("utf-8");
      return decrypted;
    } catch {
      return null;
    }
  }
}
