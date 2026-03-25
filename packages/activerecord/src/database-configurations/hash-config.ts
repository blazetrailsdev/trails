import { DatabaseConfig, type DatabaseConfigOptions } from "./database-config.js";

export class HashConfig extends DatabaseConfig {
  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    super(envName, name, configuration);
  }
}
