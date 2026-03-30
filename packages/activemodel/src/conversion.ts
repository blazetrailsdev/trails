/**
 * Conversion mixin — provides toModel, toKey, toParam, toPartialPath.
 *
 * Mirrors: ActiveModel::Conversion
 *
 * These methods are required for ActionPack integration (url_for, form_for, etc.)
 * and must be implemented by any object that acts as a model.
 */
export interface Conversion {
  toModel(): unknown;
  toKey(): unknown[] | null;
  toParam(): string | null;
  toPartialPath(): string;
}
