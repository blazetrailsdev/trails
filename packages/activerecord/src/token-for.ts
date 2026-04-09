/**
 * Token generation and resolution for model records.
 *
 * Mirrors: ActiveRecord::TokenFor
 */

import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import type { Base } from "./base.js";

export { InvalidSignature };

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
  /** Expiration in seconds, matching Rails Duration semantics. */
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
    return new MessageVerifier(resolveSecret());
  }

  payloadFor(model: Base): unknown[] {
    return this.block ? [model.id, this.block(model)] : [model.id];
  }

  generateToken(model: Base): string {
    const data = this.payloadFor(model);
    return this.messageVerifier().generate(data, {
      purpose: this.fullPurpose(),
      expiresIn: this.expiresIn,
    });
  }

  async resolveToken(
    token: string,
    finder: (id: unknown) => Promise<Base | null>,
  ): Promise<Base | null> {
    const verified = this.messageVerifier().verified(token, { purpose: this.fullPurpose() });
    const payload = Array.isArray(verified) && verified.length > 0 ? verified : null;
    const record = payload ? await finder(payload[0]) : null;
    return record && JSON.stringify(this.payloadFor(record)) === JSON.stringify(payload)
      ? record
      : null;
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
  const pk = modelClass.primaryKey;
  return def.resolveToken(token, async (id) => {
    if (typeof pk === "string") {
      return modelClass.findBy({ [pk]: id });
    }
    if (!Array.isArray(id) || id.length !== pk.length) return null;
    const conditions = Object.fromEntries(pk.map((key, i) => [key, id[i]]));
    return modelClass.findBy(conditions);
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
  const def = getDefinition(modelClass, purpose);
  if (!def) throw new InvalidSignature();
  const result = await def.resolveToken(token, (id) => modelClass.find(id));
  if (!result) throw new InvalidSignature();
  return result;
}
