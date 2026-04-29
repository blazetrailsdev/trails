/**
 * Trilogy adapter — connection adapter for MySQL databases via Trilogy.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::TrilogyAdapter
 *
 * Trilogy is GitHub's MySQL-compatible client library. The TrilogyAdapter
 * extends AbstractMysqlAdapter with Trilogy-specific connection handling,
 * similar to how Mysql2Adapter extends it with mysql2-specific handling.
 */

import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import {
  DatabaseConnectionError,
  NoDatabaseError,
  ConnectionNotEstablished,
  NotImplementedError,
} from "../errors.js";

const SSL_MODES: Record<string, number> = {
  SSL_MODE_DISABLED: 0,
  SSL_MODE_PREFERRED: 1,
  SSL_MODE_REQUIRED: 2,
  SSL_MODE_VERIFY_CA: 3,
  SSL_MODE_VERIFY_IDENTITY: 4,
};

export class TrilogyAdapter extends AbstractMysqlAdapter {
  override get adapterName(): string {
    return "Trilogy";
  }

  constructor(config: Record<string, unknown> = {}) {
    super();
    // Fail fast — no Trilogy JS driver available.
    TrilogyAdapter.newClient(config);
  }

  static newClient(config: Record<string, unknown>): unknown {
    void config;
    throw new Error("TrilogyAdapter: no Trilogy JS driver available. Use Mysql2Adapter instead.");
  }

  static parseSslMode(mode: number | string): number {
    if (typeof mode === "number") return mode;
    const trimmed = mode.trim();
    if (trimmed.length === 0) throw new Error(`Invalid SSL mode: ${JSON.stringify(mode)}`);
    let m = trimmed.toUpperCase();
    if (!m.startsWith("SSL_MODE_")) m = `SSL_MODE_${m}`;
    const sslMode = SSL_MODES[m];
    if (sslMode !== undefined) return sslMode;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    throw new Error(`Invalid SSL mode: ${mode}`);
  }

  private static _configString(config: Record<string, unknown>, key: string): string | undefined {
    const v = config[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  }

  static translateConnectError(
    config: Record<string, unknown>,
    error: { message: string; errorCode?: number },
  ): Error {
    const code = error.errorCode;
    const database = TrilogyAdapter._configString(config, "database");
    const username = TrilogyAdapter._configString(config, "username");
    const host = TrilogyAdapter._configString(config, "host");
    if ((code === 1044 || code === 1049) && database) {
      return NoDatabaseError.dbError(database);
    }
    if (code === 1045 && username) {
      return DatabaseConnectionError.usernameError(username);
    }
    if (error.message.includes("TRILOGY_DNS_ERROR") && host) {
      return DatabaseConnectionError.hostnameError(host);
    }
    return new ConnectionNotEstablished(error.message);
  }
}

/** @internal */
function isTextType(type: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#text_type? is not implemented",
  );
}

/** @internal */
function errorNumber(exception: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#error_number is not implemented",
  );
}

/** @internal */
function connect(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#connect is not implemented",
  );
}

/** @internal */
function reconnect(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#reconnect is not implemented",
  );
}

/** @internal */
function fullVersion(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#full_version is not implemented",
  );
}

/** @internal */
function getFullVersion(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#get_full_version is not implemented",
  );
}

/** @internal */
function translateException(exception: any, message?: any, sql?: any, binds?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#translate_exception is not implemented",
  );
}

/** @internal */
function defaultPreparedStatements(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#default_prepared_statements is not implemented",
  );
}

/** @internal */
function initializeTypeMap(m: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::TrilogyAdapter#initialize_type_map is not implemented",
  );
}
