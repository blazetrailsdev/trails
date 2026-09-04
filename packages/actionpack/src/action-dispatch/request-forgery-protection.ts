import type { Session } from "./request/session.js";

import { OpenSSL, SecureRandom, type Bytes } from "@blazetrails/ruby-compat";

const AUTHENTICITY_TOKEN_LENGTH = 32;
const CSRF_TOKEN_HEADER = "X-CSRF-Token";

export type CsrfStrategy = "exception" | "reset_session" | "null_session";

export interface CsrfOptions {
  strategy?: CsrfStrategy;
  sessionKey?: string;
  paramName?: string;
  protectedMethods?: Set<string>;
  originCheck?: boolean;
  allowedOrigins?: string[];
  logging?: boolean;
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

  static generateToken(): string {
    return SecureRandom.randomBytes(AUTHENTICITY_TOKEN_LENGTH).toString("base64");
  }

  getRealToken(session: Session): string {
    let token = session.get(this.sessionKey) as string | undefined;
    if (!token) {
      token = RequestForgeryProtection.generateToken();
      session.set(this.sessionKey, token);
    }
    return token;
  }

  maskToken(rawToken: string): string {
    const tokenBytes = Buffer.from(rawToken, "base64");
    const otp = Buffer.from(SecureRandom.randomBytes(AUTHENTICITY_TOKEN_LENGTH));
    const masked = Buffer.alloc(AUTHENTICITY_TOKEN_LENGTH * 2);
    otp.copy(masked, 0);
    for (let i = 0; i < AUTHENTICITY_TOKEN_LENGTH; i++) {
      masked[AUTHENTICITY_TOKEN_LENGTH + i] = tokenBytes[i] ^ otp[i];
    }
    return masked.toString("base64");
  }

  generatePerFormToken(session: Session, actionPath: string, method: string): string {
    const realToken = this.getRealToken(session);
    const normalizedPath = this.normalizePath(actionPath);
    const normalizedMethod = method.toUpperCase();
    const message = `${normalizedPath}#${normalizedMethod}`;
    const hmac = OpenSSL.HMAC.digest("SHA256", realToken, message);
    const perFormToken = (hmac.subarray(0, AUTHENTICITY_TOKEN_LENGTH) as Bytes).toString("base64");
    return this.maskToken(perFormToken);
  }

  unmaskToken(maskedToken: string): string {
    const decoded = Buffer.from(maskedToken, "base64");
    if (decoded.length === AUTHENTICITY_TOKEN_LENGTH) {
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

  verifyToken(
    session: Session,
    submittedToken: string | null | undefined,
    options?: { actionPath?: string; method?: string },
  ): boolean {
    if (!submittedToken || submittedToken.length === 0) return false;

    const realToken = session.get(this.sessionKey) as string | undefined;
    if (!realToken) return false;

    const unmasked = this.unmaskToken(submittedToken);
    if (!unmasked) return false;

    if (this.secureCompare(unmasked, realToken)) return true;

    if (this.perFormTokens && options?.actionPath && options?.method) {
      const normalizedPath = this.normalizePath(options.actionPath);
      const normalizedMethod = options.method.toUpperCase();
      const message = `${normalizedPath}#${normalizedMethod}`;
      const hmac = OpenSSL.HMAC.digest("SHA256", realToken, message);
      const expectedPerForm = (hmac.subarray(0, AUTHENTICITY_TOKEN_LENGTH) as Bytes).toString(
        "base64",
      );
      if (this.secureCompare(unmasked, expectedPerForm)) return true;
    }

    return false;
  }

  requiresVerification(method: string): boolean {
    return this.protectedMethods.has(method.toUpperCase());
  }

  verifyOrigin(origin: string | null | undefined, host: string): boolean {
    if (!this.originCheck) return true;
    if (!origin) return true;
    if (origin === "null") return false;

    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.host;

      if (originHost === host) return true;

      for (const allowed of this.allowedOrigins) {
        if (originHost === allowed) return true;
        try {
          const allowedUrl = new URL(allowed);
          if (originHost === allowedUrl.host) return true;
        } catch {
          /** @empty */
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  verifyRequest(params: {
    method: string;
    session: Session;
    token?: string | null;
    origin?: string | null;
    host: string;
    actionPath?: string;
  }): { verified: boolean; warning?: string } {
    const { method, session, token, origin, host, actionPath } = params;

    if (!this.requiresVerification(method)) {
      return { verified: true };
    }

    if (!this.verifyOrigin(origin, host)) {
      return {
        verified: false,
        warning: this.logging
          ? `HTTP Origin header (${origin}) didn't match request.base_url (${host})`
          : undefined,
      };
    }

    if (!this.verifyToken(session, token, { actionPath, method })) {
      return {
        verified: false,
        warning: this.logging ? "Can't verify CSRF token authenticity." : undefined,
      };
    }

    return { verified: true };
  }

  handleUnverified(session: Session): void {
    switch (this.strategy) {
      case "exception":
        throw new InvalidAuthenticityToken();
      case "reset_session":
        session.clear();
        break;
      case "null_session":
        break;
    }
  }

  get formParamName(): string {
    return this.paramName;
  }

  get headerName(): string {
    return CSRF_TOKEN_HEADER;
  }

  get tokenSessionKey(): string {
    return this.sessionKey;
  }

  csrfMetaTag(session: Session): { param: string; token: string } {
    const realToken = this.getRealToken(session);
    return {
      param: this.paramName,
      token: this.maskToken(realToken),
    };
  }

  resetToken(session: Session): string {
    session.delete(this.sessionKey);
    return this.getRealToken(session);
  }

  private normalizePath(path: string): string {
    if (/^https?:\/\/|^\/\//i.test(path)) {
      try {
        path = new URL(/^\/\//.test(path) ? `https:${path}` : path).pathname;
      } catch {
        /** @empty */
      }
    }
    let normalized = path.split("?")[0].split("#")[0];
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
