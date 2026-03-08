/**
 * ActionController::RequestForgeryProtection
 *
 * CSRF protection that verifies authenticity tokens on non-GET requests.
 * Mirrors Rails' protect_from_forgery functionality.
 */

import { createHmac, randomBytes } from "crypto";

const AUTHENTICITY_TOKEN_LENGTH = 32;
const CSRF_TOKEN_HEADER = "X-CSRF-Token";

export type CsrfStrategy = "exception" | "reset_session" | "null_session";

export interface CsrfOptions {
  /** How to handle invalid tokens (default: "exception") */
  strategy?: CsrfStrategy;
  /** Custom session key for storing the token (default: "_csrf_token") */
  sessionKey?: string;
  /** Custom form parameter name (default: "authenticity_token") */
  paramName?: string;
  /** HTTP methods that require CSRF verification */
  protectedMethods?: Set<string>;
  /** Whether to check Origin header */
  originCheck?: boolean;
  /** Allowed origins for origin checking */
  allowedOrigins?: string[];
  /** Whether to log warnings (default: true) */
  logging?: boolean;
  /** Generate per-form tokens (default: false) */
  perFormTokens?: boolean;
}

export class InvalidAuthenticityToken extends Error {
  constructor(message = "Can't verify CSRF token authenticity.") {
    super(message);
    this.name = "InvalidAuthenticityToken";
  }
}

export class RequestForgeryProtection {
  private strategy: CsrfStrategy;
  private sessionKey: string;
  private paramName: string;
  private protectedMethods: Set<string>;
  private originCheck: boolean;
  private allowedOrigins: string[];
  private logging: boolean;
  private perFormTokens: boolean;

  constructor(options: CsrfOptions = {}) {
    this.strategy = options.strategy ?? "exception";
    this.sessionKey = options.sessionKey ?? "_csrf_token";
    this.paramName = options.paramName ?? "authenticity_token";
    this.protectedMethods = options.protectedMethods ?? new Set(["POST", "PATCH", "PUT", "DELETE"]);
    this.originCheck = options.originCheck ?? false;
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.logging = options.logging ?? true;
    this.perFormTokens = options.perFormTokens ?? false;
  }

  /** Generate a new random CSRF token (base64-encoded). */
  static generateToken(): string {
    return randomBytes(AUTHENTICITY_TOKEN_LENGTH).toString("base64");
  }

  /** Get or create the real (unmasked) token stored in the session. */
  getRealToken(session: Record<string, unknown>): string {
    let token = session[this.sessionKey] as string | undefined;
    if (!token) {
      token = RequestForgeryProtection.generateToken();
      session[this.sessionKey] = token;
    }
    return token;
  }

  /** Create a masked version of the token for embedding in forms/meta tags. */
  maskToken(rawToken: string): string {
    const tokenBytes = Buffer.from(rawToken, "base64");
    const otp = randomBytes(AUTHENTICITY_TOKEN_LENGTH);
    const masked = Buffer.alloc(AUTHENTICITY_TOKEN_LENGTH * 2);
    otp.copy(masked, 0);
    for (let i = 0; i < AUTHENTICITY_TOKEN_LENGTH; i++) {
      masked[AUTHENTICITY_TOKEN_LENGTH + i] = tokenBytes[i] ^ otp[i];
    }
    return masked.toString("base64");
  }

  /** Generate a per-form token for a specific action and method. */
  generatePerFormToken(session: Record<string, unknown>, actionPath: string, method: string): string {
    const realToken = this.getRealToken(session);
    const normalizedPath = this.normalizePath(actionPath);
    const normalizedMethod = method.toUpperCase();
    const message = `${normalizedPath}#${normalizedMethod}`;
    const hmac = createHmac("sha256", realToken).update(message).digest();
    // Take first AUTHENTICITY_TOKEN_LENGTH bytes and mask
    const perFormToken = hmac.subarray(0, AUTHENTICITY_TOKEN_LENGTH).toString("base64");
    return this.maskToken(perFormToken);
  }

  /** Unmask a masked token to get the raw token bytes. */
  unmaskToken(maskedToken: string): string {
    const decoded = Buffer.from(maskedToken, "base64");
    if (decoded.length === AUTHENTICITY_TOKEN_LENGTH) {
      // Unmasked token (global token)
      return maskedToken;
    }
    if (decoded.length !== AUTHENTICITY_TOKEN_LENGTH * 2) {
      return "";
    }
    const otp = decoded.subarray(0, AUTHENTICITY_TOKEN_LENGTH);
    const encrypted = decoded.subarray(AUTHENTICITY_TOKEN_LENGTH);
    const raw = Buffer.alloc(AUTHENTICITY_TOKEN_LENGTH);
    for (let i = 0; i < AUTHENTICITY_TOKEN_LENGTH; i++) {
      raw[i] = encrypted[i] ^ otp[i];
    }
    return raw.toString("base64");
  }

