import { ArgumentError, rational } from "@blazetrails/ruby-compat";
import { CountryTimezone } from "../country-timezone.js";
import type { StringDeduper } from "../string-deduper.js";

/** @internal */
export class CountryDefiner {
  readonly timezones: CountryTimezone[];

  /** @internal */
  private readonly sharedTimezones: Record<string, CountryTimezone> | null;

  /** @internal */
  private readonly identifierDeduper: typeof StringDeduper.global;

  /** @internal */
  private readonly descriptionDeduper: typeof StringDeduper.global;

  constructor(
    sharedTimezones: Record<string, CountryTimezone> | null,
    identifierDeduper: typeof StringDeduper.global,
    descriptionDeduper: typeof StringDeduper.global,
  ) {
    this.sharedTimezones = sharedTimezones;
    this.identifierDeduper = identifierDeduper;
    this.descriptionDeduper = descriptionDeduper;
    this.timezones = [];
  }

  timezone(
    identifierOrReference: string,
    latitudeNumerator: number | null = null,
    latitudeDenominator: number | null = null,
    longitudeNumerator: number | null = null,
    longitudeDenominator: number | null = null,
    description: string | null = null,
  ): void {
    if (latitudeNumerator != null) {
      if (
        !(latitudeDenominator != null && longitudeNumerator != null && longitudeDenominator != null)
      ) {
        throw new ArgumentError(
          "Either just a reference should be supplied, or the identifier, latitude and longitude must all be specified",
        );
      }

      this.timezones.push(
        new CountryTimezone(
          this.identifierDeduper.dedupe(identifierOrReference),
          rational(latitudeNumerator, latitudeDenominator),
          rational(longitudeNumerator, longitudeDenominator),
          description != null ? this.descriptionDeduper.dedupe(description) : description,
        ),
      );
    } else {
      const sharedTimezone = Object.hasOwn(this.sharedTimezones!, identifierOrReference)
        ? this.sharedTimezones![identifierOrReference]
        : null;
      if (!sharedTimezone) {
        throw new ArgumentError(`Unknown shared timezone: ${identifierOrReference}`);
      }
      this.timezones.push(sharedTimezone);
    }
  }
}
