import {
  File,
  LOADED_FEATURES,
  LoadError,
  NameError,
  StandardError,
  TopLevel,
  constDefined,
  constGet,
  rbFRequire,
  rbRequireLoaded,
} from "@blazetrails/ruby-compat";
import { DataSource } from "../data-source.js";
import { InvalidTimezoneIdentifier } from "../timezone.js";
import type { CountryInfo } from "./country-info.js";
import type { TimezoneInfo } from "./timezone-info.js";

export class TZInfoDataNotFound extends StandardError {}

interface TZInfoData {
  LOCATION?: string;
  VERSION?: string;
  Version: { TZDATA: string };
  Indexes: {
    Timezones: { dataTimezones: readonly string[]; linkedTimezones: readonly string[] };
    Countries: { countries: Readonly<Record<string, CountryInfo>> };
  };
  Definitions: object;
}

interface TZInfoNamespace {
  Data: TZInfoData;
  loadPath: Record<string, () => Promise<unknown>>;
}

export class RubyDataSource extends DataSource {
  /** @noRailsEquivalent PERMANENT */
  static async load(): Promise<void> {
    const { loadPath } = TopLevel.TZInfo! as unknown as TZInfoNamespace;
    for (const feature of Object.keys(loadPath)) {
      try {
        await rbFRequire(loadPath, feature);
      } catch (e) {
        if (!(e instanceof LoadError)) throw e;
      }
    }
  }

  /** @internal */
  private readonly _dataTimezoneIdentifiers: readonly string[];

  /** @internal */
  private readonly _linkedTimezoneIdentifiers: readonly string[];

  /** @internal */
  private readonly _countryCodes: readonly string[];

  /** @internal */
  private readonly basePath: string;

  /** @internal */
  private readonly countries: Readonly<Record<string, CountryInfo>>;

  constructor() {
    super();

    try {
      rbRequireLoaded("tzinfo/data");
    } catch (e) {
      if (!(e instanceof LoadError)) throw e;
      throw new TZInfoDataNotFound(
        "The tzinfo-data gem could not be found (require 'tzinfo/data' failed).",
      );
    }

    const Data = (TopLevel.TZInfo! as unknown as TZInfoNamespace).Data;
    if (constDefined(Data, "LOCATION")) {
      this.basePath = File.join(Data.LOCATION!, "tzinfo", "data");
    } else {
      const dataFile = File.join("", "tzinfo", "data.rb");
      const path = [...LOADED_FEATURES].reverse().find((p) => p.endsWith(dataFile));
      if (path) {
        this.basePath = File.join(File.dirname(path), "data");
      } else {
        this.basePath = "tzinfo/data";
      }
    }

    this.requireIndex("timezones");
    this.requireIndex("countries");

    this._dataTimezoneIdentifiers = Data.Indexes.Timezones.dataTimezones;
    this._linkedTimezoneIdentifiers = Data.Indexes.Timezones.linkedTimezones;
    this.countries = Data.Indexes.Countries.countries;
    this._countryCodes = Object.freeze(Object.keys(this.countries).sort());
  }

  override dataTimezoneIdentifiers(): readonly string[] {
    return this._dataTimezoneIdentifiers;
  }

  override linkedTimezoneIdentifiers(): readonly string[] {
    return this._linkedTimezoneIdentifiers;
  }

  override countryCodes(): readonly string[] {
    return this._countryCodes;
  }

  override toString(): string {
    return `Ruby DataSource: ${this.versionInfo()}`;
  }

  override inspect(): string {
    return `#<TZInfo::DataSources::RubyDataSource: ${this.versionInfo()}>`;
  }

  /** @internal */
  protected override loadTimezoneInfo(identifier: string): TimezoneInfo {
    const validIdentifier = this.validateTimezoneIdentifier(identifier);
    const splitIdentifier = validIdentifier
      .replace(/-/g, "__m__")
      .replace(/\+/g, "__p__")
      .split("/");

    try {
      this.requireDefinition(splitIdentifier);

      let m: unknown = (TopLevel.TZInfo! as unknown as TZInfoNamespace).Data.Definitions;
      splitIdentifier.forEach((part) => (m = constGet(m as object, part)));
      return (m as { get(): TimezoneInfo }).get();
    } catch (e) {
      if (!(e instanceof LoadError || e instanceof NameError)) throw e;
      throw new InvalidTimezoneIdentifier(`${e.message} (loading ${validIdentifier})`, {
        cause: e,
      });
    }
  }

  /** @internal */
  protected override loadCountryInfo(code: string): CountryInfo {
    return this.lookupCountryInfo(this.countries, code);
  }

  /** @internal */
  private requireDefinition(identifier: string[]): void {
    this.requireData("definitions", ...identifier);
  }

  /** @internal */
  private requireIndex(name: string): void {
    this.requireData("indexes", name);
  }

  /** @internal */
  private requireData(...file: string[]): void {
    rbRequireLoaded(File.join(this.basePath, ...file));
  }

  /** @internal */
  private versionInfo(): string {
    const Data = (TopLevel.TZInfo! as unknown as TZInfoNamespace).Data;
    return `tzdb v${Data.Version.TZDATA}${constDefined(Data, "VERSION") ? `, tzinfo-data v${Data.VERSION}` : ""}`;
  }
}
