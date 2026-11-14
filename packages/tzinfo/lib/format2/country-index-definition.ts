import { extend, rbModAppendFeatures } from "@blazetrails/ruby-compat";
import type { CountryInfo } from "../data-sources/country-info.js";
import { StringDeduper } from "../string-deduper.js";
import { CountryIndexDefiner } from "./country-index-definer.js";

export interface CountryIndexDefinitionHost {
  _countries: Readonly<Record<string, CountryInfo>>;
}

/** @internal */
export const ClassMethods = {
  get countries(): Readonly<Record<string, CountryInfo>> {
    return (this as unknown as CountryIndexDefinitionHost)._countries;
  },

  /** @internal */
  countryIndex(
    this: CountryIndexDefinitionHost,
    block: (definer: CountryIndexDefiner) => void,
  ): void {
    const definer = new CountryIndexDefiner(StringDeduper.global, new StringDeduper());
    block(definer);

    this._countries = Object.freeze(definer.countries);
  },
};

/** @internal */
export const CountryIndexDefinition = { ClassMethods };
Object.defineProperty(CountryIndexDefinition, "appendFeatures", {
  value(this: typeof CountryIndexDefinition, base: object): void {
    rbModAppendFeatures(base, this);
    extend(base, ClassMethods);
    Object.assign(base, { _countries: Object.freeze({}) });
  },
});
