import { Hash, hasKey, hashAref } from "@blazetrails/ruby-compat";

import { InvalidPluralizationData } from "../exceptions.js";
import { t, type Locale } from "../i18n.js";
import type { Base } from "./base.js";

function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

type BackendConstructor = abstract new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Base;

export function Pluralization<T extends BackendConstructor>(Superclass: T): T {
  abstract class Pluralization extends Superclass {
    declare private _pluralizers: Record<string, unknown> | undefined;

    protected override pluralize(locale: Locale, entry: unknown, count: unknown): unknown {
      if (!(entry instanceof Hash && truthy(count))) return entry;

      const pluralizer = this.pluralizer(locale);
      if (typeof pluralizer === "function") {
        if (count === 0 && hasKey(entry, ":zero")) return hashAref(entry, ":zero");

        if (count === 0 || count === 1) {
          const value = hashAref(entry, this.symbolicCount(count));
          if (truthy(value)) return value;
        }

        const pluralRuleCategory = (pluralizer as (count: unknown) => string)(count);

        let value: unknown;
        if (hasKey(entry, pluralRuleCategory) || hasKey(entry, ":other")) {
          const categoryValue = hashAref(entry, pluralRuleCategory);
          value = truthy(categoryValue) ? categoryValue : hashAref(entry, ":other");
        } else {
          throw new InvalidPluralizationData(entry, count, pluralRuleCategory);
        }
        return value;
      } else {
        return super.pluralize(locale, entry, count);
      }
    }

    /** @internal */
    protected pluralizers(): Record<string, unknown> {
      return (this._pluralizers ??= {});
    }

    /** @internal */
    protected pluralizer(locale: Locale): unknown {
      const pluralizers = this.pluralizers();
      if (!truthy(pluralizers[locale])) {
        pluralizers[locale] = t(":i18n.plural.rule", { locale, resolve: false });
      }
      return pluralizers[locale];
    }

    /** @internal */
    private symbolicCount(count: number): string {
      if (count === 0) count = 0;
      if (count === 1) count = 1;
      return `:${String(count)}`;
    }
  }

  return Pluralization;
}
