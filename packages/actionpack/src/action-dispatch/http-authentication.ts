import { getCrypto, OpenSSL, SecureRandom } from "@blazetrails/ruby-compat";

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

export const BasicAuth = {
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

  encode(username: string, password: string): string {
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  },

  hasBasicCredentials(authHeader: string | undefined): boolean {
    return !!authHeader && /^Basic\s/i.test(authHeader);
  },

  authenticate(
    authHeader: string | undefined,
    verify: (username: string, password: string) => boolean,
  ): boolean {
    if (!authHeader) return false;
    const creds = BasicAuth.decode(authHeader);
    if (!creds) return false;
    return verify(creds.username, creds.password);
  },

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

export interface TokenAuthCredentials {
  token: string;
  options: Record<string, string>;
}

export const TokenAuth = {
  decode(authHeader: string): TokenAuthCredentials | null {
    const match = authHeader.match(/^Token\s+(.+)$/i);
    if (!match) return null;

    const params = match[1];
    const options: Record<string, string> = {};
    let token = "";

    const parts = params.split(",").map((s) => s.trim());
    for (const part of parts) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      let value = part.slice(eqIdx + 1).trim();
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

  encode(token: string, options: Record<string, string> = {}): string {
    const parts = [`token="${token}"`];
    for (const [key, value] of Object.entries(options)) {
      parts.push(`${key}="${value}"`);
    }
    return `Token ${parts.join(", ")}`;
  },

  hasTokenCredentials(authHeader: string | undefined): boolean {
    return !!authHeader && /^Token\s/i.test(authHeader);
  },

  authenticate(
    authHeader: string | undefined,
    verify: (token: string, options: Record<string, string>) => boolean,
  ): boolean {
    if (!authHeader) return false;
    const creds = TokenAuth.decode(authHeader);
    if (!creds) return false;
    return verify(creds.token, creds.options);
  },

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
  decode(authHeader: string): DigestAuthParams | null {
    const match = authHeader.match(/^Digest\s+(.+)$/i);
    if (!match) return null;

    const params: Record<string, string> = {};
    const paramStr = match[1];
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

  generateNonce(secret: string): string {
    const crypto = getCrypto();
    const timestamp = Date.now().toString();
    const hash = crypto.createHmac("sha256", secret).update(timestamp).digest("hex");
    return Buffer.from(`${timestamp}:${hash}`).toString("base64");
  },

  validateNonce(nonce: string, secret: string, maxAge = 300000): boolean {
    try {
      const decoded = Buffer.from(nonce, "base64").toString("utf-8");
      const [timestamp, hash] = decoded.split(":");
      if (!timestamp || !hash) return false;
      const crypto = getCrypto();
      const expected = crypto.createHmac("sha256", secret).update(timestamp).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return false;
      const age = Date.now() - parseInt(timestamp, 10);
      return age >= 0 && age < maxAge;
    } catch {
      return false;
    }
  },

  expectedResponse(
    method: string,
    uri: string,
    ha1: string,
    params: { nonce: string; nc: string; cnonce: string; qop?: string },
  ): string {
    const crypto = getCrypto();
    const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");
    let responseStr: string;
    if (params.qop === "auth") {
      responseStr = `${ha1}:${params.nonce}:${params.nc}:${params.cnonce}:${params.qop}:${ha2}`;
    } else {
      responseStr = `${ha1}:${params.nonce}:${ha2}`;
    }
    return crypto.createHash("md5").update(responseStr).digest("hex");
  },

  ha1(username: string, realm: string, password: string): string {
    return OpenSSL.Digest.MD5.hexdigest(`${username}:${realm}:${password}`);
  },

  hasDigestCredentials(authHeader: string | undefined): boolean {
    return !!authHeader && /^Digest\s/i.test(authHeader);
  },

  challengeResponse(
    realm: string,
    secret: string,
    options: { qop?: string; opaque?: string } = {},
  ): [number, Record<string, string>, string] {
    const nonce = DigestAuth.generateNonce(secret);
    const opaque = options.opaque ?? SecureRandom.hex(16);
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
