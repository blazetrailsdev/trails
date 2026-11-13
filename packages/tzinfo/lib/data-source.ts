import {
  ArgumentError,
  Encoding,
  StandardError,
  TopLevel,
  rbAryBsearch,
  rbModName,
} from "@blazetrails/ruby-compat";
import { InvalidCountryCode } from "./country.js";
import type { CountryInfo } from "./data-sources/country-info.js";
import type { TimezoneInfo } from "./data-sources/timezone-info.js";
import { InvalidTimezoneIdentifier } from "./timezone.js";

export class InvalidDataSource extends StandardError {}

export class DataSourceNotFound extends StandardError {}

export class DataSource {
  /** @internal */
  private static instance: DataSource | null = null;

  static get(): DataSource {
    if (!DataSource.instance) {
      if (!DataSource.instance) this.set(this.createDefaultDataSource());
    }
    return DataSource.instance!;
  }

  static set(dataSourceOrType: DataSource | "ruby" | "zoneinfo", ...args: unknown[]): DataSource {
    const { DataSources } = TopLevel.TZInfo! as unknown as {
      DataSources: {
        RubyDataSource: new () => DataSource;
        ZoneinfoDataSource: new (...args: unknown[]) => DataSource;
      };
    };
    if (dataSourceOrType instanceof DataSource) {
      DataSource.instance = dataSourceOrType;
    } else if (dataSourceOrType === "ruby") {
      DataSource.instance = new DataSources.RubyDataSource();
    } else if (dataSourceOrType === "zoneinfo") {
      DataSource.instance = new DataSources.ZoneinfoDataSource(...args);
    } else {
      throw new ArgumentError(
        "data_source_or_type must be a DataSource instance or a data source type (:ruby or :zoneinfo)",
      );
    }
    return DataSource.instance;
  }

  /** @internal */
  private static createDefaultDataSource(): DataSource {
    const TZInfo = TopLevel.TZInfo! as unknown as {
      Data?: unknown;
      DataSources: {
        RubyDataSource: new () => DataSource;
        ZoneinfoDataSource: new () => DataSource;
        ZoneinfoDirectoryNotFound: abstract new (...args: never[]) => Error;
      };
    };
    let hasTzinfoData = false;
    if (TZInfo.Data != null) hasTzinfoData = true;

    if (hasTzinfoData) return new TZInfo.DataSources.RubyDataSource();

    try {
      return new TZInfo.DataSources.ZoneinfoDataSource();
    } catch (e) {
      if (e instanceof TZInfo.DataSources.ZoneinfoDirectoryNotFound) {
        throw new DataSourceNotFound(
          "No source of timezone data could be found.\nPlease refer to https://tzinfo.github.io/datasourcenotfound for help resolving this error.",
        );
      }
      throw e;
    }
  }

  /** @internal */
  private readonly timezones: Map<string, TimezoneInfo>;

  /** @internal */
  private _timezoneIdentifiers: readonly string[] | null = null;

  constructor() {
    this.timezones = new Map();
  }

  getTimezoneInfo(identifier: string): TimezoneInfo {
    let result = this.timezones.get(identifier);
    if (!result) {
      result = this.loadTimezoneInfo(identifier);
      this.timezones.set(result.identifier, result);
    }
    return result;
  }

  timezoneIdentifiers(): readonly string[] {
    return (this._timezoneIdentifiers ??= this.buildTimezoneIdentifiers());
  }

  dataTimezoneIdentifiers(): readonly string[] {
    this.raiseInvalidDataSource("data_timezone_identifiers");
  }

  linkedTimezoneIdentifiers(): readonly string[] {
    this.raiseInvalidDataSource("linked_timezone_identifiers");
  }

  getCountryInfo(code: string): CountryInfo {
    return this.loadCountryInfo(code);
  }

  countryCodes(): readonly string[] {
    this.raiseInvalidDataSource("country_codes");
  }

  eagerLoadBang(): null {
    this.timezoneIdentifiers().forEach((identifier) => this.loadTimezoneInfo(identifier));
    this.countryCodes().forEach((code) => this.loadCountryInfo(code));
    return null;
  }

  toString(): string {
    return "Default DataSource";
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}>`;
  }

  /* eslint-disable unused-imports/no-unused-vars */
  /** @internal */
  protected loadTimezoneInfo(identifier: string): TimezoneInfo {
    this.raiseInvalidDataSource("load_timezone_info");
  }

  /** @internal */
  protected loadCountryInfo(code: string): CountryInfo {
    this.raiseInvalidDataSource("load_country_info");
  }
  /* eslint-enable unused-imports/no-unused-vars */

  /** @internal */
  protected timezoneIdentifierEncoding(): Encoding {
    return Encoding.UTF_8;
  }

  /** @internal */
  protected validateTimezoneIdentifier(identifier: unknown): string {
    if (typeof identifier !== "string") {
      throw new InvalidTimezoneIdentifier(
        `Invalid identifier: ${identifier == null ? "nil" : String(identifier)}`,
      );
    }

    const validIdentifier = this.tryWithEncoding(
      identifier,
      this.timezoneIdentifierEncoding(),
      (id) => this.findTimezoneIdentifier(id),
    );
    if (validIdentifier) return validIdentifier;

    throw new InvalidTimezoneIdentifier(`Invalid identifier: ${identifier}`);
  }

  /** @internal */
  protected lookupCountryInfo<T>(
    hash: Record<string, T>,
    code: unknown,
    encoding: Encoding = Encoding.UTF_8,
  ): T {
    if (typeof code !== "string") {
      throw new InvalidCountryCode(`Invalid country code: ${code == null ? "nil" : String(code)}`);
    }
    const info = this.tryWithEncoding(code, encoding, (c) =>
      Object.hasOwn(hash, c) ? hash[c] : null,
    );
    if (info != null) return info;

    throw new InvalidCountryCode(`Invalid country code: ${code}`);
  }

  /** @internal */
  private raiseInvalidDataSource(methodName: string): never {
    throw new InvalidDataSource(`${methodName} not defined`);
  }

  /** @internal */
  private buildTimezoneIdentifiers(): readonly string[] {
    const data = this.dataTimezoneIdentifiers();
    const linked = this.linkedTimezoneIdentifiers();
    return linked.length === 0 ? data : Object.freeze([...data, ...linked].sort());
  }

  /** @internal */
  private findTimezoneIdentifier(identifier: string): string | null {
    const result = rbAryBsearch(this.timezoneIdentifiers(), (i) => i >= identifier);
    return result === identifier ? result : null;
  }

  /** @internal */
  private tryWithEncoding<T>(
    string: string,
    encoding: Encoding,
    block: (string: string) => T | null,
  ): T | null {
    const result = block(string);
    if (result != null) return result;
    return null;
  }
}
