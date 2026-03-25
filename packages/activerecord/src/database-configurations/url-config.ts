import { DatabaseConfig, type DatabaseConfigOptions } from "./database-config.js";

export class UrlConfig extends DatabaseConfig {
  readonly url: string;

  constructor(
    envName: string,
    name: string,
    url: string,
    configuration: DatabaseConfigOptions = {},
  ) {
    super(envName, name, { ...configuration, url });
    this.url = url;
  }
}
