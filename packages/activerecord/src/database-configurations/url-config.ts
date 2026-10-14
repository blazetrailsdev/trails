import { merge } from "@blazetrails/ruby-compat";
import { HashConfig } from "./hash-config.js";
import { type DatabaseConfigOptions } from "./database-config.js";
import { ConnectionUrlResolver } from "./connection-url-resolver.js";

export class UrlConfig extends HashConfig {
  readonly url: string;

  /** @missingRailsName configurationHash — PERMANENT */
  constructor(
    envName: string,
    name: string,
    url: string,
    configurationHash: DatabaseConfigOptions = {},
  ) {
    super(envName, name, configurationHash);

    this.url = url;
    this._configurationHash = merge(this._configurationHash, this.buildUrlHash());

    if (this._configurationHash.schemaDump === "false") {
      this._configurationHash.schemaDump = false;
    }

    if ((this._configurationHash.queryCache as unknown) === "false") {
      this._configurationHash.queryCache = false;
    }

    toBooleanBang(this._configurationHash, "replica");
    toBooleanBang(this._configurationHash, "databaseTasks");

    Object.freeze(this._configurationHash);
  }

  /** @internal */
  private buildUrlHash(): DatabaseConfigOptions {
    const url = this.url;
    if (
      url == null ||
      url.startsWith("jdbc:") ||
      url.startsWith("http:") ||
      url.startsWith("https:")
    ) {
      return { url };
    }
    return new ConnectionUrlResolver(url).toHash();
  }
}

Object.defineProperty(UrlConfig, "name", {
  value: "ActiveRecord::DatabaseConfigurations::UrlConfig",
});

/** @internal */
export function toBooleanBang(configurationHash: Record<string, unknown>, key: string): void {
  if (typeof configurationHash[key] === "string") {
    configurationHash[key] = configurationHash[key] !== "false";
  }
}
