import { underscore, tableize } from "@blazetrails/activesupport";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConversionHost = any;

/**
 * Class-level cache for toPartialPath.
 *
 * Mirrors: ActiveModel::Conversion::ClassMethods#_to_partial_path
 */
export function _toPartialPath(this: AnyConversionHost): string {
  if (!this._cachedToPartialPath) {
    if (this.modelName != null) {
      const mn = this.modelName;
      this._cachedToPartialPath = `${mn.collection}/${mn.element}`;
    } else {
      const element = underscore(this.name);
      const collection = tableize(this.name);
      this._cachedToPartialPath = `${collection}/${element}`;
    }
  }
  return this._cachedToPartialPath;
}
