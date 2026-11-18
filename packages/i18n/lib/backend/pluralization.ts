import {
  Hash,
  defineModule,
  hasKey,
  hashAref,
  rbCallSuper,
  rbEqual,
  rbObjRespondTo,
  rbProcCall,
} from "@blazetrails/ruby-compat";

import { InvalidPluralizationData } from "../exceptions.js";
import { t, type Locale } from "../i18n.js";

interface PluralizationHost {
  _pluralizers?: Record<string, unknown>;
  pluralizers(): Record<string, unknown>;
  pluralizer(locale: Locale): unknown;
  symbolicCount(count: unknown): string;
}

function pluralize(
  this: PluralizationHost,
  locale: Locale,
  entry: unknown,
  count: unknown,
): unknown {
  if (!(entry instanceof Hash && count != null && count !== false)) return entry;

  const pluralizer = this.pluralizer(locale);
  if (rbObjRespondTo(pluralizer, "call")) {
    if (rbEqual(count, 0) && hasKey(entry, ":zero")) return hashAref(entry, ":zero");

    if (rbEqual(count, 0) || rbEqual(count, 1)) {
      const value = hashAref(entry, this.symbolicCount(count));
      if (value != null && value !== false) return value;
    }

    const pluralRuleCategory = rbProcCall(pluralizer, count);

    let value: unknown;
    if (hasKey(entry, pluralRuleCategory as string) || hasKey(entry, ":other")) {
      const categoryValue = hashAref(entry, pluralRuleCategory);
      value =
        categoryValue != null && categoryValue !== false
          ? categoryValue
          : hashAref(entry, ":other");
    } else {
      throw new InvalidPluralizationData(entry, count, pluralRuleCategory as string);
    }
    return value;
  } else {
    return rbCallSuper(this, pluralize, locale, entry, count);
  }
}

/** @internal */
function pluralizers(this: PluralizationHost): Record<string, unknown> {
  return (this._pluralizers ??= {});
}

/** @internal */
function pluralizer(this: PluralizationHost, locale: Locale): unknown {
  const pluralizers = this.pluralizers();
  const current = pluralizers[locale];
  if (current == null || current === false) {
    pluralizers[locale] = t(":i18n.plural.rule", { locale, resolve: false });
  }
  return pluralizers[locale];
}

/** @internal */
function symbolicCount(this: PluralizationHost, count: unknown): string {
  if (rbEqual(count, 0)) count = 0;
  if (rbEqual(count, 1)) count = 1;
  return `:${String(count)}`;
}

export const Pluralization = defineModule(
  { pluralize },
  { pluralizers, pluralizer },
  { symbolicCount },
);
