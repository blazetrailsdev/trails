/**
 * Token generation and resolution for model records.
 *
 * Mirrors: ActiveRecord::TokenFor
 */

import { getCrypto } from "@blazetrails/activesupport";
import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import type { Base } from "./base.js";

let _tokenForSecret: string | (() => string) | null = null;

/**
 * Configure the secret used for token generation/verification.
 * If not set, falls back to BLAZETRAILS_SECRET_KEY_BASE or
 * BLAZETRAILS_SIGNED_ID_SECRET env vars. Throws if no secret
 * is configured.
 */
export function setTokenForSecret(secret: string | (() => string) | null): void {
  _tokenForSecret = secret;
}

function resolveSecret(): string {
  if (_tokenForSecret) {
    return typeof _tokenForSecret === "function" ? _tokenForSecret() : _tokenForSecret;
  }
  const env = typeof process !== "undefined" ? process.env : undefined;
  const envSecret = env?.BLAZETRAILS_SECRET_KEY_BASE ?? env?.BLAZETRAILS_SIGNED_ID_SECRET;
  if (typeof envSecret === "string" && envSecret.length > 0) return envSecret;
  throw new Error(
    "TokenFor requires a configured secret. Call setTokenForSecret() " +
      "or set BLAZETRAILS_SECRET_KEY_BASE or BLAZETRAILS_SIGNED_ID_SECRET.",
  );
}

/**
 * TokenDefinition — encapsulates token behavior for a specific purpose.
 * Stores the defining class, purpose, expiration, and optional block
 * that embeds data in the token for invalidation checks.
 *
 * Mirrors: ActiveRecord::TokenFor::TokenDefinition
 */
export class TokenDefinition {
  readonly definingClass: typeof Base;
  readonly purpose: string;
  readonly expiresIn: number | undefined;
  readonly block: ((record: any) => unknown) | undefined;

  constructor(
    definingClass: typeof Base,
    purpose: string,
    expiresIn: number | undefined,
    block: ((record: any) => unknown) | undefined,
  ) {
    this.definingClass = definingClass;
    this.purpose = purpose;
    this.expiresIn = expiresIn;
    this.block = block;
  }

  fullPurpose(): string {
    return [this.definingClass.name, this.purpose, this.expiresIn ?? ""].join("\n");
  }

  messageVerifier(): MessageVerifier {
    return new MessageVerifier(resolveSecret(), { digest: "sha256" });
  }

  payloadFor(model: Base): unknown[] {
    return this.block ? [model.id, this.block(model)] : [model.id];
  }

  generateToken(model: Base): string {
    const data = this.payloadFor(model);
    const payload = JSON.stringify({
      data,
      purpose: this.fullPurpose(),
      timestamp: Date.now(),
    });
    const encoded = Buffer.from(payload).toString("base64url");
    const sig = getCrypto()
      .createHmac("sha256", resolveSecret())
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${sig}`;
  }

  async resolveToken(
    token: string,
    finder: (id: unknown) => Promise<Base | null>,
  ): Promise<Base | null> {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;

    const expectedSig = getCrypto()
      .createHmac("sha256", resolveSecret())
      .update(encoded)
      .digest("base64url");

    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!getCrypto().timingSafeEqual(sigBuf, expectedBuf)) return null;

    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    } catch {
      return null;
    }

    if (payload.purpose !== this.fullPurpose()) return null;

    if (this.expiresIn !== undefined) {
      if (!Number.isFinite(payload.timestamp)) return null;
      if (Date.now() - payload.timestamp > this.expiresIn) return null;
    }

    const data = payload.data as unknown[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const record = await finder(data[0]);
    if (!record) return null;

    const currentPayload = this.payloadFor(record);
    const a = Buffer.from(JSON.stringify(currentPayload));
    const b = Buffer.from(JSON.stringify(data));
    if (a.length !== b.length || !getCrypto().timingSafeEqual(a, b)) return null;

    return record;
  }
}

/**
 * Registry of token definitions per model class.
 */
const tokenDefinitions = new WeakMap<object, Map<string, TokenDefinition>>();

function getDefinitions(modelClass: typeof Base): Map<string, TokenDefinition> {
  if (!tokenDefinitions.has(modelClass)) {
    tokenDefinitions.set(modelClass, new Map());
  }
  return tokenDefinitions.get(modelClass)!;
}

function getDefinition(modelClass: typeof Base, purpose: string): TokenDefinition | undefined {
  let current: any = modelClass;
  while (current) {
    const map = tokenDefinitions.get(current);
    if (map?.has(purpose)) return map.get(purpose);
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * Declare a token purpose on a model class.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#generates_token_for
 */
export function generatesTokenFor(
  modelClass: typeof Base,
  purpose: string,
  options: {
    expiresIn?: number;
    generator?: (record: any) => string;
  } = {},
): void {
  const def = new TokenDefinition(modelClass, purpose, options.expiresIn, options.generator);
  getDefinitions(modelClass).set(purpose, def);

  if (!(modelClass.prototype as any).generateTokenFor) {
    Object.defineProperty(modelClass.prototype, "generateTokenFor", {
      value: function (this: Base, purposeName: string): string {
        return generateTokenFor(this, purposeName);
      },
      writable: true,
      configurable: true,
    });
  }

  if (!(modelClass as any).findByTokenFor) {
    Object.defineProperty(modelClass, "findByTokenFor", {
      value: async function (
        this: typeof Base,
        purposeName: string,
        token: string,
      ): Promise<Base | null> {
        return findByTokenFor(this, purposeName, token);
      },
      writable: true,
      configurable: true,
    });
  }

  if (!(modelClass as any).findByTokenForBang) {
    Object.defineProperty(modelClass, "findByTokenForBang", {
      value: async function (this: typeof Base, purposeName: string, token: string): Promise<Base> {
        return findByTokenForBang(this, purposeName, token);
      },
      writable: true,
      configurable: true,
    });
  }
}

/**
 * Generate a token for a record.
 *
 * Mirrors: ActiveRecord::TokenFor#generate_token_for
 */
export function generateTokenFor(record: Base, purpose: string): string {
  const def = getDefinition(record.constructor as typeof Base, purpose);
  if (!def) throw new Error(`Unknown token purpose: ${purpose}`);
  return def.generateToken(record);
}

/**
 * Find a record by token. Returns null if invalid.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for
 */
export async function findByTokenFor(
  modelClass: typeof Base,
  purpose: string,
  token: string,
): Promise<Base | null> {
  const def = getDefinition(modelClass, purpose);
  if (!def) return null;
  return def.resolveToken(token, async (id) => {
    try {
      return await modelClass.find(id);
    } catch {
      return null;
    }
  });
}

/**
 * Find a record by token. Throws if invalid.
 *
 * Mirrors: ActiveRecord::TokenFor::ClassMethods#find_by_token_for!
 */
export async function findByTokenForBang(
  modelClass: typeof Base,
  purpose: string,
  token: string,
): Promise<Base> {
  const record = await findByTokenFor(modelClass, purpose, token);
  if (!record) {
    throw new InvalidSignature();
  }
  return record;
}