  /** Verify a submitted token against the session token. */
  verifyToken(
    session: Record<string, unknown>,
    submittedToken: string | null | undefined,
    options?: { actionPath?: string; method?: string }
  ): boolean {
    if (!submittedToken || submittedToken.length === 0) return false;

    const realToken = session[this.sessionKey] as string | undefined;
    if (!realToken) return false;

    const unmasked = this.unmaskToken(submittedToken);
    if (!unmasked) return false;

    // Check global token match
    if (this.secureCompare(unmasked, realToken)) return true;

    // Check per-form token if enabled
    if (this.perFormTokens && options?.actionPath && options?.method) {
      const normalizedPath = this.normalizePath(options.actionPath);
      const normalizedMethod = options.method.toUpperCase();
      const message = `${normalizedPath}#${normalizedMethod}`;
      const hmac = createHmac("sha256", realToken).update(message).digest();
      const expectedPerForm = hmac.subarray(0, AUTHENTICITY_TOKEN_LENGTH).toString("base64");
      if (this.secureCompare(unmasked, expectedPerForm)) return true;
    }

    return false;
  }

  /** Check if a request method requires CSRF verification. */
  requiresVerification(method: string): boolean {
    return this.protectedMethods.has(method.toUpperCase());
  }

  /** Verify the Origin header if origin checking is enabled. */
  verifyOrigin(origin: string | null | undefined, host: string): boolean {
    if (!this.originCheck) return true;
    if (!origin) return true; // No origin header = same-origin
    if (origin === "null") return false; // Null origin is suspicious

    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.host;

      // Check if origin matches request host
      if (originHost === host) return true;

      // Check allowed origins
      for (const allowed of this.allowedOrigins) {
        if (originHost === allowed) return true;
        // Support scheme://host format
        try {
          const allowedUrl = new URL(allowed);
          if (originHost === allowedUrl.host) return true;
        } catch {
          // Not a URL, treat as hostname
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Full verification: check origin + token.
   * Returns true if the request is verified, false otherwise.
   */
  verifyRequest(params: {
    method: string;
    session: Record<string, unknown>;
    token?: string | null;
    origin?: string | null;
    host: string;
    actionPath?: string;
  }): { verified: boolean; warning?: string } {
    const { method, session, token, origin, host, actionPath } = params;

    // Safe methods don't need verification
    if (!this.requiresVerification(method)) {
      return { verified: true };
    }

    // Check origin
    if (!this.verifyOrigin(origin, host)) {
      return {
        verified: false,
        warning: this.logging
          ? `HTTP Origin header (${origin}) didn't match request.base_url (${host})`
          : undefined,
      };
    }

    // Check token
    if (!this.verifyToken(session, token, { actionPath, method })) {
      return {
        verified: false,
        warning: this.logging
          ? "Can't verify CSRF token authenticity."
          : undefined,
      };
    }

    return { verified: true };
  }

  /**
   * Handle a failed verification according to the configured strategy.
   * Throws InvalidAuthenticityToken for "exception" strategy.
   */
  handleUnverified(session: Record<string, unknown>): void {
    switch (this.strategy) {
      case "exception":
        throw new InvalidAuthenticityToken();
      case "reset_session":
        // Clear the session
        for (const key of Object.keys(session)) {
          delete session[key];
        }
        break;
      case "null_session":
        // Return a null session (caller should use an empty proxy)
        break;
    }
  }

  /** Get the form parameter name for the CSRF token. */
  get formParamName(): string {
    return this.paramName;
  }

  /** Get the header name for the CSRF token. */
  get headerName(): string {
    return CSRF_TOKEN_HEADER;
  }

  /** Get the session key used to store the CSRF token. */
  get tokenSessionKey(): string {
    return this.sessionKey;
  }

  /** Generate a meta tag value for embedding in HTML. */
  csrfMetaTag(session: Record<string, unknown>): { param: string; token: string } {
    const realToken = this.getRealToken(session);
    return {
      param: this.paramName,
      token: this.maskToken(realToken),
    };
  }

  /** Reset the CSRF token (generates a new one). */
  resetToken(session: Record<string, unknown>): string {
    delete session[this.sessionKey];
    return this.getRealToken(session);
  }

  private normalizePath(path: string): string {
    // Remove query string and fragment
    let normalized = path.split("?")[0].split("#")[0];
    // Remove trailing slash (but keep root /)
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized || "/";
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
      result |= bufA[i] ^ bufB[i];
    }
    return result === 0;
  }
}
