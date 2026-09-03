import { access, mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { renderManifest } from "./generate-manifest.js";
import { FRESH_TSCONFIG, mergeTsconfig, TsconfigMergeResult } from "./tsconfig-merge.js";

const SQLITE_ADAPTER: Record<string, string> = {
  "better-sqlite3": "sqlite3",
  "node-sqlite": "node-sqlite",
};

function configDatabase(adapter: string): string {
  return `/**
 * Connection config — Rails' \`config/database.yml\`. \`establishConnection()\`
 * reads it; \`TRAILS_ENV\` selects the entry (default "development"). We key on
 * \`TRAILS_ENV\`, not \`NODE_ENV\`, which the JS ecosystem treats as a build-time
 * hint — reusing it to pick a database selects the wrong one.
 */
const config = {
  development: { adapter: "${adapter}", database: "db/development.sqlite3", pool: 5 },
  test: { adapter: "${adapter}", database: ":memory:", pool: 1 },
  production: { adapter: "${adapter}", database: "db/production.sqlite3", pool: 5 },
};

export default config;
`;
}

const CONFIG_DATABASE = configDatabase("sqlite3");

const MODELS_INDEX = renderManifest([]);

const DB_GLUE = `import { Base } from "@blazetrails/activerecord";
import { models } from "./app/models/index.js";

let connected = false;

/**
 * Establish the connection and reflect each model's columns (idempotent).
 * \`establishConnection()\` reads \`config/database.ts\` for the current
 * \`TRAILS_ENV\`. Run after migrating, before any read/write.
 */
export async function connect(): Promise<void> {
  if (connected) return;
  await Base.establishConnection();
  await Promise.all(models.map((m) => m.loadSchema()));
  connected = true;
}
`;

const DB_SEEDS = `/**
 * Idempotent seed data — the analog of Rails' \`db/seeds.rb\`, run by
 * \`ar db:seed\`. Import models from "../app/models/index.js" and create here.
 */
export async function seed(): Promise<void> {
  // Add seed data here, e.g. \`await User.findOrCreateBy({ ... });\`.
}
`;

const SCAFFOLD: ReadonlyArray<readonly [string, string]> = [
  ["config/database.ts", CONFIG_DATABASE],
  ["db/migrate/.gitkeep", ""],
  ["db/seeds.ts", DB_SEEDS],
  ["app/models/index.ts", MODELS_INDEX],
  ["db.ts", DB_GLUE],
];

const INIT_DRIVER_DEPS: Record<string, Record<string, string>> = {
  "better-sqlite3": { "better-sqlite3": "^12.6.2" },
  "node-sqlite": {},
  pg: { pg: "^8.19.0" },
  mysql2: { mysql2: "^3.18.2" },
};

const AR_DEPS = {
  "@blazetrails/activerecord": "*",
  "@blazetrails/activerecord-cli": "*",
};

const AR_DEV_DEPS = {
  "@blazetrails/trails-tsc": "*",
};

function freshPackageJson(name: string, driver: string): string {
  return (
    JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: { migrate: "ar db:migrate", seed: "ar db:seed", console: "ar console" },
        dependencies: {
          ...AR_DEPS,
          ...(INIT_DRIVER_DEPS[driver] ?? INIT_DRIVER_DEPS["better-sqlite3"]),
        },
        devDependencies: { ...AR_DEV_DEPS },
      },
      null,
      2,
    ) + "\n"
  );
}

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

