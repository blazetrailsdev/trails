/**
 * ActionController::HttpAuthentication
 *
 * HTTP Basic, Digest, and Token authentication helpers.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

// =============================================================================
// Basic Authentication
// =============================================================================

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

export const BasicAuth = {
  /** Decode a Basic auth header value. */
  decode(authHeader: string): BasicAuthCredentials | null {
    const match = authHeader.match(/^Basic\s+(.+)$/i);
    if (!match) return null;
    try {
      const decoded = Buffer.from(match[1], "base64").toString("utf-8");
      const colonIdx = decoded.indexOf(":");
      if (colonIdx === -1) return null;
      return {
        username: decoded.slice(0, colonIdx),
        password: decoded.slice(colonIdx + 1),
      };
    } catch {
      return null;
    }
  },

  /** Encode credentials into a Basic auth header value. */
  encode(username: string, password: string): string {
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  },

  /** Check if the authorization header contains Basic credentials. */
  hasBasicCredentials(authHeader: string | undefined): boolean {
    return !!authHeader && /^Basic\s/i.test(authHeader);
  },

  /** Authenticate using a callback. Returns true if authenticated. */
  authenticate(
    authHeader: string | undefined,
    verify: (username: string, password: string) => boolean
  ): boolean {
    if (!authHeader) return false;
    const creds = BasicAuth.decode(authHeader);
    if (!creds) return false;
    return verify(creds.username, creds.password);
  },

  /** Build a 401 response with WWW-Authenticate header. */
  challengeResponse(realm = "Application"): [number, Record<string, string>, string] {
    return [
      401,
      {
        "content-type": "text/plain",
        "www-authenticate": `Basic realm="${realm}"`,
      },
      "HTTP Basic: Access denied.\n",
    ];
  },
};

// =============================================================================
// Token Authentication
// =============================================================================

export interface TokenAuthCredentials {
  token: string;
  options: Record<string, string>;
}

export const TokenAuth = {
  /** Parse a Token auth header value. */
  decode(authHeader: string): TokenAuthCredentials | null {
    const match = authHeader.match(/^Token\s+(.+)$/i);
    if (!match) return null;

    const params = match[1];
    const options: Record<string, string> = {};
    let token = "";

    // Parse key=value pairs
    const parts = params.split(",").map((s) => s.trim());
    for (const part of parts) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      let value = part.slice(eqIdx + 1).trim();
      // Remove surrounding quotes
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (key === "token") {
        token = value;
      } else {
        options[key] = value;
      }
    }

    if (!token) return null;
    return { token, options };
  },

  /** Encode a token into a Token auth header value. */
  encode(token: string, options: Record<string, string> = {}): string {
    const parts = [`token="${token}"`];
    for (const [key, value] of Object.entries(options)) {
      parts.push(`${key}="${value}"`);
    }
    return `Token ${parts.join(", ")}`;
  },

  /** Check if the authorization header contains Token credentials. */
  hasTokenCredentials(authHeader: string | undefined): boolean {
    return !!authHeader && /^Token\s/i.test(authHeader);
  },

  /** Authenticate using a callback. Returns true if authenticated. */
  authenticate(
    authHeader: string | undefined,
    verify: (token: string, options: Record<string, string>) => boolean
  ): boolean {
    if (!authHeader) return false;
    const creds = TokenAuth.decode(authHeader);
    if (!creds) return false;
    return verify(creds.token, creds.options);
  },

  /** Build a 401 response with WWW-Authenticate header. */
  challengeResponse(realm = "Application"): [number, Record<string, string>, string] {
    return [
      401,
      {
        "content-type": "text/plain",
        "www-authenticate": `Token realm="${realm}"`,
      },
      "HTTP Token: Access denied.\n",
    ];
  },
};

// =============================================================================
// Digest Authentication
// =============================================================================

export interface DigestAuthParams {
  realm: string;
  nonce: string;
  opaque: string;
  qop?: string;
  uri: string;
  nc: string;
  cnonce: string;
  response: string;
  username: string;
}

export const DigestAuth = {
  /** Parse a Digest auth header value. */
  decode(authHeader: string): DigestAuthParams | null {
    const match = authHeader.match(/^Digest\s+(.+)$/i);
    if (!match) return null;

    const params: Record<string, string> = {};
    const paramStr = match[1];
    // Match key=value or key="value" pairs
    const regex = /(\w+)=(?:"([^"]*)"|([\w]+))/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(paramStr)) !== null) {
      params[m[1]] = m[2] ?? m[3];
    }

    if (!params.username || !params.response) return null;
    return {
      realm: params.realm ?? "",
      nonce: params.nonce ?? "",
      opaque: params.opaque ?? "",
      qop: params.qop,
      uri: params.uri ?? "",
      nc: params.nc ?? "",
      cnonce: params.cnonce ?? "",
      response: params.response,
      username: params.username,
    };
  },

  /** Generate a nonce for digest auth. */
  generateNonce(secret: string): string {
    const timestamp = Date.now().toString();
    const hash = createHmac("sha256", secret).update(timestamp).digest("hex");
    return Buffer.from(`${timestamp}:${hash}`).toString("base64");
  },

  /** Validate a nonce. */
  validateNonce(nonce: string, secret: string, maxAge = 300000): boolean {
    try {
      const decoded = Buffer.from(nonce, "base64").toString("utf-8");
      const [timestamp, hash] = decoded.split(":");
      if (!timestamp || !hash) return false;
      const expected = createHmac("sha256", secret).update(timestamp).digest("hex");
      if (!timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return false;
      const age = Date.now() - parseInt(timestamp, 10);
      return age >= 0 && age < maxAge;
    } catch {
      return false;
    }
  },

  /** Calculate the expected digest response. */
  expectedResponse(
    method: string,
    uri: string,
    ha1: string,
    params: { nonce: string; nc: string; cnonce: string; qop?: string }
  ): string {
    const ha2 = createHash("md5").update(`${method}:${uri}`).digest("hex");
    let responseStr: string;
    if (params.qop === "auth") {
      responseStr = `${ha1}:${params.nonce}:${params.nc}:${params.cnonce}:${params.qop}:${ha2}`;
    } else {
      responseStr = `${ha1}:${params.nonce}:${ha2}`;
    }
    return createHash("md5").update(responseStr).digest("hex");
  },

  /** Calculate HA1 for a user. */
  ha1(username: string, realm: string, password: string): string {
    return createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
  },

  /** Check if the authorization header contains Digest credentials. */
  hasDigestCredentials(authHeader: string | undefined): boolean {
    return !!authHeader && /^Digest\s/i.test(authHeader);
  },

  /** Build a 401 Digest challenge response. */
  challengeResponse(
    realm: string,
    secret: string,
    options: { qop?: string; opaque?: string } = {}
  ): [number, Record<string, string>, string] {
    const nonce = DigestAuth.generateNonce(secret);
    const opaque = options.opaque ?? randomBytes(16).toString("hex");
    const qop = options.qop ?? "auth";
    return [
      401,
      {
        "content-type": "text/plain",
        "www-authenticate": `Digest realm="${realm}", nonce="${nonce}", opaque="${opaque}", qop="${qop}"`,
      },
      "HTTP Digest: Access denied.\n",
    ];
  },
};
