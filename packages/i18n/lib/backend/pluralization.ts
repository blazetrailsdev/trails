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
      const hash = entry;

      const pluralizer = this.pluralizer(locale);
      if (typeof pluralizer === "function") {
        if (count === 0 && hasKey(hash, ":zero")) return hashAref(hash, ":zero");

        if (count === 0 || count === 1) {
          const value = hashAref(hash, this.symbolicCount(count));
          if (truthy(value)) return value;
        }

        const pluralRuleCategory = (pluralizer as (count: unknown) => string)(count);

        let value: unknown;
        if (hasKey(hash, pluralRuleCategory) || hasKey(hash, ":other")) {
          const categoryValue = hashAref(hash, pluralRuleCategory);
          value = truthy(categoryValue) ? categoryValue : hashAref(hash, ":other");
        } else {
          throw new InvalidPluralizationData(hash, count, pluralRuleCategory);
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
      const key = String(locale);
      if (!truthy(pluralizers[key])) {
        pluralizers[key] = t("i18n.plural.rule", { locale, resolve: false });
      }
      return pluralizers[key];
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