const LOCKFILES: ReadonlyArray<[string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

export async function detectPackageManager(startDir: string): Promise<PackageManager> {
  try {
    const raw = await readFile(join(startDir, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { packageManager?: unknown };
    if (typeof pkg.packageManager === "string" && pkg.packageManager.length > 0) {
      const pm = pkg.packageManager.split("@")[0] as PackageManager;
      if (pm === "pnpm" || pm === "yarn" || pm === "bun" || pm === "npm") return pm;
    }
  } catch {
    /** @empty */
  }

  let dir = startDir;
  for (;;) {
    for (const [file, pm] of LOCKFILES) {
      try {
        await access(join(dir, file));
        return pm;
      } catch {
        /** @empty */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return "npm";
}

export async function addDepsToPackageJson(
  pkgPath: string,
  deps: Record<string, string>,
  devDeps: Record<string, string> = {},
): Promise<{ added: string[]; alreadyPresent: string[] }> {
  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [k: string]: unknown;
  };

  const indentMatch = raw.match(/\n([ \t]+)/);
  const indent = indentMatch ? indentMatch[1] : "  ";

  if (!pkg.dependencies) pkg.dependencies = {};

  const added: string[] = [];
  const alreadyPresent: string[] = [];

  for (const [name, version] of Object.entries(deps)) {
    if (Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) {
      alreadyPresent.push(name);
    } else {
      pkg.dependencies[name] = version;
      added.push(name);
    }
  }

  if (Object.keys(devDeps).length > 0) {
    if (!pkg.devDependencies) pkg.devDependencies = {};
    for (const [name, version] of Object.entries(devDeps)) {
      if (Object.prototype.hasOwnProperty.call(pkg.devDependencies, name)) {
        alreadyPresent.push(name);
      } else {
        pkg.devDependencies[name] = version;
        added.push(name);
      }
    }
  }

  if (added.length > 0) {
    await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n", "utf8");
  }

  return { added, alreadyPresent };
}

export interface InitResult {
  created: string[];
  skipped: string[];
  packageJsonUpdated?: { added: string[]; alreadyPresent: string[] };
  tsconfigMerged?: TsconfigMergeResult;
}

export interface InitOptions {
  force?: boolean;
  overrides?: Record<string, string>;
  driver?: string;
  skipPackageJson?: boolean;
  skipTsconfig?: boolean;
}

export async function init(root: string, opts: InitOptions = {}): Promise<InitResult> {
  const {
    force = false,
    overrides = {},
    driver = "better-sqlite3",
    skipPackageJson = false,
    skipTsconfig = false,
  } = opts;
  const driverAdapter = SQLITE_ADAPTER[driver];
  const effectiveOverrides: Record<string, string> =
    driverAdapter && driverAdapter !== "sqlite3"
      ? { "config/database.ts": configDatabase(driverAdapter), ...overrides }
      : overrides;
  const created: string[] = [];
  const skipped: string[] = [];
  let packageJsonUpdated: InitResult["packageJsonUpdated"];
  let tsconfigMerged: InitResult["tsconfigMerged"];

  if (!skipPackageJson) {
    const pkgPath = join(root, "package.json");
    let pkgExists = false;
    try {
      await access(pkgPath);
      pkgExists = true;
    } catch {
      /** @empty */
    }

    if (pkgExists && !force) {
      const deps: Record<string, string> = {
        ...AR_DEPS,
        ...(INIT_DRIVER_DEPS[driver] ?? INIT_DRIVER_DEPS["better-sqlite3"]),
      };
      packageJsonUpdated = await addDepsToPackageJson(pkgPath, deps, AR_DEV_DEPS);
    } else {
      const name = basename(root);
      const body = freshPackageJson(name, driver);
      await writeFile(pkgPath, body, { flag: force ? "w" : "wx" });
      created.push("package.json");
    }
  }

  if (!skipTsconfig && !Object.prototype.hasOwnProperty.call(effectiveOverrides, "tsconfig.json")) {
    const tsconfigPath = join(root, "tsconfig.json");
    let tsconfigExists = false;
    try {
      await access(tsconfigPath);
      tsconfigExists = true;
    } catch {
      /** @empty */
    }

    if (tsconfigExists && !force) {
      const existing = await readFile(tsconfigPath, "utf8");
      tsconfigMerged = mergeTsconfig(existing);
      if (tsconfigMerged.changed) {
        await writeFile(tsconfigPath, tsconfigMerged.content, "utf8");
      }
    } else {
      try {
        await writeFile(tsconfigPath, FRESH_TSCONFIG, { flag: force ? "w" : "wx" });
        created.push("tsconfig.json");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        skipped.push("tsconfig.json");
      }
    }
  }

  for (const [rel, defaultBody] of SCAFFOLD) {
    const body = Object.prototype.hasOwnProperty.call(effectiveOverrides, rel)
      ? effectiveOverrides[rel]
      : defaultBody;
    const target = join(root, rel);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, body, { flag: force ? "w" : "wx" });
      created.push(rel);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      skipped.push(rel);
    }
  }
  return { created, skipped, packageJsonUpdated, tsconfigMerged };
}
