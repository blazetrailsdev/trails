/** @internal */

import { getEnv } from "@blazetrails/activesupport";
import { RUN_TOKEN_ENV, slotDatabaseName } from "./run-token.js";

export type TestAdapterName = "sqlite" | "postgres" | "mysql";

export type ConnectionName = "sqlite3" | "sqlite3_mem" | "postgresql" | "mysql2";

export const DEFAULT_CONNECTION: ConnectionName = "sqlite3";

export const CONNECTION_LANES: Record<ConnectionName, TestAdapterName> = {
  sqlite3: "sqlite",
  sqlite3_mem: "sqlite",
  postgresql: "postgres",
  mysql2: "mysql",
};

export type EnvReader = (key: string) => string | undefined;

function present(read: EnvReader, key: string): string | undefined {
  const value = read(key);
  return value === undefined || value === "" ? undefined : value;
}

function intSetting(read: EnvReader, key: string, fallback: number): number {
  const raw = present(read, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(`${key} must be an integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

export interface ServerSettings {
  host: string;
  port: number;
  user?: string;
  password?: string;
  database: string;
  socket?: string;
}

export const SLOT_ENV = "AR_DB_SLOT";

function slotNumber(read: EnvReader): number {
  const slot = intSetting(read, SLOT_ENV, 1);
  if (slot < 1) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(`${SLOT_ENV} must be >= 1, got ${slot}`);
  }
  return slot;
}

function applySlot(database: string, read: EnvReader): string {
  const slot = slotNumber(read);
  const runToken = present(read, RUN_TOKEN_ENV);
  if (runToken === undefined) return slot > 1 ? `${database}_${slot}` : database;
  return slotDatabaseName(database, runToken, slot);
}

export function ownsSlotDatabase(read: EnvReader = getEnv): boolean {
  return slotNumber(read) > 1 || present(read, RUN_TOKEN_ENV) !== undefined;
}

export const ARUNIT_DATABASE = "activerecord_unittest";

export const SQLITE_FIXTURE_DATABASE = "db/fixture_database.sqlite3";

export const SQLITE_FIXTURE_DATABASE_2 = "db/fixture_database_2.sqlite3";

export function sqliteSiblingDatabase(database: string): string {
  const dot = database.lastIndexOf(".");
  const slash = Math.max(database.lastIndexOf("/"), database.lastIndexOf("\\"));
  if (dot <= slash + 1) return `${database}_2`;
  return `${database.slice(0, dot)}_2${database.slice(dot)}`;
}

export const MYSQL_USERNAME = "rails";

export function postgresSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: present(read, "PGHOST") ?? "localhost",
    port: intSetting(read, "PGPORT", 5432),
    user: present(read, "PGUSER"),
    password: present(read, "PGPASSWORD"),
    database: applySlot(ARUNIT_DATABASE, read),
  };
}

export function mysqlSettings(read: EnvReader = getEnv): ServerSettings {
  return {
    host: present(read, "MYSQL_HOST") ?? "localhost",
    port: intSetting(read, "MYSQL_PORT", 3306),
    user: MYSQL_USERNAME,
    database: applySlot(ARUNIT_DATABASE, read),
    socket: present(read, "MYSQL_SOCK"),
  };
}

export function mysqlPreparedStatements(read: EnvReader = getEnv): boolean {
  return read("MYSQL_PREPARED_STATEMENTS") !== undefined;
}

export function driverConfig(settings: ServerSettings): Record<string, unknown> {
  const { host, port, user, password, database, socket } = settings;
  return {
    host,
    port,
    database,
    ...(user === undefined ? {} : { username: user }),
    ...(password === undefined ? {} : { password }),
    ...(socket === undefined ? {} : { socket }),
  };
}

export function withDatabase(settings: ServerSettings, database: string): ServerSettings {
  return { ...settings, database };
}

function credentials({ user, password }: ServerSettings): string {
  if (user === undefined) return "";
  const auth = encodeURIComponent(user);
  return password ? `${auth}:${encodeURIComponent(password)}@` : `${auth}@`;
}

export function settingsUrl(scheme: "postgres" | "mysql", settings: ServerSettings): string {
  const { host, port, database, socket } = settings;
  const auth = credentials(settings);

  if (scheme === "postgres") {
    if (host.startsWith("/")) {
      const params = new URLSearchParams({ host, port: String(port) });
      return `postgres://${auth}/${database}?${params.toString()}`;
    }
    if (socket !== undefined) {
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new Error(
        `Postgres has no socket sub-setting; spell a socket connection as ` +
          `PGHOST=${socket} so libpq resolves it as a socket directory.`,
      );
    }
    return `postgres://${auth}${host}:${port}/${database}`;
  }

  const base = `mysql://${auth}${host}:${port}/${database}`;
  return socket === undefined ? base : `${base}?socketPath=${encodeURIComponent(socket)}`;
}

export function postgresUrl(read: EnvReader = getEnv): string {
  return settingsUrl("postgres", postgresSettings(read));
}

export function mysqlUrl(read: EnvReader = getEnv): string {
  return settingsUrl("mysql", mysqlSettings(read));
}
