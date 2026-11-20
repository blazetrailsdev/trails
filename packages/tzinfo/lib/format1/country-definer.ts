import { CountryDefiner as Format2CountryDefiner } from "../format2/country-definer.js";
import type { StringDeduper } from "../string-deduper.js";

/** @internal */
export class CountryDefiner extends Format2CountryDefiner {
  constructor(
    identifierDeduper: typeof StringDeduper.global,
    descriptionDeduper: typeof StringDeduper.global,
  ) {
    super(null, identifierDeduper, descriptionDeduper);
  }
}
