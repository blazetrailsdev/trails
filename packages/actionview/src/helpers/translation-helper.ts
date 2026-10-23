import {
  Concern,
  HtmlSafeTranslation,
  I18n,
  extend,
  htmlEscape,
  isBlank,
  isPresent,
  mattrAccessor,
  titleize,
} from "@blazetrails/activesupport";
import {
  RuntimeError,
  hashDelete,
  isSymbol,
  rbInspect,
  symbolToS,
  include,
} from "@blazetrails/ruby-compat";
import { ActionView } from "../namespaces.js";
import { contentTag, TagHelper, type TagHelperHost } from "./tag-helper.js";

export interface TranslationHelperHost extends TagHelperHost {
  virtualPath?: string | null;
  _scopeKeyByPartialCache?: Record<string, string>;
}

let _raiseOnMissingTranslations: boolean | null = null;

export function raiseOnMissingTranslations(): boolean | null {
  return _raiseOnMissingTranslations;
}

export function setRaiseOnMissingTranslations(raiseOnMissingTranslations: boolean | null): void {
  _raiseOnMissingTranslations = raiseOnMissingTranslations;
}

type TranslateBlock = (translation: unknown, key: unknown) => unknown;

export function translate(
  this: TranslationHelperHost,
  key: unknown,
  { ...options }: Record<string, unknown> = {},
  block?: TranslateBlock,
): unknown {
  if (Array.isArray(key)) return key.map((k) => translate.call(this, k, options));
  if (!isSymbol(key)) key = key?.toString();

  let alternatives: unknown[] | undefined;
  if ("default" in options) {
    alternatives = Array.isArray(options.default)
      ? (hashDelete(options, "default") as unknown[]).filter((d) => d != null)
      : [hashDelete(options, "default")];
  }

  if (options.raise == null && TranslationHelper.raiseOnMissingTranslations()) options.raise = true;
  let defaultValue: unknown = MISSING_TRANSLATION;

  let translation: unknown = null;
  let firstKey: unknown;
  while (key != null || isPresent(alternatives)) {
    if (isBlank(alternatives) && options.raise != null) {
      defaultValue = NO_DEFAULT;
    }

    key = scopeKeyByPartial.call(this, key as string | null | undefined);

    const translated = HtmlSafeTranslation.translate(key as string, {
      ...options,
      default: defaultValue,
    });

    if (translated !== MISSING_TRANSLATION) {
      translation = translated;
      break;
    }

    if (isPresent(alternatives) && !isSymbol(alternatives![0])) {
      const first = alternatives![0];
      translation =
        first != null && first !== false
          ? I18n.translate(null, { ...options, default: alternatives } as never)
          : first;
      break;
    }

    firstKey ??= key;
    key = alternatives?.shift();
  }

  if (key == null && firstKey != null) {
    translation = missingTranslation.call(this, firstKey, options);
    key = firstKey;
  }

  return block ? block(translation, key) : translation;
}

export const t = translate;

export function localize(object: unknown, { ...options }: Record<string, unknown> = {}): unknown {
  return I18n.localize(object, options as never);
}

export const l = localize;

const MISSING_TRANSLATION = -(2 ** 60);

const NO_DEFAULT = Object.freeze([]);

/** @internal */
function scopeKeyByPartial(
  this: TranslationHelperHost,
  key: string | null | undefined,
): string | null | undefined {
  const name = key != null && isSymbol(key) ? symbolToS(key) : key;
  if (name?.startsWith(".")) {
    if (this.virtualPath) {
      this._scopeKeyByPartialCache ??= {};
      this._scopeKeyByPartialCache[this.virtualPath] ??= this.virtualPath.replace(/\/_?/g, ".");
      return `${this._scopeKeyByPartialCache[this.virtualPath]}${name}`;
    } else {
      throw new RuntimeError(
        `Cannot use t(${rbInspect(key)}) shortcut because path is not available`,
      );
    }
  } else {
    return key;
  }
}

/** @internal */
function missingTranslation(
  this: TranslationHelperHost,
  key: unknown,
  options: Record<string, unknown>,
): unknown {
  const keys = I18n.normalizeKeys(
    (options.locale != null && options.locale !== false ? options.locale : I18n.locale()) as never,
    key,
    options.scope,
  );

  let title = `translation missing: ${keys.join(".")}`;

  for (const [name, value] of Object.entries(options)) {
    if (name !== "scope") {
      title += ", " + name + ": " + htmlEscape(value);
    }
  }

  if (ActionView.Base.debugMissingTranslation) {
    return contentTag.call(this, "span", titleize(String(keys[keys.length - 1])), {
      class: "translation_missing",
      title,
    });
  } else {
    return title;
  }
}

export const TranslationHelper = { translate, t, localize, l } as {
  translate: typeof translate;
  t: typeof t;
  localize: typeof localize;
  l: typeof l;
  raiseOnMissingTranslations: typeof raiseOnMissingTranslations;
  setRaiseOnMissingTranslations: typeof setRaiseOnMissingTranslations;
};

extend(TranslationHelper, Concern);
include(TranslationHelper, TagHelper);
extend(TranslationHelper, { raiseOnMissingTranslations, setRaiseOnMissingTranslations });
(
  TranslationHelper as unknown as { included(base: null, block: (this: object) => void): void }
).included(null, function () {
  mattrAccessor.call(this, "debugMissingTranslation", { default: true });
});
