import { HashConfig } from "./hash-config.js";
import { type DatabaseConfigOptions } from "./database-config.js";
import { ConnectionUrlResolver } from "./connection-url-resolver.js";

export class UrlConfig extends HashConfig {
  readonly url: string;

  /** @missingRailsCall merge — PERMANENT */
  constructor(
    envName: string,
    name: string,
    url: string,
    configurationHash: DatabaseConfigOptions = {},
  ) {
    super(envName, name, configurationHash);

    this.url = url;
    const hash: Record<string, unknown> = {
      ...this.configurationHash,
      ...this.buildUrlHash(),
    };
    camelizeUrlKeys(hash);

    if (hash.schemaDump === "false") {
      hash.schemaDump = false;
    }

    if (hash.queryCache === "false") {
      hash.queryCache = false;
    }

    toBooleanBang(hash, "replica");
    toBooleanBang(hash, "databaseTasks");

    this._configurationHash = Object.freeze(hash as DatabaseConfigOptions);
  }

  /** @internal */
  private buildUrlHash(): DatabaseConfigOptions {
    const url = this.url;
    if (
      url == null ||
      url.startsWith("jdbc:") ||
      url.startsWith("http:") ||
      url.startsWith("https:") ||
      /^[A-Za-z]:[\\/]/.test(url)
    ) {
      return { url };
    }
    return new ConnectionUrlResolver(url).toHash();
  }

  override get database(): string | undefined {
    const explicit = super.database;
    if (explicit !== undefined) return explicit;
    return databaseFromUrl(this.url);
  }
}

function databaseFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  if (/^[A-Za-z]:[\\/]/.test(url)) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, "");
    return path || undefined;
  } catch {
    return url;
  }
}

function camelizeUrlKeys(hash: Record<string, unknown>): void {
  for (const [snake, camel] of [
    ["schema_dump", "schemaDump"],
    ["query_cache", "queryCache"],
    ["database_tasks", "databaseTasks"],
  ] as const) {
    if (snake in hash) {
      hash[camel] = hash[snake];
      delete hash[snake];
    }
  }
}

/** @internal */
export function toBooleanBang(configurationHash: Record<string, unknown>, key: string): void {
  if (typeof configurationHash[key] === "string") {
    configurationHash[key] = configurationHash[key] !== "false";
  }
}
