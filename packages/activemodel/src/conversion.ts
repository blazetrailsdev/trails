import {
  underscore,
  tableize,
  demodulize,
  wrap,
  included,
  classAttribute,
} from "@blazetrails/activesupport";

/**
 * Conversion mixin — provides toModel, toKey, toParam, toPartialPath.
 *
 * Mirrors: ActiveModel::Conversion
 *
 * These methods are required for ActionPack integration (url_for, form_for, etc.)
 * and must be implemented by any object that acts as a model.
 */
/** Host shape the {@link Conversion} bodies read through. */
interface ConversionRecord {
  isPersisted(): boolean;
  respondTo(method: string): boolean;
  _readAttribute(name: string): unknown;
}

export class Conversion {
  /**
   * Mirrors: conversion.rb:28-33
   *   included do
   *     class_attribute :param_delimiter, instance_reader: false, default: "-"
   *   end
   */
  static [included](base: object): void {
    classAttribute.call(base, "paramDelimiter", { instanceReader: false, default: "-" });
  }

  /**
   * Returns self. Required by ActiveModel::Conversion.
   *
   * Mirrors: ActiveModel::Conversion#to_model (conversion.rb:49-51)
   */
  toModel(): this {
    return this;
  }

  /**
   * Return an array of all key attributes if any of the attributes is set,
   * whether or not the object is persisted.
   *
   * Mirrors: ActiveModel::Conversion#to_key (conversion.rb:67-70)
   */
  toKey(): unknown[] | null {
    // conversion.rb:67-70 — `key = respond_to?(:id) && id; key ? Array(key) : nil`.
    // `Array(key)` is what keeps a composite `id` from being double-wrapped.
    const self = this as unknown as ConversionRecord;
    const key = self.respondTo("id") ? self._readAttribute("id") : false;
    return key != null && key !== false ? wrap(key) : null;
  }

  /**
   * Mirrors: ActiveModel::Conversion#to_param (conversion.rb:88-90)
   */
  toParam(): string | null {
    const self = this as unknown as ConversionRecord;
    if (!self.isPersisted()) return null;
    const key = this.toKey();
    if (!key) return null;
    if (!key.every((part) => part !== null && part !== undefined && part !== false)) return null;
    return key
      .map(String)
      .join((this.constructor as unknown as { paramDelimiter: string }).paramDelimiter);
  }

  /**
   * Mirrors: ActiveModel::Conversion#to_partial_path (conversion.rb:101-103)
   */
  toPartialPath(): string {
    return (this.constructor as unknown as ConversionHost)._toPartialPath();
  }
}

/**
 * Mirrors: ActiveModel::Conversion::ClassMethods (conversion.rb:105-118).
 */
export const ClassMethods = { _toPartialPath };

interface ConversionHost {
  name: string;
  _toPartialPath(): string;
  modelName?: { collection: string; element: string };
  _cachedToPartialPath?: string;
}

/**
 * Class-level cache for toPartialPath.
 *
 * Mirrors: ActiveModel::Conversion::ClassMethods#_to_partial_path
 */
export function _toPartialPath(this: ConversionHost): string {
  if (!this._cachedToPartialPath) {
    if (this.modelName != null) {
      const mn = this.modelName;
      this._cachedToPartialPath = `${mn.collection}/${mn.element}`;
    } else {
      // Rails `_to_partial_path` fallback
      // (activemodel/lib/active_model/conversion.rb:110-118):
      //   element    = underscore(demodulize(name))
      //   collection = tableize(name)
      // Using `underscore(this.name)` without `demodulize` would produce
      // a path-shape element like "blog/post" for a namespaced class name
      // — keeping the fallback Rails-faithful: demodulize first.
      const element = underscore(demodulize(this.name));
      const collection = tableize(this.name);
      this._cachedToPartialPath = `${collection}/${element}`;
    }
  }
  return this._cachedToPartialPath;
}
