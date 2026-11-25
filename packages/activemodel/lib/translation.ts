import { humanize, include, isPresent, runLoadHooks } from "@blazetrails/activesupport";
import { classModule, rbModAncestors } from "@blazetrails/ruby-compat/include";
import { toS } from "@blazetrails/ruby-compat/object";
import type { TranslateKey } from "@blazetrails/i18n";
import { I18n } from "./i18n.js";
import { Naming, type ModelName } from "./naming.js";

export interface TranslationClassMethods {
  readonly i18nScope: string;
  lookupAncestors(): Array<{ new (...args: never[]): unknown; modelName: ModelName }>;
  humanAttributeName(attr: string, options?: HumanAttributeNameOptions): string;
}

export class Translation {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static raiseOnMissingTranslations: boolean | string | null = false;

  get i18nScope(): string {
    return "activemodel";
  }

  lookupAncestors(): Array<{ new (...args: never[]): unknown; modelName: ModelName }> {
    return rbModAncestors(this as unknown as { prototype: object }).filter(
      (x) => "modelName" in x,
    ) as Array<{
      new (...args: never[]): unknown;
      modelName: ModelName;
    }>;
  }

  humanAttributeName(attribute: string, options: HumanAttributeNameOptions = {}): string {
    attribute = toS(attribute);
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

    const raiseOnMissing = Object.hasOwn(options, "raise")
      ? options.raise
      : Translation.raiseOnMissingTranslations;

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
}

include(Translation, Naming);

runLoadHooks("active_model_translation", Translation);

export interface HumanAttributeNameOptions {
  default?: string | string[];
  raise?: boolean;
  [key: string]: unknown;
}

/** @internal */
const MISSING_TRANSLATION = -(2 ** 60);
