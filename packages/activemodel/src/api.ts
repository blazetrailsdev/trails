/**
 * API mixin — minimal interface for models that need to work with
 * ActionPack but don't need the full ActiveRecord stack.
 *
 * Mirrors: ActiveModel::API
 *
 * A class that includes API gets:
 *   - constructor that accepts a hash of attributes
 *   - persisted? (always false for ActiveModel)
 *
 * Model already implements this; this interface codifies the contract.
 */
export interface API {
  isPersisted(): boolean;
}

import { raiseOnMissingTranslations as translationRaise } from "./translation.js";
import {
  initInternals as validationsInitInternals,
  contextForValidation as validationsContextForValidation,
  runValidationsBang as validationsRunValidationsBang,
  raiseValidationError as validationsRaiseValidationError,
  _mergeAttributes as validationsMergeAttributes,
} from "./validations.js";
import {
  _assignAttributes as attrAssign,
  _assignAttribute as attrAssignOne,
  sanitizeForMassAssignment as attrSanitize,
} from "./attribute-assignment.js";

/**
 * Rails: ActiveModel::API includes Validations (api.rb), so the
 * Validations private surface is part of API as well. Re-export the
 * canonical helpers so api-compare matches the shape of `api.rb` and
 * a host that mixes in only API still has the hooks.
 *
 * @internal Rails-private helper.
 */
export const initInternals = validationsInitInternals;

/**
 * @internal Rails-private helper.
 */
export const contextForValidation = validationsContextForValidation;

/**
 * @internal Rails-private helper.
 */
export const runValidationsBang = validationsRunValidationsBang;

/**
 * @internal Rails-private helper.
 */
export const raiseValidationError = validationsRaiseValidationError;

/**
 * @internal Rails-private helper.
 */
export const _mergeAttributes = validationsMergeAttributes;

/**
 * @internal Rails-private helper.
 */
export const _assignAttributes = attrAssign;

/**
 * @internal Rails-private helper.
 */
export const _assignAttribute = attrAssignOne;

/**
 * @internal Rails-private helper.
 */
export const sanitizeForMassAssignment = attrSanitize;

/**
 * Rails: ActiveModel::API includes Validations, which extends Translation,
 * so `API.raise_on_missing_translations` reaches the Translation singleton
 * accessor (translation.rb:25). Surface the same accessor here so callers
 * can read/write it via `API.raiseOnMissingTranslations(...)`.
 */
export function raiseOnMissingTranslations(value?: boolean): boolean {
  return translationRaise(value);
}
