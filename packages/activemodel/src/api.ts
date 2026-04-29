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

/**
 * Rails: ActiveModel::API includes Validations, which extends Translation,
 * so `API.raise_on_missing_translations` reaches the Translation singleton
 * accessor (translation.rb:25). Surface the same accessor here so callers
 * can read/write it via `API.raiseOnMissingTranslations(...)`.
 */
export function raiseOnMissingTranslations(value?: boolean): boolean {
  return translationRaise(value);
}
