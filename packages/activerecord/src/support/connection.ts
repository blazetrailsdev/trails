import { getEnv } from "@blazetrails/activesupport";
import { getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { UrlConfig } from "../database-configurations/url-config.js";
import { arunitDatabaseNames } from "./arunit2-config.js";
import { loadAdapterSpecificSchema, loadSchema } from "./load-schema-helper.js";
import { stampCanonicalSchema } from "./canonical-schema-stamp.js";
import {
  CONNECTION_LANES,
  DEFAULT_CONNECTION,
  driverConfig,
  mysqlPreparedStatements,
  mysqlSettings,
  postgresSettings,
  SQLITE_FIXTURE_DATABASE,
  SQLITE_FIXTURE_DATABASE_2,
  sqliteSiblingDatabase,
  type ConnectionName,
  type EnvReader,
  type ServerSettings,
  type TestAdapterName,
} from "./config.js";

export type { TestAdapterName };

export function connectionName(read: EnvReader = getEnv): string {
  return read("ARCONN") ?? DEFAULT_CONNECTION;
}

export function activeLane(read: EnvReader = getEnv): TestAdapterName {
  const lanes: Partial<Record<string, TestAdapterName>> = CONNECTION_LANES;
  return lanes[connectionName(read)] ?? CONNECTION_LANES[DEFAULT_CONNECTION];
}

export interface TestDatabaseConfig {
  configs: DatabaseConfigurations;
  adapter: TestAdapterName;
  envConfig: HashConfig | UrlConfig;
}

interface NamedConnection {
  adapter: string;
  lane: TestAdapterName;
  build(): Promise<Partial<Record<ArunitEntryName, Record<string, unknown>>>>;
}

const ARUNIT_ENTRY_NAMES = ["arunit", "arunit2", "arunit_without_prepared_statements"] as const;
type ArunitEntryName = (typeof ARUNIT_ENTRY_NAMES)[number];

function serverHash(adapter: string, settings: ServerSettings): Record<string, unknown> {
  return { adapter, ...driverConfig(settings) };
}

const CONNECTIONS: Record<ConnectionName, NamedConnection> = {
  sqlite3: {
    adapter: "sqlite3",
    lane: "sqlite",
    build: sqliteEntries,
  },
  sqlite3_mem: {
    adapter: "sqlite3",
    lane: "sqlite",
    build: async () => ({
      arunit: { adapter: "sqlite3", database: ":memory:" },
      arunit2: { adapter: "sqlite3", database: ":memory:" },
    }),
  },
  postgresql: {
    adapter: "postgresql",
    lane: "postgres",
    build: async () => {
      const shared = serverHash("postgresql", postgresSettings());
      return {
        arunit: { ...shared, minMessages: "warning" },
        arunit2: { ...shared, database: undefined, minMessages: "warning" },
        arunit_without_prepared_statements: {
          ...shared,
          minMessages: "warning",
          preparedStatements: false,
        },
      };
    },
  },
  mysql2: {
    adapter: "mysql2",
    lane: "mysql",
    build: async () => {
      const shared = serverHash("mysql2", mysqlSettings());
      const preparedStatements = mysqlPreparedStatements();
      return {
        arunit: {
          ...shared,
          encoding: "utf8mb4",
          collation: "utf8mb4_unicode_ci",
          preparedStatements,
          variables: { time_zone: "+00:00" },
        },
        arunit2: {
          ...shared,
          database: undefined,
          encoding: "utf8mb4",
          collation: "utf8mb4_general_ci",
          preparedStatements,
        },
      };
    },
  },
};

function expandConfig(
  connection: NamedConnection,
  entries: Partial<Record<ArunitEntryName, Record<string, unknown>>>,
): HashConfig[] {
  const primaryDatabase = String(entries.arunit?.database ?? "");
  const defaultDatabase: Record<ArunitEntryName, string> = {
    arunit: primaryDatabase,
    arunit2: arunitDatabaseNames(primaryDatabase).arunit2,
    arunit_without_prepared_statements: primaryDatabase,
  };

  return ARUNIT_ENTRY_NAMES.map((name) => {
    const entry = { ...(entries[name] ?? {}) };
    entry.database ??= defaultDatabase[name];
    entry.adapter ??= connection.adapter;
    if (name === "arunit_without_prepared_statements") entry.preparedStatements ??= false;
    return new HashConfig(name, "primary", entry);
  });
}

export async function testConfigurationHashes(): Promise<{
  adapter: TestAdapterName;
  envConfig: HashConfig;
  configurationHashes: HashConfig[];
}> {
  const name = connectionName();
  const connections: Partial<Record<string, NamedConnection>> = CONNECTIONS;
  const connection = connections[name];
  if (!connection) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      `Connection "${name}" not found. Available connections: ` +
        `${Object.keys(CONNECTIONS).join(", ")}`,
    );
  }

  const configurationHashes = expandConfig(connection, await connection.build());
  const envConfig = configurationHashes[0];
  const builtAdapter = String(envConfig.configurationHash.adapter);
  if (!name.includes(builtAdapter)) {
    throw new ArgumentError(
      `The connection name did not match the adapter name. Connection name is ` +
        `'${name}' and the adapter name is '${builtAdapter}'.`,
    );
  }

  return { adapter: connection.lane, envConfig, configurationHashes };
}

