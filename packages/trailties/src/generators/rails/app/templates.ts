import type { Database } from "../../database.js";

export interface DatabaseTemplateLocals {
  appName: string;
  database: Database;
  sqliteDriver?: string;
}

const serverConfig =
  (adapter: string) =>
  ({ appName, database }: DatabaseTemplateLocals): string => `export default {
  development: {
    adapter: "${adapter}",
    database: "${appName}_development",
    host: "localhost",
    port: ${database.port},
  },
  test: {
    adapter: "${adapter}",
    database: "${appName}_test",
    host: "localhost",
    port: ${database.port},
  },
  production: {
    adapter: "${adapter}",
    url: process.env.DATABASE_URL,
  },
};
`;

export const TEMPLATES: Record<string, (locals: DatabaseTemplateLocals) => string> = {
  "config/databases/mysql.yml": serverConfig("mysql2"),

  "config/databases/postgresql.yml": serverConfig("postgresql"),

  "config/databases/sqlite3.yml": ({ sqliteDriver = "better-sqlite3" }) => {
    const adapter = sqliteDriver === "better-sqlite3" ? "sqlite3" : sqliteDriver;
    return `export default {
  development: {
    adapter: "${adapter}",
    database: "storage/development.sqlite3",
  },
  test: {
    adapter: "${adapter}",
    database: "storage/test.sqlite3",
  },
  production: {
    adapter: "${adapter}",
    database: "storage/production.sqlite3",
  },
};
`;
  },
};
