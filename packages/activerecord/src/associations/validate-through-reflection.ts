import type { Base } from "../base.js";

/**
 * Per-reflection memoization keys. Cache both success and failure:
 * success short-circuits subsequent calls; a cached error re-throws
 * on every call so a caller that catches the validation error can't
 * inadvertently sneak past it on a retry.
 */
const CHECKED_OK = Symbol("ThroughReflection.checkedValidityOk");
const CHECKED_ERROR = Symbol("ThroughReflection.checkedValidityError");

/**
 * Run `ThroughReflection#checkValidityBang` at first use (Rails-
 * faithful: Rails' `Association#initialize` calls the same check).
 * Every Rails-named misconfiguration propagates — polymorphic
 * source without `source_type`, `source_type` without polymorphic
 * source, polymorphic-through, missing source, has-one through a
 * has-many collection, out-of-order reflection declaration, and
 * inverse-of misses.
 *
 * Called from `Association#constructor`, the top-level
 * `association(record, name)`, and the DJAS / JOIN-based loaders
 * so every entry point surfaces the error loudly. Memoized on the
 * reflection via a module-private symbol (per-instance; a
 * misconfiguration is stable until the reflection changes).
 *
 * Mirrors: `ActiveRecord::Reflection::ThroughReflection#check_validity!`
 * (activerecord/lib/active_record/reflection.rb:1140-1178).
 */
export function validateThroughReflection(modelClass: typeof Base, assocName: string): void {
  const full = (
    modelClass as unknown as { _reflectOnAssociation?: (n: string) => unknown }
  )._reflectOnAssociation?.(assocName);
  const refl = full as
    | {
        isThroughReflection?: () => boolean;
        checkValidityBang?: () => void;
        [CHECKED_OK]?: boolean;
        [CHECKED_ERROR]?: unknown;
      }
    | null
    | undefined;
  if (!refl) return;
  // Re-throw a previously-cached validation error so a caller that
  // catches it can't sneak past validation on a retry.
  if (refl[CHECKED_ERROR] !== undefined) throw refl[CHECKED_ERROR];
  if (refl[CHECKED_OK]) return;
  // `AbstractReflection#checkValidityBang` (reflection.ts:743) only
  // runs the inverse-of check; the broader Rails-named errors live
  // on `ThroughReflection#checkValidityBang` (reflection.ts:1281).
  // Gate on `isThroughReflection` so non-through associations
  // aren't put through the through-only checks here. The narrower
  // inverse-of-only check fires elsewhere on its own schedule.
  const isThrough = typeof refl.isThroughReflection === "function" && refl.isThroughReflection();
  if (!isThrough || typeof refl.checkValidityBang !== "function") return;

  // Delegate to `ThroughReflection#checkValidityBang`. Cache the
  // outcome on the reflection: success short-circuits future calls;
  // failure stashes the error and re-throws on every call so a
  // misconfiguration always surfaces, even after a catch.
  try {
    refl.checkValidityBang();
    refl[CHECKED_OK] = true;
  } catch (err) {
    refl[CHECKED_ERROR] = err;
    throw err;
  }
}
