import { access, mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { renderManifest } from "./generate-manifest.js";

// The files `ar init` writes, mirroring the §4.7 layout in the
// standalone-activerecord-cli proposal. `db/migrate/` is a directory, kept
// under git via a `.gitkeep`.
const CONFIG_DATABASE = `/**
 * Connection config — Rails' \`config/database.yml\`. \`establishConnection()\`
 * reads it; \`TRAILS_ENV\` selects the entry (default "development"). We key on
 * \`TRAILS_ENV\`, not \`NODE_ENV\`, which the JS ecosystem treats as a build-time
 * hint — reusing it to pick a database selects the wrong one.
 */
const config = {
  development: { adapter: "sqlite3", database: "db/development.sqlite3", pool: 5 },
  test: { adapter: "sqlite3", database: ":memory:", pool: 1 },
  production: { adapter: "sqlite3", database: "db/production.sqlite3", pool: 5 },
};

export default config;
`;

// The empty starter manifest is rendered by the generator itself, so
// `ar init` and `ar generate:manifest` agree byte-for-byte — re-running the
// generator on a freshly-`init`ed project (or `--check` in CI) reports no drift.
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

/** Files (path relative to root → body) that `ar init` scaffolds. */
const SCAFFOLD: ReadonlyArray<readonly [string, string]> = [
  ["config/database.ts", CONFIG_DATABASE],
  ["db/migrate/.gitkeep", ""],
  ["db/seeds.ts", DB_SEEDS],
  ["app/models/index.ts", MODELS_INDEX],
  ["db.ts", DB_GLUE],
];

// Pinned driver peer versions — same values as new.ts to stay in sync.
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

/** Detect the package manager by inspecting `packageManager` field then walking up for lockfiles. */
export async function detectPackageManager(startDir: string): Promise<PackageManager> {
  // packageManager field takes precedence over lockfile detection.
  try {
    const raw = await readFile(join(startDir, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { packageManager?: unknown };
    if (typeof pkg.packageManager === "string" && pkg.packageManager.length > 0) {
      const pm = pkg.packageManager.split("@")[0] as PackageManager;
      if (pm === "pnpm" || pm === "yarn" || pm === "bun" || pm === "npm") return pm;
    }
  } catch {
    // no package.json or parse error → continue to lockfile walk
  }

  let dir = startDir;
  for (;;) {
    for (const [file, pm] of LOCKFILES) {
      try {
        await access(join(dir, file));
        return pm;
      } catch {
        // not present here
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return "npm";
}

/** Add deps to an existing package.json, preserving key order and indentation. */
export async function addDepsToPackageJson(
  pkgPath: string,
  deps: Record<string, string>,
): Promise<{ added: string[]; alreadyPresent: string[] }> {
  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; [k: string]: unknown };

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

  if (added.length > 0) {
    await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n", "utf8");
  }

  return { added, alreadyPresent };
}

export interface InitResult {
  /** Paths (relative to root) that were written. */
  created: string[];
  /** Paths (relative to root) skipped because a file already existed. */
  skipped: string[];
  /** Set when an existing package.json was updated (not created fresh). */
  packageJsonUpdated?: { added: string[]; alreadyPresent: string[] };
}

export interface InitOptions {
  /** Overwrite existing files instead of skipping them. */
  force?: boolean;
  /** Per-path content overrides (relative paths → body). `ar new` uses this to inject driver-specific config. */
  overrides?: Record<string, string>;
  /** Driver peer to add to package.json (default: "better-sqlite3"). */
  driver?: string;
  /**
   * Skip all package.json management (creation and dep injection).
   * Set by `ar new`, which writes its own package.json before calling init().
   */
  skipPackageJson?: boolean;
}

/**
 * Scaffold a standalone-activerecord project under `root`. Existing files are
 * skipped by default; pass `force: true` to overwrite them.
 *
 * If a `package.json` already exists, its `dependencies` are updated in place
 * instead of overwriting the file. Pass `force: true` to replace it with a
 * fresh scaffold.
 */
export async function init(root: string, opts: InitOptions = {}): Promise<InitResult> {
  const {
    force = false,
    overrides = {},
    driver = "better-sqlite3",
    skipPackageJson = false,
  } = opts;
  const created: string[] = [];
  const skipped: string[] = [];
  let packageJsonUpdated: InitResult["packageJsonUpdated"];

  if (!skipPackageJson) {
    const pkgPath = join(root, "package.json");
    let pkgExists = false;
    try {
      await access(pkgPath);
      pkgExists = true;
    } catch {
      // doesn't exist yet
    }

    if (pkgExists && !force) {
      const deps: Record<string, string> = {
        ...AR_DEPS,
        ...(INIT_DRIVER_DEPS[driver] ?? INIT_DRIVER_DEPS["better-sqlite3"]),
      };
      packageJsonUpdated = await addDepsToPackageJson(pkgPath, deps);
    } else {
      const name = basename(root);
      const body = freshPackageJson(name, driver);
      await writeFile(pkgPath, body, { flag: force ? "w" : "wx" });
      created.push("package.json");
    }
  }

  for (const [rel, defaultBody] of SCAFFOLD) {
    const body = Object.prototype.hasOwnProperty.call(overrides, rel)
      ? overrides[rel]
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
  return { created, skipped, packageJsonUpdated };
}
