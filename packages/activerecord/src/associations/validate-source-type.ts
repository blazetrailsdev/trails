import type { Base } from "../base.js";
import {
  HasManyThroughAssociationPointlessSourceTypeError,
  HasManyThroughAssociationPolymorphicSourceError,
} from "./errors.js";

/**
 * Module-private marker: set on a reflection the first time the
 * sourceType validation succeeds, so subsequent resolutions don't
 * re-run (cheap, idempotent — safety net only).
 */
const CHECKED = Symbol("ThroughReflection.checkedSourceType");

/**
 * Validate the two sourceType-shape constraints Rails enforces in
 * `ThroughReflection#check_validity!`:
 *
 *   - polymorphic source without `source_type`
 *     → `HasManyThroughAssociationPolymorphicSourceError`
 *   - `source_type` with a non-polymorphic source
 *     → `HasManyThroughAssociationPointlessSourceTypeError`
 *
 * Either misconfiguration produces invalid SQL downstream:
 * reflection.ts#_collectJoinReflections injects a `PolymorphicReflection`
 * when `options.sourceType` is set, and its `foreignType` is `null`
 * unless the source reflection is actually polymorphic
 * (reflection.ts:544). The polymorphic-source-without-source_type
 * case has no type filter, so the chain-walker mixes ids across
 * polymorphic target tables.
 *
 * Called from `Association#constructor` (matching Rails'
 * `Association#initialize → reflection.check_validity!` hook) and
 * from `association(record, name)` so both entry points surface
 * the error loudly at first use. Results are memoized on the
 * reflection via a module-private symbol.
 *
 * Mirrors: `ActiveRecord::Reflection::ThroughReflection#check_validity!`
 * (activerecord/lib/active_record/reflection.rb:1157-1163).
 */
export function validateThroughSourceType(modelClass: typeof Base, assocName: string): void {
  const full = (
    modelClass as unknown as { _reflectOnAssociation?: (n: string) => unknown }
  )._reflectOnAssociation?.(assocName);
  const refl = full as
    | {
        isThroughReflection?: () => boolean;
        checkValidityBang?: () => void;
        [CHECKED]?: boolean;
      }
    | null
    | undefined;
  if (!refl || refl[CHECKED]) return;
  // AssociationReflection.sourceReflection returns `this`
  // (reflection.ts:793), so non-through polymorphic belongsTo would
  // misfire if we delegated without gating. ThroughReflection is
  // the only shape that needs the sourceType checks.
  const isThrough = typeof refl.isThroughReflection === "function" && refl.isThroughReflection();
  if (!isThrough || typeof refl.checkValidityBang !== "function") return;

  // Delegate to the full `ThroughReflection#checkValidityBang` so
  // the sourceType logic stays in one place (reflection.ts), but
  // only re-throw the two sourceType errors this PR targets. Other
  // checks (PolymorphicThrough, missing source, has-one-through-
  // collection) trip pre-existing test fixtures — task #23 widens
  // the set once those fixtures are addressed.
  try {
    refl.checkValidityBang();
  } catch (err) {
    if (
      err instanceof HasManyThroughAssociationPointlessSourceTypeError ||
      err instanceof HasManyThroughAssociationPolymorphicSourceError
    ) {
      throw err;
    }
    // Swallow other validity errors for now; once task #23 widens
    // the check, all errors propagate and this `catch` goes away.
    // Mark as checked even on swallow so a static misconfiguration
    // doesn't re-run checkValidityBang on every first-use call —
    // the outcome is stable until the reflection changes.
    refl[CHECKED] = true;
    return;
  }
  refl[CHECKED] = true;
}
