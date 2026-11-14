import { rbEqual, rbHash } from "@blazetrails/ruby-compat";
import type { Rational } from "@blazetrails/ruby-compat";
import { Timezone } from "./timezone.js";

export class CountryTimezone {
  readonly identifier: string;

  readonly latitude: Rational;

  readonly longitude: Rational;

  readonly description: string | null;

  constructor(
    identifier: string,
    latitude: Rational,
    longitude: Rational,
    description: string | null = null,
  ) {
    this.identifier = identifier;
    this.latitude = latitude;
    this.longitude = longitude;
    this.description = description;
  }

  timezone(): Timezone {
    return Timezone.get(this.identifier);
  }

  descriptionOrFriendlyIdentifier(): string {
    return this.description ?? this.timezone().friendlyIdentifier(true);
  }

  equals(ct: unknown): boolean {
    return (
      ct instanceof CountryTimezone &&
      this.identifier === ct.identifier &&
      rbEqual(this.latitude, ct.latitude) &&
      rbEqual(this.longitude, ct.longitude) &&
      this.description === ct.description
    );
  }

  eql(ct: unknown): boolean {
    return this.equals(ct);
  }

  hash(): number {
    return rbHash([this.identifier, this.latitude, this.longitude, this.description]);
  }
}
