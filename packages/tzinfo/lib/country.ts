import {
  cmp,
  equals,
  isBetween,
  rbHash,
  rbModName,
  type Comparable,
} from "@blazetrails/ruby-compat";
import { DataSource } from "./data-source.js";
import type { CountryInfo } from "./data-sources/country-info.js";
import type { CountryTimezone } from "./country-timezone.js";
import type { Timezone } from "./timezone.js";

export class InvalidCountryCode extends Error {
  override name = "InvalidCountryCode";
}

export class Country implements Comparable {
  static get(code: string): Country {
    return new Country(this.dataSource().getCountryInfo(code));
  }

  static allCodes(): readonly string[] {
    return this.dataSource().countryCodes();
  }

  static all(): Country[] {
    return this.dataSource()
      .countryCodes()
      .map((code) => this.get(code));
  }

  /** @internal */
  private static dataSource(): DataSource {
    return DataSource.get();
  }

  /** @internal */
  private readonly info: CountryInfo;

  constructor(info: CountryInfo) {
    this.info = info;
  }

  get code(): string {
    return this.info.code;
  }

  get name(): string {
    return this.info.name;
  }

  toString(): string {
    return this.name;
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}: ${this.info.code}>`;
  }

  zoneIdentifiers(): string[] {
    return this.zoneInfo().map((zone) => zone.identifier);
  }

  zoneNames(): string[] {
    return this.zoneIdentifiers();
  }

  zones(): Timezone[] {
    return this.zoneInfo().map((zone) => zone.timezone());
  }

  zoneInfo(): readonly CountryTimezone[] {
    return this.info.zones;
  }

  compareTo(c: unknown): number | null {
    if (!(c instanceof Country)) return null;
    return cmp(this.code, c.code);
  }

  isBetween = isBetween;
  equals = equals;

  eql(c: unknown): boolean {
    return this.equals(c);
  }

  hash(): number {
    return rbHash(this.code);
  }

  matchOperator(regexp: RegExp): number | null {
    const index = this.code.search(regexp);
    return index === -1 ? null : index;
  }

  _dump(_limit: number): string {
    return this.code;
  }

  static _load(data: string | typeof String.prototype): Country {
    return Country.get(data.valueOf());
  }
}
