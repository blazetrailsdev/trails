import type { CallbackFn, CallbackConditions } from "../callbacks.js";

/**
 * Validation callbacks — before_validation / after_validation hooks.
 *
 * Mirrors: ActiveModel::Validations::Callbacks
 *
 * In Rails this module adds before_validation and after_validation
 * class methods. Model already implements these via beforeValidation()
 * and afterValidation() which delegate to CallbackChain.
 */
export interface Callbacks {
  beforeValidation(fn: CallbackFn, conditions?: CallbackConditions): void;
  afterValidation(fn: CallbackFn, conditions?: CallbackConditions): void;
}

/**
 * Mirrors: ActiveModel::Validations::Callbacks::ClassMethods
 */
export interface CallbacksClassMethods {
  beforeValidation(fn: CallbackFn, conditions?: CallbackConditions): void;
  afterValidation(fn: CallbackFn, conditions?: CallbackConditions): void;
}
