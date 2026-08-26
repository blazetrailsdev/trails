/**
 * Translation mixin — provides human_attribute_name and i18n_scope.
 *
 * Mirrors: ActiveModel::Translation
 *
 * In Rails this is a module included into ActiveModel::Model that provides
 * i18n-aware attribute name translation. The class-level methods (i18nScope,
 * humanAttributeName, lookupAncestors) are on the Model constructor; we
 * express the contract here as an interface for the static side.
 */
import { humanize, isPresent } from "@blazetrails/activesupport";
import type { TranslateKey } from "@blazetrails/i18n";
import { I18n } from "./i18n.js";
import type { ModelName } from "./naming.js";

export function raiseOnMissingTranslations(value?: boolean): boolean {
  if (value !== undefined) {
    _raiseOnMissingTranslations = value;
  }
  return _raiseOnMissingTranslations;
}

export interface TranslationClassMethods {
  readonly i18nScope: string;
  lookupAncestors(): Array<{ new (...args: never[]): unknown; modelName: ModelName }>;
  humanAttributeName(attr: string, options?: HumanAttributeNameOptions): string;
}

/**
 * Mirrors: ActiveModel::Translation (translation.rb:11-73) — the module a host
 * gains by `extend ActiveModel::Translation` (validations.rb:43, api.rb:67).
 */
export class Translation {
  /**
   * Mirrors: ActiveModel::Translation#i18n_scope (translation.rb:20-22)
   *
   *   def i18n_scope
   *     :activemodel
   *   end
   */
  static get i18nScope(): string {
    return "activemodel";
  }

  /** Mirrors: ActiveModel::Translation#lookup_ancestors (translation.rb:27-29). */
  static lookupAncestors = lookupAncestors;

  /** Mirrors: ActiveModel::Translation#human_attribute_name (translation.rb:44-72). */
  static humanAttributeName = humanAttributeName;
}

export interface HumanAttributeNameOptions {
  default?: string | string[];
  raise?: boolean;
  [key: string]: unknown;
}

interface TranslationHost {
  readonly i18nScope: string;
  lookupAncestors(): Array<{ new (...args: never[]): unknown; modelName: ModelName }>;
}

/** @internal Mirrors ActiveModel::Translation::MISSING_TRANSLATION */
const MISSING_TRANSLATION = -(2 ** 60);

let _raiseOnMissingTranslations = false;

/**
 * Walk the class prototype chain collecting constructors that expose a
 * modelName static (i.e. those that include ActiveModel::Naming in Rails).
 *
 * Mirrors: ActiveModel::Translation#lookup_ancestors (translation.rb:36-38).
 */
export function lookupAncestors(
  this: object,
): Array<{ new (...args: never[]): unknown; modelName: ModelName }> {
  return _walkAncestors(this);
}

/**
 * Transforms attribute names into a more human format, such as "First name"
 * instead of "first_name".
 *
 * Mirrors: ActiveModel::Translation#human_attribute_name
 */
export function humanAttributeName(
  this: TranslationHost,
  attribute: string,
  options: HumanAttributeNameOptions = {},
): string {
  let namespace = "";
  let defaults: unknown[];

  if (attribute.includes(".")) {
    const lastDot = attribute.lastIndexOf(".");
    namespace = attribute.slice(0, lastDot).replace(/\./g, "/");
    attribute = attribute.slice(lastDot + 1);

    let key: string;
    let separator: string;
    if (isPresent(attribute)) {
      key = `${namespace}.${attribute}`;
      separator = "/";
    } else {
      key = namespace;
      separator = ".";
    }

    defaults = this.lookupAncestors().map(
      (klass) => `:${this.i18nScope}.attributes.${klass.modelName.i18nKey}${separator}${key}`,
    );
    defaults.push(`:${this.i18nScope}.attributes.${key}`);
    defaults.push(`:attributes.${key}`);
  } else {
    defaults = this.lookupAncestors().map(
      (klass) => `:${this.i18nScope}.attributes.${klass.modelName.i18nKey}.${attribute}`,
    );
  }

  const raiseOnMissing = options.raise ?? _raiseOnMissingTranslations;

  defaults.push(`:attributes.${attribute}`);
  if (options.default != null) defaults.push(options.default);
  if (!raiseOnMissing) defaults.push(MISSING_TRANSLATION);

  let translation = I18n.translate(defaults.shift() as TranslateKey, {
    count: 1,
    raise: raiseOnMissing,
    ...options,
    default: defaults,
  });
  if (translation === MISSING_TRANSLATION) {
    translation = isPresent(attribute) ? humanize(attribute) : humanize(namespace);
  }
  return translation as string;
}

function _walkAncestors(
  start: object,
): Array<{ new (...args: never[]): unknown; modelName: ModelName }> {
  const result: Array<{ new (...args: never[]): unknown; modelName: ModelName }> = [];
  let klass: object | null = start;
  while (klass != null && klass !== Function.prototype && klass !== Object.prototype) {
    if ((klass as { modelName?: unknown }).modelName != null) {
      result.push(klass as { new (...args: never[]): unknown; modelName: ModelName });
    }
    klass = Object.getPrototypeOf(klass) as object | null;
  }
  return result;
}
