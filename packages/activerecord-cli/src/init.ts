import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
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

export interface InitResult {
  /** Paths (relative to root) that were written. */
  created: string[];
  /** Paths (relative to root) skipped because a file already existed. */
  skipped: string[];
}

export interface InitOptions {
  /** Overwrite existing files instead of skipping them. */
  force?: boolean;
  /** Per-path content overrides (relative paths → body). `ar new` uses this to inject driver-specific config. */
  overrides?: Record<string, string>;
}

/**
 * Scaffold a standalone-activerecord project under `root`. Existing files are
 * skipped by default; pass `force: true` to overwrite them.
 */
export async function init(root: string, opts: InitOptions = {}): Promise<InitResult> {
  const { force = false, overrides = {} } = opts;
  const created: string[] = [];
  const skipped: string[] = [];
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
  return { created, skipped };
}
