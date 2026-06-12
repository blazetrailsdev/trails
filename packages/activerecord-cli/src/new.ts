import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { init } from "./init.js";

export type Driver = "better-sqlite3" | "node-sqlite" | "pg" | "mysql2";

// Pinned versions match the trailties generator and root package.json.
// node-sqlite has no npm package — it's built into Node 22.5+.
const DRIVER_VERSIONS: Record<Driver, Record<string, string>> = {
  "better-sqlite3": { "better-sqlite3": "^12.6.2" },
  "node-sqlite": {},
  pg: { pg: "^8.19.0" },
  mysql2: { mysql2: "^3.18.2" },
};

const DRIVERS: Record<Driver, { adapter: string; devDb: string; testDb: string; prodDb: string }> =
  {
    "better-sqlite3": {
      adapter: "sqlite3",
      devDb: "db/development.sqlite3",
      testDb: ":memory:",
      prodDb: "db/production.sqlite3",
    },
    "node-sqlite": {
      adapter: "node-sqlite",
      devDb: "db/development.sqlite3",
      testDb: ":memory:",
      prodDb: "db/production.sqlite3",
    },
    pg: {
      adapter: "postgresql",
      devDb: "{app}_development",
      testDb: "{app}_test",
      prodDb: "{app}_production",
    },
    mysql2: {
      adapter: "mysql2",
      devDb: "{app}_development",
      testDb: "{app}_test",
      prodDb: "{app}_production",
    },
  };

function databaseConfig(appName: string, driver: Driver): string {
  const { adapter, devDb, testDb, prodDb } = DRIVERS[driver];
  const s = (db: string) => db.replace("{app}", appName);
  return `/**
 * Connection config — Rails' \`config/database.yml\`. \`establishConnection()\`
 * reads it; \`TRAILS_ENV\` selects the entry (default "development"). We key on
 * \`TRAILS_ENV\`, not \`NODE_ENV\`, which the JS ecosystem treats as a build-time
 * hint — reusing it to pick a database selects the wrong one.
 */
const config = {
  development: { adapter: "${adapter}", database: "${s(devDb)}", pool: 5 },
  test: { adapter: "${adapter}", database: "${s(testDb)}", pool: 1 },
  production: { adapter: "${adapter}", database: "${s(prodDb)}", pool: 5 },
};

export default config;
`;
}

function packageJson(appName: string, driver: Driver): string {
  return (
    JSON.stringify(
      {
        name: appName,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: { migrate: "ar db:migrate", seed: "ar db:seed", console: "ar console" },
        dependencies: {
          "@blazetrails/activerecord": "*",
          "@blazetrails/activerecord-cli": "*",
          ...DRIVER_VERSIONS[driver],
        },
        devDependencies: {
          "@blazetrails/trails-tsc": "*",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

const GITIGNORE = `node_modules/
dist/
*.sqlite3
`;

export interface NewResult {
  appDir: string;
  created: string[];
  skipped: string[];
}

export async function arNew(
  parentDir: string,
  appName: string,
  driver: Driver,
  opts: { force?: boolean } = {},
): Promise<NewResult> {
  const force = opts.force ?? false;
  const appDir = join(parentDir, appName);

  // No pre-flight existence check: mkdir is idempotent with recursive:true,
  // and each writeFile uses "wx" (or "w" with force), so per-file conflicts
  // are handled atomically without a TOCTOU window.
  await mkdir(appDir, { recursive: true });

  const flag = force ? "w" : "wx";
  const created: string[] = [];
  const skipped: string[] = [];

  async function write(rel: string, body: string): Promise<void> {
    const target = join(appDir, rel);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, body, { flag });
      created.push(rel);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      skipped.push(rel);
    }
  }

  await write("package.json", packageJson(appName, driver));
  await write(".gitignore", GITIGNORE);

  const overrides: Record<string, string> = {
    "config/database.ts": databaseConfig(appName, driver),
  };

  const initResult = await init(appDir, {
    force,
    overrides,
    driver,
    skipPackageJson: true,
  });
  for (const rel of initResult.created) created.push(rel);
  for (const rel of initResult.skipped) skipped.push(rel);

  return { appDir, created, skipped };
}

export function parseDriver(raw: string | undefined): Driver | null {
  if (raw === undefined) return "better-sqlite3";
  if (raw === "better-sqlite3" || raw === "node-sqlite" || raw === "pg" || raw === "mysql2")
    return raw;
  return null;
}
