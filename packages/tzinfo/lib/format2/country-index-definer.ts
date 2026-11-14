import { rational } from "@blazetrails/ruby-compat";
import { CountryTimezone } from "../country-timezone.js";
import { CountryInfo } from "../data-sources/country-info.js";
import type { StringDeduper } from "../string-deduper.js";
import { CountryDefiner } from "./country-definer.js";

type Deduper = Pick<StringDeduper, "dedupe">;

/** @internal */
export class CountryIndexDefiner {
  readonly countries: Record<string, CountryInfo>;

  /** @internal */
  private readonly identifierDeduper: Deduper;

  /** @internal */
  private readonly descriptionDeduper: Deduper;

  /** @internal */
  private readonly sharedTimezones: Record<string, CountryTimezone>;

  constructor(identifierDeduper: Deduper, descriptionDeduper: Deduper) {
    this.identifierDeduper = identifierDeduper;
    this.descriptionDeduper = descriptionDeduper;
    this.sharedTimezones = {};
    this.countries = {};
  }

  timezone(
    reference: string,
    identifier: string,
    latitudeNumerator: number,
    latitudeDenominator: number,
    longitudeNumerator: number,
    longitudeDenominator: number,
    description: string | null = null,
  ): void {
    this.sharedTimezones[reference] = new CountryTimezone(
      this.identifierDeduper.dedupe(identifier),
      rational(latitudeNumerator, latitudeDenominator),
      rational(longitudeNumerator, longitudeDenominator),
      description != null ? this.descriptionDeduper.dedupe(description) : description,
    );
  }

  country(code: string, name: string, block?: (definer: CountryDefiner) => void): void {
    let timezones: CountryTimezone[];
    if (block) {
      const definer = new CountryDefiner(
        this.sharedTimezones,
        this.identifierDeduper,
        this.descriptionDeduper,
      );
      block(definer);
      timezones = definer.timezones;
    } else {
      timezones = [];
    }
    this.countries[code] = new CountryInfo(code, name, timezones);
  }
}
