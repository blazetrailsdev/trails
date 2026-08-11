import type { Base } from "./base.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { underscore } from "@blazetrails/activesupport";
import type { Temporal } from "@blazetrails/date";
import { UnknownPrimaryKey } from "./errors.js";

/**
 * Signed ID generation and lookup for ActiveRecord models.
 * Uses ActiveSupport::MessageVerifier with HMAC-SHA256 for
 * tamper-proof, optionally expiring, purpose-scoped tokens.
 *
 * Mirrors: ActiveRecord::SignedId
 */

let _signedIdVerifierSecret: string | (() => string | null | undefined) | null = null;

/** Mirrors: ActiveRecord::SignedId::ClassMethods */
export class ClassMethods {
  /**
   * Rails: `class_attribute :signed_id_verifier_secret, instance_writer: false`,
   * declared in `ActiveRecord::SignedId`'s `included do` block. Trails backs it
   * with a single value — Rails only ever sets it on `ActiveRecord::Base`.
   *
   * Mirrors: ActiveRecord::SignedId#signed_id_verifier_secret
   */
  static get signedIdVerifierSecret(): string | (() => string | null | undefined) | null {
    return _signedIdVerifierSecret;
  }

  static set signedIdVerifierSecret(value: string | (() => string | null | undefined) | null) {
    _signedIdVerifierSecret = value;
  }

  /** Mirrors: ActiveRecord::SignedId::ClassMethods#signed_id_verifier */
  static get signedIdVerifier(): MessageVerifier {
    if ((this as any)._signedIdVerifier) {
      return (this as any)._signedIdVerifier;
    }

    const secret = (this as any).signedIdVerifierSecret as
      | string
      | (() => string | null | undefined)
      | null;
    const resolvedSecret = typeof secret === "function" ? secret() : secret;
    if (!resolvedSecret) {
      throw new Error(
        "You must set ActiveRecord::Base.signed_id_verifier_secret to use signed ids",
      );
    }

    const verifier = new MessageVerifier(resolvedSecret, {
      digest: "sha256",
      url_safe: true,
    });
    (this as any)._signedIdVerifier = verifier;
    return verifier;
  }

  /** Mirrors: ActiveRecord::SignedId::ClassMethods#signed_id_verifier= */
  static set signedIdVerifier(verifier: MessageVerifier) {
    (this as any)._signedIdVerifier = verifier;
  }
}

function _hasPrimaryKey(pk: unknown): boolean {
  if (pk == null) return false;
  if (Array.isArray(pk))
    return pk.length > 0 && pk.every((k) => typeof k === "string" && k.length > 0);
  return typeof pk === "string" && pk.length > 0;
}

/**
 * Generate a signed ID for a persisted record.
 * The token is HMAC-signed and tamper-proof.
 *
 * Mirrors: ActiveRecord::SignedId#signed_id
 */
export function signedId(
  instance: Base,
  options?: { purpose?: string; expiresIn?: number; expiresAt?: Temporal.Instant },
): string {
  if (!instance.isPersisted()) {
    throw new Error("Cannot get a signed_id for a new record");
  }
  const ctor = instance.constructor as typeof Base;
  const verifier = ctor.signedIdVerifier;
  // BigInt is not JSON-serializable; coerce to a plain number so the signed
  // payload round-trips (Rails signs an integer id).
  const coerce = (v: unknown): unknown =>
    Array.isArray(v) ? (v as unknown[]).map(coerce) : typeof v === "bigint" ? Number(v) : v;
  return verifier.generate(coerce(instance.id), {
    expiresIn: options?.expiresIn,
    expiresAt: options?.expiresAt,
    // `|| undefined` normalizes Rails' empty combined purpose (no purpose and
    // no `signed_id_verifier_secret` scope) to "absent" for the TS verifier.
    purpose: ctor.combineSignedIdPurposes(options?.purpose) || undefined,
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
  signedId: string,
  options?: { purpose?: string },
): Promise<InstanceType<T> | null> {
  const pk = modelClass.primaryKey;
  if (!_hasPrimaryKey(pk)) {
    throw new UnknownPrimaryKey(modelClass);
  }
  const verifier = modelClass.signedIdVerifier;
  const id = verifier.verified(signedId, {
    purpose: modelClass.combineSignedIdPurposes(options?.purpose) || undefined,
  });
  if (id === null) return null;
  if (Array.isArray(pk)) {
    const conditions: Record<string, unknown> = {};
    pk.forEach((col, i) => {
      conditions[col] = (id as unknown[])[i];
    });
    return modelClass.findBy(conditions);
  }
  return modelClass.findBy({ [pk]: id });
}

/**
 * Find a record by its signed ID, or throw.
 * Throws InvalidSignature if tampered/expired, RecordNotFound if not found.
 *
 * Mirrors: ActiveRecord::SignedId::ClassMethods#find_signed!
 */
export async function findSignedBang<T extends typeof Base>(
  modelClass: T,
  signedId: string,
  options?: { purpose?: string },
): Promise<InstanceType<T>> {
  const verifier = modelClass.signedIdVerifier;
  const id = verifier.verify(signedId, {
    purpose: modelClass.combineSignedIdPurposes(options?.purpose) || undefined,
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
