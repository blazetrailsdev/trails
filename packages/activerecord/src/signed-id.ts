import type { Base } from "./base.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { JSON, underscore } from "@blazetrails/activesupport";
import type { Temporal } from "@blazetrails/date";
import { UnknownPrimaryKey } from "./errors.js";

class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

let _signedIdVerifierSecret: string | (() => string | null | undefined) | null = null;

export class ClassMethods {
  static get signedIdVerifierSecret(): string | (() => string | null | undefined) | null {
    return _signedIdVerifierSecret;
  }

  static set signedIdVerifierSecret(value: string | (() => string | null | undefined) | null) {
    _signedIdVerifierSecret = value;
  }

  static get signedIdVerifier(): MessageVerifier {
    if ((this as any)._signedIdVerifier) {
      return (this as any)._signedIdVerifier;
    }

    let secret = (this as any).signedIdVerifierSecret as
      | string
      | (() => string | null | undefined)
      | null
      | undefined;
    if (typeof secret === "function") secret = secret();
    if (secret == null) {
      throw new ArgumentError(
        "You must set ActiveRecord::Base.signed_id_verifier_secret to use signed ids",
      );
    }

    const verifier = new MessageVerifier(secret, {
      digest: "SHA256",
      serializer: JSON,
      url_safe: true,
    });
    (this as any)._signedIdVerifier = verifier;
    return verifier;
  }

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

export function signedId(
  instance: Base,
  options?: { purpose?: string; expiresIn?: number; expiresAt?: Temporal.Instant },
): string {
  if (!instance.isPersisted()) {
    throw new Error("Cannot get a signed_id for a new record");
  }
  const ctor = instance.constructor as typeof Base;
  const verifier = ctor.signedIdVerifier;
  const coerce = (v: unknown): unknown =>
    Array.isArray(v) ? (v as unknown[]).map(coerce) : typeof v === "bigint" ? Number(v) : v;
  return verifier.generate(coerce(instance.id), {
    expiresIn: options?.expiresIn,
    expiresAt: options?.expiresAt,
    purpose: ctor.combineSignedIdPurposes(options?.purpose) || undefined,
  });
}

export async function findSigned<T extends typeof Base>(
  this: T,
  signedId: string,
  options?: { purpose?: string },
): Promise<InstanceType<T> | null> {
  const pk = this.primaryKey;
  if (!_hasPrimaryKey(pk)) {
    throw new UnknownPrimaryKey(this);
  }
  const verifier = this.signedIdVerifier;
  const id = verifier.verified(signedId, {
    purpose: this.combineSignedIdPurposes(options?.purpose) || undefined,
  });
  if (id === null) return null;
  if (Array.isArray(pk)) {
    const conditions: Record<string, unknown> = {};
    pk.forEach((col, i) => {
      conditions[col] = (id as unknown[])[i];
    });
    return this.findBy(conditions);
  }
  return this.findBy({ [pk]: id });
}

export async function findSignedBang<T extends typeof Base>(
  this: T,
  signedId: string,
  options?: { purpose?: string },
): Promise<InstanceType<T>> {
  const verifier = this.signedIdVerifier;
  const id = verifier.verify(signedId, {
    purpose: this.combineSignedIdPurposes(options?.purpose) || undefined,
  });
  return this.find(id);
}

export function combineSignedIdPurposes(modelClass: typeof Base, purpose?: string): string {
  const base = (modelClass as any).baseClass ?? modelClass;
  const parts = [underscore(base.name)];
  if (purpose) parts.push(String(purpose));
  return parts.filter(Boolean).join("/");
}
