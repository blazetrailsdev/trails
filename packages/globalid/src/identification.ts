import { GlobalID, type GlobalIDModel, type GlobalIDOptions } from "./global-id.js";
import { SignedGlobalID, type SignedGlobalIDOptions } from "./signed-global-id.js";

/**
 * Mirrors: GlobalID::Identification module — methods are mixed onto any
 * model class with a `find(id)` class method (Active Record in our case).
 *
 * These are `this`-typed functions so the host class assigns them to its
 * prototype; see CLAUDE.md for the mixin pattern.
 */

/** Mirrors: Identification#to_global_id */
export function toGlobalId(this: GlobalIDModel, options: GlobalIDOptions = {}): GlobalID {
  return GlobalID.create(this, options);
}

/** Alias of toGlobalId. Mirrors: Identification#to_gid */
export const toGid = toGlobalId;

/** Mirrors: Identification#to_gid_param */
export function toGidParam(this: GlobalIDModel, options: GlobalIDOptions = {}): string {
  return GlobalID.create(this, options).toParam();
}

/** Mirrors: Identification#to_signed_global_id */
export function toSignedGlobalId(
  this: GlobalIDModel,
  options: SignedGlobalIDOptions,
): SignedGlobalID {
  return SignedGlobalID.create(this, options);
}

/** Alias of toSignedGlobalId. Mirrors: Identification#to_sgid */
export const toSgid = toSignedGlobalId;

/** Mirrors: Identification#to_sgid_param */
export function toSgidParam(this: GlobalIDModel, options: SignedGlobalIDOptions): string {
  return SignedGlobalID.create(this, options).toParam();
}
