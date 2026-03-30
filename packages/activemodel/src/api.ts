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
