import { ArgumentError, rbModName } from "@blazetrails/ruby-compat";

export class CountryInfo {
  readonly code: string;

  readonly name: string;

  readonly zones: readonly unknown[];

  constructor(code: string, name: string, zones: unknown[]) {
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
