import { createHmac } from "node:crypto";
import type { Base } from "./base.js";

/**
 * Registry of token purposes per model class.
 */
const tokenPurposes = new WeakMap<
  object,
  Map<string, { expiresIn?: number; generator: (record: any) => string }>
>();

/**
 * Declare a token purpose on a model class.
 *
 * The generator function produces a digest that is embedded in the token.
 * When resolving, the digest is re-computed and compared — if the record
 * changed (e.g. password was reset), the token becomes invalid.
 *
 * Mirrors: ActiveRecord::Base.generates_token_for
 *
 * Usage:
 *   generatesTokenFor(User, "password_reset", {
 *     expiresIn: 15 * 60 * 1000,  // 15 minutes
 *     generator: (record) => record.readAttribute("password_digest"),
 *   });
 *
 * Then:
 *   user.generateTokenFor("password_reset")
 *   User.findByTokenFor("password_reset", token)
 */
export function generatesTokenFor(
  modelClass: typeof Base,
  purpose: string,
  options: {
    expiresIn?: number;
    generator?: (record: any) => string;
  } = {}
): void {
  if (!tokenPurposes.has(modelClass)) {
    tokenPurposes.set(modelClass, new Map());
  }
  const map = tokenPurposes.get(modelClass)!;
  map.set(purpose, {
    expiresIn: options.expiresIn,
    generator: options.generator ?? (() => ""),
  });

  // Add instance method: generateTokenFor(purpose)
  if (!(modelClass.prototype as any).generateTokenFor) {
    Object.defineProperty(modelClass.prototype, "generateTokenFor", {
      value: function (this: Base, purposeName: string): string {
        return _generateToken(this, purposeName);
      },
      writable: true,
      configurable: true,
    });
  }

  // Add static method: findByTokenFor(purpose, token)
  if (!(modelClass as any).findByTokenFor) {
    Object.defineProperty(modelClass, "findByTokenFor", {
      value: async function (
        this: typeof Base,
        purposeName: string,
        token: string
      ): Promise<Base | null> {
        return _findByToken(this, purposeName, token);
      },
      writable: true,
      configurable: true,
    });
  }

  // Add static method: findByTokenForBang(purpose, token)
  if (!(modelClass as any).findByTokenForBang) {
    Object.defineProperty(modelClass, "findByTokenForBang", {
      value: async function (
        this: typeof Base,
        purposeName: string,
        token: string
      ): Promise<Base> {
        const record = await _findByToken(this, purposeName, token);
        if (!record) {
          const { RecordNotFound } = await import("./errors.js");
          throw new RecordNotFound(`Couldn't find record for token purpose: ${purposeName}`);
        }
        return record;
      },
      writable: true,
      configurable: true,
    });
  }
}

const SECRET = "rails-ts-token-secret";

function _generateToken(record: Base, purpose: string): string {
  const config = _getConfig(record.constructor as typeof Base, purpose);
  if (!config) throw new Error(`Unknown token purpose: ${purpose}`);

  const digest = config.generator(record);
  const pk = (record as any).id;
  const timestamp = Date.now();
  const payload = JSON.stringify({ pk, purpose, digest, timestamp });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

async function _findByToken(
  modelClass: typeof Base,
  purpose: string,
  token: string
): Promise<Base | null> {
  const config = _getConfig(modelClass, purpose);
  if (!config) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  // Verify signature
  const expectedSig = createHmac("sha256", SECRET)
    .update(encoded)
    .digest("base64url");
  if (sig !== expectedSig) return null;

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return null;
  }

  if (payload.purpose !== purpose) return null;

  // Check expiration
  if (config.expiresIn && Date.now() - payload.timestamp > config.expiresIn) {
    return null;
  }

  // Find the record
  try {
    const record = await modelClass.find(payload.pk);
    // Verify digest matches (record hasn't changed)
    const currentDigest = config.generator(record);
    if (currentDigest !== payload.digest) return null;
    return record;
  } catch {
    return null;
  }
}

function _getConfig(
  modelClass: typeof Base,
  purpose: string
): { expiresIn?: number; generator: (record: any) => string } | undefined {
  let current: any = modelClass;
  while (current) {
    const map = tokenPurposes.get(current);
    if (map?.has(purpose)) return map.get(purpose);
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}
