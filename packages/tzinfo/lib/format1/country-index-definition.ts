import { extend, rbModAppendFeatures } from "@blazetrails/ruby-compat/include";
import { CountryInfo } from "../data-sources/country-info.js";
import type { CountryTimezone } from "../country-timezone.js";
import { StringDeduper } from "../string-deduper.js";
import { CountryDefiner } from "./country-definer.js";

export interface CountryIndexDefinitionHost {
  _countries: Record<string, CountryInfo>;
  _descriptionDeduper?: StringDeduper | null;
}

/** @internal */
export const ClassMethods = {
  get countries(): Readonly<Record<string, CountryInfo>> {
    const host = this as unknown as CountryIndexDefinitionHost;
    host._descriptionDeduper = null;
    return Object.freeze(host._countries);
  },

  /** @internal */
  country(
    this: CountryIndexDefinitionHost,
    code: string,
    name: string,
    block?: (definer: CountryDefiner) => void,
  ): void {
    this._descriptionDeduper ??= new StringDeduper();

    let zones: CountryTimezone[];
    if (block) {
      const definer = new CountryDefiner(StringDeduper.global, this._descriptionDeduper);
      block(definer);
      zones = definer.timezones;
    } else {
      zones = [];
    }

    this._countries[code] = new CountryInfo(code, name, zones);
  },
};

/** @internal */
export const CountryIndexDefinition = { ClassMethods };
Object.defineProperty(CountryIndexDefinition, "appendFeatures", {
  value(this: typeof CountryIndexDefinition, base: object): void {
    rbModAppendFeatures(base, this);
    extend(base, ClassMethods);
    Object.assign(base, { _countries: {} });
  },
});
