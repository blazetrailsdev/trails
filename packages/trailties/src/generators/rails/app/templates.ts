import type { Database } from "../../database.js";

export interface DatabaseTemplateLocals {
  appName: string;
  database: Database;
  sqliteDriver?: string;
  packageManager?: string;
  skipEslint?: boolean;
  skipTest?: boolean;
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

const ciSetup = (packageManager: string | undefined): string => `      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version

      - name: Install dependencies
        run: corepack enable && ${packageManager} install
`;

export const TEMPLATES: Record<string, (locals: DatabaseTemplateLocals) => string> = {
  "github/ci.yml": ({ database, packageManager, skipEslint, skipTest }) => `name: CI

on:
  pull_request:
  push:
    branches: [ main ]

jobs:
${
  skipEslint
    ? ""
    : `  lint:
    runs-on: ubuntu-latest
    steps:
${ciSetup(packageManager)}
      - name: Lint code for consistent style
        run: bin/eslint --format stylish

`
}${
    skipTest
      ? ""
      : `  test:
    runs-on: ubuntu-latest

${
  database.name === "sqlite3"
    ? ""
    : database.name === "postgres"
      ? `    services:
      postgres:
        image: postgres
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: --health-cmd="pg_isready" --health-interval=10s --health-timeout=5s --health-retries=3

`
      : `    services:
      mysql:
        image: mysql
        env:
          MYSQL_ALLOW_EMPTY_PASSWORD: true
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3

`
}    steps:
${ciSetup(packageManager)}
      - name: Run tests
        env:
          TRAILS_ENV: test${
            database.name === "postgres"
              ? "\n          DATABASE_URL: postgres://postgres:postgres@localhost:5432"
              : database.name === "sqlite3"
                ? ""
                : "\n          DATABASE_URL: mysql2://127.0.0.1:3306"
          }
        run: bin/trails db test:prepare && ${packageManager} test
`
  }`,

  "github/dependabot.yml": () => `version: 2
updates:
- package-ecosystem: npm
  directory: "/"
  schedule:
    interval: daily
  open-pull-requests-limit: 10
- package-ecosystem: github-actions
  directory: "/"
  schedule:
    interval: daily
  open-pull-requests-limit: 10
`,

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
