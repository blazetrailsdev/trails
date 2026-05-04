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
import { humanize } from "@blazetrails/activesupport";
import { I18n } from "./i18n.js";
import type { ModelName } from "./naming.js";

export interface TranslationClassMethods {
  readonly i18nScope: string;
  lookupAncestors(): unknown[];
  humanAttributeName(attr: string, options?: HumanAttributeNameOptions): string;
}

export type Translation = TranslationClassMethods;

export interface HumanAttributeNameOptions {
  default?: string | string[];
  raise?: boolean;
  [key: string]: unknown;
}

interface TranslationHost {
  readonly i18nScope: string;
  lookupAncestors(): Array<{ modelName: ModelName }>;
}

/** @internal Mirrors ActiveModel::Translation::MISSING_TRANSLATION */
const MISSING_TRANSLATION = "\x00__MISSING_TRANSLATION__\x00";

let _raiseOnMissingTranslations = false;

export function raiseOnMissingTranslations(value?: boolean): boolean {
  if (value !== undefined) {
    _raiseOnMissingTranslations = value;
  }
  return _raiseOnMissingTranslations;
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
  options?: HumanAttributeNameOptions,
): string {
  const scope = this.i18nScope;
  const ancestors = this.lookupAncestors();
  const raiseOnMissing = options?.raise ?? _raiseOnMissingTranslations;

  if (attribute.includes(".")) {
    const lastDot = attribute.lastIndexOf(".");
    const namespace = attribute.slice(0, lastDot).replace(/\./g, "/");
    const tail = attribute.slice(lastDot + 1);
    const key = tail.length > 0 ? `${namespace}.${tail}` : namespace;
    const separator = tail.length > 0 ? "/" : ".";

    const defaults: Array<{ key: string } | { message: string }> = ancestors.map((klass) => ({
      key: `${scope}.attributes.${klass.modelName.i18nKey}${separator}${key}`,
    }));
    defaults.push({ key: `${scope}.attributes.${key}` });
    defaults.push({ key: `attributes.${key}` });
    // Rails line 76: always append `attributes.#{attribute}` (attribute = tail after rpartition)
    defaults.push({ key: `attributes.${tail}` });
    _appendUserDefaults(defaults, options?.default);
    if (!raiseOnMissing) defaults.push({ message: MISSING_TRANSLATION });

    const result = _callI18n(defaults, raiseOnMissing, options);
    if (result === MISSING_TRANSLATION) {
      return tail.length > 0 ? humanize(tail) : humanize(namespace);
    }
    return result;
  } else {
    const defaults: Array<{ key: string } | { message: string }> = ancestors.map((klass) => ({
      key: `${scope}.attributes.${klass.modelName.i18nKey}.${attribute}`,
    }));
    defaults.push({ key: `attributes.${attribute}` });
    _appendUserDefaults(defaults, options?.default);
    if (!raiseOnMissing) defaults.push({ message: MISSING_TRANSLATION });

    const result = _callI18n(defaults, raiseOnMissing, options);
    if (result === MISSING_TRANSLATION) {
      return humanize(attribute);
    }
    return result;
  }
}

function _callI18n(
  defaults: Array<{ key: string } | { message: string }>,
  raiseOnMissing: boolean,
  options?: HumanAttributeNameOptions,
): string {
  const [primary, ...rest] = defaults;
  const primaryKey = "key" in primary ? primary.key : "";
  const { default: _d, raise: _r, ...passthrough } = options ?? {};
  // count: 1 is the Rails default for pluralization; caller-supplied count wins
  return I18n.t(primaryKey, { count: 1, ...passthrough, raise: raiseOnMissing, defaults: rest });
}

function _appendUserDefaults(
  defaults: Array<{ key: string } | { message: string }>,
  userDefault?: string | string[],
): void {
  if (userDefault === undefined) return;
  const items = Array.isArray(userDefault) ? userDefault : [userDefault];
  for (const item of items) {
    defaults.push({ message: item });
  }
}

/**
 * Walk the class prototype chain collecting constructors that expose a
 * modelName static (i.e. those that include ActiveModel::Naming in Rails).
 *
 * @internal Mirrors ActiveModel::Translation#lookup_ancestors
 */
export function lookupAncestors(this: object): Array<{ modelName: ModelName }> {
  return _walkAncestors(this);
}

function _walkAncestors(start: object): Array<{ modelName: ModelName }> {
  const result: Array<{ modelName: ModelName }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let klass: any = start;
  while (klass != null && klass !== Function.prototype && klass !== Object.prototype) {
    if (klass.modelName != null) {
      result.push(klass as { modelName: ModelName });
    }
    klass = Object.getPrototypeOf(klass);
  }
  return result;
}