async function sqliteEntries(): Promise<Record<"arunit" | "arunit2", Record<string, unknown>>> {
  const options = { adapter: "sqlite3", timeout: 5000, strict: true };
  const workerDb = getEnv("AR_TEST_WORKER_DB");
  if (workerDb) {
    return {
      arunit: { ...options, database: workerDb },
      arunit2: { ...options, database: sqliteSiblingDatabase(workerDb) },
    };
  }
  const fs = await getFsAsync();
  const path = await getPathAsync();
  await fs.mkdir?.(path.dirname(SQLITE_FIXTURE_DATABASE), { recursive: true });
  return {
    arunit: { ...options, database: SQLITE_FIXTURE_DATABASE },
    arunit2: { ...options, database: SQLITE_FIXTURE_DATABASE_2 },
  };
}

export async function connect(): Promise<TestDatabaseConfig> {
  const { adapter, envConfig, configurationHashes } = await testConfigurationHashes();
  const configs = new DatabaseConfigurations(configurationHashes);
  Base.configurations(configs);
  DatabaseTasks.databaseConfiguration = configs;

  switch (adapter) {
    case "sqlite": {
      const { SQLiteDatabaseTasks } = await import("../tasks/sqlite-database-tasks.js");
      SQLiteDatabaseTasks.register();
      break;
    }
    case "postgres": {
      const { PostgreSQLDatabaseTasks } = await import("../tasks/postgresql-database-tasks.js");
      PostgreSQLDatabaseTasks.register();
      break;
    }
    case "mysql": {
      const { MySQLDatabaseTasks } = await import("../tasks/mysql-database-tasks.js");
      MySQLDatabaseTasks.register();
      break;
    }
  }

  await Base.establishConnection("arunit");
  await ARUnit2Model.establishConnection("arunit2");

  return { configs, adapter, envConfig };
}

const CANONICAL_PROBE_TABLE = "posts";

const ADAPTER_SPECIFIC_PROBE_TABLE = "defaults";

export async function restoreWorkerConnection(): Promise<void> {
  await Base.establishConnection("arunit");
  const connection = (await Base.leaseConnection()) as unknown as {
    tableExists(name: string): Promise<boolean>;
  };
  if (!(await connection.tableExists(CANONICAL_PROBE_TABLE))) {
    const adapter = await Base.leaseConnection();
    await loadSchema(adapter);
    await stampCanonicalSchema(adapter);
  } else if (!(await connection.tableExists(ADAPTER_SPECIFIC_PROBE_TABLE))) {
    await loadAdapterSpecificSchema(await Base.leaseConnection());
  }
  await restoreSecondWorkerConnection();
}

async function restoreSecondWorkerConnection(): Promise<void> {
  await ARUnit2Model.establishConnection("arunit2");
  const { ARUNIT2_TABLES, provisionSecondDatabase } = await import("./setup-second-pool.js");
  const arunit2 = await ARUnit2Model.leaseConnection();
  const present = new Set(await arunit2.tables());
  if ([...ARUNIT2_TABLES, "dogs"].every((name) => present.has(name))) return;
  await provisionSecondDatabase();
}
