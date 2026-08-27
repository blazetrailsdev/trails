import type { Base } from "../base.js";

const CHECKED_OK = Symbol("ThroughReflection.checkedValidityOk");
const CHECKED_ERROR = Symbol("ThroughReflection.checkedValidityError");

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
  if (refl[CHECKED_ERROR] !== undefined) throw refl[CHECKED_ERROR];
  if (refl[CHECKED_OK]) return;
  const isThrough = typeof refl.isThroughReflection === "function" && refl.isThroughReflection();
  if (!isThrough || typeof refl.checkValidityBang !== "function") return;

  try {
    refl.checkValidityBang();
    refl[CHECKED_OK] = true;
  } catch (err) {
    refl[CHECKED_ERROR] = err;
    throw err;
  }
}

export function validateReflectionValidity(modelClass: typeof Base, assocName: string): void {
  const full = (
    modelClass as unknown as { _reflectOnAssociation?: (n: string) => unknown }
  )._reflectOnAssociation?.(assocName);
  const refl = full as
    | {
        checkValidityBang?: () => void;
        [CHECKED_OK]?: boolean;
        [CHECKED_ERROR]?: unknown;
      }
    | null
    | undefined;
  if (!refl) return;
  if (refl[CHECKED_ERROR] !== undefined) throw refl[CHECKED_ERROR];
  if (refl[CHECKED_OK]) return;
  if (typeof refl.checkValidityBang !== "function") return;

  try {
    refl.checkValidityBang();
    refl[CHECKED_OK] = true;
  } catch (err) {
    refl[CHECKED_ERROR] = err;
    throw err;
  }
}

export function routeThroughCheckValidity(modelClass: typeof Base, assocName: string): void {
  validateReflectionValidity(modelClass, assocName);
}
