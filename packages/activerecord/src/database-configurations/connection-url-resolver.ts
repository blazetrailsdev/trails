import type { DatabaseConfigOptions } from "./database-config.js";
import {
  camelize,
  compactBlankObj as compactBlank,
  isBlank,
  reverseMerge,
  transformKeys,
} from "@blazetrails/activesupport";
import {
  type Generic,
  merge,
  RFC2396Parser,
  RuntimeError,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { protocolAdapters } from "../active-record.js";

export class ConnectionUrlResolver {
  private uri: Generic;
  private adapter: string | null;
  private query: string | null | undefined;
  private _uriParser?: RFC2396Parser;

  constructor(url: string) {
    if (isBlank(url)) throw new RuntimeError("Database URL cannot be empty");
    this.uri = this.uriParser.parse(url);
    this.adapter = this.resolvedAdapter();

    if (this.uri.opaque != null) {
      [this.uri.opaque, this.query] = stringSplit(this.uri.opaque, "?", 2);
    } else {
      this.query = this.uri.query;
    }
  }

  toHash(): DatabaseConfigOptions {
    const config: Record<string, unknown> = compactBlank(this.rawConfig());
    Object.entries(config).map(([key, value]) => {
      if (typeof value === "string") config[key] = this.uriParser.unescape(value);
    });
    return config as DatabaseConfigOptions;
  }

  /** @internal */
  private get uriParser(): RFC2396Parser {
    return (this._uriParser ??= new RFC2396Parser());
  }

  /**
   * @internal
   * @inventedArm camelize — PERMANENT
   */
  private queryHash(): Record<string, string> {
    return transformKeys(
      Object.fromEntries(
        stringSplit(this.query ?? "", "&").map((pair) => stringSplit(pair, "=", 2)),
      ),
      (key) => camelize(key, false),
    ) as Record<string, string>;
  }

  /** @internal */
  private rawConfig(): Record<string, unknown> {
    if (this.uri.opaque != null) {
      return merge(this.queryHash(), {
        adapter: this.adapter,
        database: this.uri.opaque,
      });
    } else {
      return reverseMerge(this.queryHash(), {
        adapter: this.adapter,
        username: this.uri.user,
        password: this.uri.password,
        port: this.uri.port,
        database: this.databaseFromPath(),
        host: this.uri.hostname,
      });
    }
  }

  /** @internal */
  private resolvedAdapter(): string | null {
    let adapter = this.uri.scheme && this.uri.scheme.replace(/-/g, "_");
    if (adapter != null && protocolAdapters().get(adapter) != null) {
      adapter = protocolAdapters().get(adapter) as string;
    }
    return adapter;
  }

  /** @internal */
  private databaseFromPath(): string | null {
    if (this.adapter === "sqlite3") {
      return this.uri.path;
    } else {
      return this.uri.path!.replace(/^\//, "");
    }
  }
}
