import { humanize, isPresent } from "@blazetrails/activesupport";
import type { TranslateKey } from "@blazetrails/i18n";
import { I18n } from "./i18n.js";
import { Naming, type ModelName } from "./naming.js";

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

export class Translation {
  static get i18nScope(): string {
    return "activemodel";
  }

  static lookupAncestors = lookupAncestors;

  static humanAttributeName = humanAttributeName;
}

for (const moduleMethod of Object.keys(Naming)) {
  Object.defineProperty(
    Translation,
    moduleMethod,
    Object.getOwnPropertyDescriptor(Naming, moduleMethod)!,
  );
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

/** @internal */
const MISSING_TRANSLATION = -(2 ** 60);

let _raiseOnMissingTranslations = false;

export function lookupAncestors(
  this: object,
): Array<{ new (...args: never[]): unknown; modelName: ModelName }> {
  return _walkAncestors(this);
}

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
