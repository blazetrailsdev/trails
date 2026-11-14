import { ArgumentError, rbModName } from "@blazetrails/ruby-compat";
import type { CountryTimezone } from "../country-timezone.js";

export class CountryInfo {
  readonly code: string;

  readonly name: string;

  readonly zones: readonly CountryTimezone[];

  constructor(code: string, name: string, zones: CountryTimezone[]) {
    if (code == null) throw new ArgumentError("code must be specified");
    if (name == null) throw new ArgumentError("name must be specified");
    if (zones == null) throw new ArgumentError("zones must be specified");
    this.code = code;
    this.name = name;
    this.zones = Object.freeze(zones);
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}: ${this.code}>`;
  }
}
