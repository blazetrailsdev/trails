import type { Base } from "./base.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { underscore } from "@blazetrails/activesupport";

/**
 * Signed ID generation and lookup for ActiveRecord models.
 * Uses ActiveSupport::MessageVerifier with HMAC-SHA256 for
 * tamper-proof, optionally expiring, purpose-scoped tokens.
 *
 * Mirrors: ActiveRecord::SignedId
 */

let _signedIdVerifierSecret: string | (() => string) | null = null;
const _cachedVerifierClasses = new Set<any>();

/**
 * Set the secret used for signed ID verification.
 * Clears any cached verifiers so they pick up the new secret.
 *
 * Mirrors: ActiveRecord::Base.signed_id_verifier_secret=
 */
export function setSignedIdVerifierSecret(secret: string | (() => string)): void {
  _signedIdVerifierSecret = secret;
  for (const cls of _cachedVerifierClasses) {
    cls._signedIdVerifier = null;
  }
  _cachedVerifierClasses.clear();
}

/**
 * Get or create the MessageVerifier instance for signed IDs.
 * Uses SHA256 digest, JSON serializer, URL-safe encoding.
 *
 * Mirrors: ActiveRecord::SignedId::ClassMethods#signed_id_verifier
 */
export function signedIdVerifier(modelClass: typeof Base): MessageVerifier {
  if ((modelClass as any)._signedIdVerifier) {
    return (modelClass as any)._signedIdVerifier;
  }

  const secret = _signedIdVerifierSecret;
  if (!secret) {
    throw new Error(
      "You must configure a signed ID verifier secret before using signed IDs. " +
        "Call setSignedIdVerifierSecret('your-secret-key') before generating or verifying signed IDs.",
    );
  }

  const resolvedSecret = typeof secret === "function" ? secret() : secret;
  const verifier = new MessageVerifier(resolvedSecret, {
    digest: "sha256",
    url_safe: true,
  });
  (modelClass as any)._signedIdVerifier = verifier;
  _cachedVerifierClasses.add(modelClass);
  return verifier;
}

/**
 * Set a custom verifier for signed IDs on a model class.
 *
 * Mirrors: ActiveRecord::SignedId::ClassMethods#signed_id_verifier=
 */
export function setSignedIdVerifier(modelClass: typeof Base, verifier: MessageVerifier): void {
  (modelClass as any)._signedIdVerifier = verifier;
}

function combinePurposes(modelClass: typeof Base, purpose?: string): string | undefined {
  const combined = combineSignedIdPurposes(modelClass, purpose);
  return combined || undefined;
}

/**
 * Generate a signed ID for a persisted record.
 * The token is HMAC-signed and tamper-proof.
 *
 * Mirrors: ActiveRecord::SignedId#signed_id
 */
export function signedId(
  instance: Base,
  options?: { purpose?: string; expiresIn?: number; expiresAt?: Date },
): string {
  if (!instance.isPersisted()) {
    throw new Error("Cannot generate a signed_id for a new record");
  }
  const ctor = instance.constructor as typeof Base;
  const verifier = signedIdVerifier(ctor);
  return verifier.generate(instance.id, {
    expiresIn: options?.expiresIn,
    expiresAt: options?.expiresAt,
    purpose: combinePurposes(ctor, options?.purpose),
  });
}

/**
 * Find a record by its signed ID, or return null.
 * Returns null if the signature is invalid, expired, or purpose mismatches.
 *
 * Mirrors: ActiveRecord::SignedId::ClassMethods#find_signed
 */
export async function findSigned<T extends typeof Base>(
  modelClass: T,
  token: string,
  options?: { purpose?: string },
): Promise<InstanceType<T> | null> {
  const verifier = signedIdVerifier(modelClass);
  const id = verifier.verified(token, {
    purpose: combinePurposes(modelClass, options?.purpose),
  });
  if (id === null) return null;
  const pk = modelClass.primaryKey;
  if (Array.isArray(pk)) {
    const conditions: Record<string, unknown> = {};
    (pk as string[]).forEach((col, i) => {
      conditions[col] = (id as unknown[])[i];
    });
    return modelClass.findBy(conditions);
  }
  return modelClass.findBy({ [pk as string]: id });
}

/**
 * Find a record by its signed ID, or throw.
 * Throws InvalidSignature if tampered/expired, RecordNotFound if not found.
 *
 * Mirrors: ActiveRecord::SignedId::ClassMethods#find_signed!
 */
export async function findSignedBang<T extends typeof Base>(
  modelClass: T,
  token: string,
  options?: { purpose?: string },
): Promise<InstanceType<T>> {
  const verifier = signedIdVerifier(modelClass);
  const id = verifier.verify(token, {
    purpose: combinePurposes(modelClass, options?.purpose),
  });
  return modelClass.find(id);
}

/**
 * Mirrors: ActiveRecord::SignedId::ClassMethods#combine_signed_id_purposes
 */
export function combineSignedIdPurposes(modelClass: typeof Base, purpose?: string): string {
  // Rails: base_class.name.underscore
  const base = (modelClass as any).baseClass ?? modelClass;
  const parts = [underscore(base.name)];
  if (purpose) parts.push(String(purpose));
  return parts.filter(Boolean).join("/");
}
