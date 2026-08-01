/**
 * Deprecator — handles deprecation warnings for ActiveRecord.
 *
 * Mirrors: ActiveRecord.deprecator (deprecator.rb)
 * Also covers: gem_version.rb, version.rb, and MigrationProxy (migration.rb)
 *
 * Node-only: MigrationProxy uses node:module (createRequire) for synchronous
 * file loading, matching Rails' synchronous load_migration. Do not import
 * this file in browser bundles.
 */
import { createRequire } from "node:module";
import { Deprecation, getPath } from "@blazetrails/activesupport";
import type { Migration } from "./migration.js";

export { Deprecation as Deprecator };

const _deprecator = new Deprecation({ gem: "activerecord" });

export function deprecator(): Deprecation {
  return _deprecator;
}

export function gemVersion(): string {
  return "8.0.2";
}

export function version(): string {
  return gemVersion();
}

/**
 * Mirrors: ActiveRecord (the root module that exposes .deprecator)
 */
export interface ActiveRecord {
  deprecator(): Deprecation;
}

/**
 * Defers loading of the actual migration class until it is needed.
 *
 * Mirrors: ActiveRecord::MigrationProxy (defined in migration.rb,
 * mapped to deprecator.rb by the api:compare extractor)
 *
 * This is the file-loading proxy: it resolves `name` out of `filename` and
 * constructs the migration, mirroring `MigrationProxy#load_migration`'s
 * `name.constantize.new(name, version)`. It stays separate from the
 * `MigrationProxy` interface in `migration.ts` — which is the already-resolved
 * shape `Migrator` consumes, whose `loadMigration` is async — because
 * api:compare buckets the `MigrationProxy` surface under `deprecator.rb` while
 * `Migrator` must keep its collaborator type in `migration.ts`. Both now
 * delegate to a real `Migration`.
 */
export class MigrationProxy {
  name: string;
  version: string;
  filename: string;
  scope: string;

  private _migration: Migration | null = null;
  private _migrationPromise: Promise<Migration> | null = null;

  constructor(name: string, version: string, filename: string, scope: string) {
    this.name = name;
    this.version = version;
    this.filename = filename;
    this.scope = scope;
  }

  basename(): string {
    return getPath().basename(this.filename);
  }

  async migrate(direction: "up" | "down"): Promise<void> {
    return (await this.migration()).migrate(direction);
  }

  async announce(message: string): Promise<void> {
    (await this.migration()).announce(message);
  }

  async write(text = ""): Promise<void> {
    (await this.migration()).write(text);
  }

  get disableDdlTransaction(): boolean {
    if (!this._migration)
      throw new Error("MigrationProxy: await migration() before reading disableDdlTransaction");
    return !!this._migration.disableDdlTransaction;
  }

  /** @internal */
  migration(): Promise<Migration> {
    this._migrationPromise ??= this.loadMigrationAsync().then((m) => (this._migration = m));
    return this._migrationPromise;
  }

  /** @internal */
  loadMigration(): Migration {
    const req = createRequire(import.meta.url);
    delete req.cache[req.resolve(this.filename)];
    return this._instantiate(req(this.filename) as Record<string, unknown>);
  }

  /**
   * Mirrors: `name.constantize.new(name, version)` — the module export named
   * after the migration is the class, and the instance always carries the
   * proxy's name and version.
   */
  private _instantiate(mod: Record<string, unknown>, cause?: unknown): Migration {
    const klass = mod[this.name] ?? mod.default;
    if (typeof klass !== "function") {
      throw new Error(
        `Migration ${this.name} could not be loaded from ${this.filename}: ` +
          `no export named "${this.name}" or "default" found`,
        { cause },
      );
    }
    return new (klass as new (name: string, version: string) => Migration)(this.name, this.version);
  }

  /**
   * @internal
   * ESM-capable loader. Falls through to `require()` for CJS migrations and
   * uses `import(pathToFileURL(...))` for ESM files (ERR_REQUIRE_ESM).
   */
  async loadMigrationAsync(): Promise<Migration> {
    try {
      // require() works for CJS migrations; falls through to import() for ESM.
      return this.loadMigration();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ERR_REQUIRE_ESM") throw err;
      // ESM migration file — use dynamic import() via file URL.
      // Note: unlike the require() path above, import() is module-cached by the
      // Node.js ESM loader and will not reload the file if it changes during the
      // same process. Cache-busting (e.g. appending ?t=Date.now()) is unstable
      // across runtimes; in practice, ESM migrations run once per process.
      const { pathToFileURL } = await import("node:url");
      const mod = (await import(/* @vite-ignore */ pathToFileURL(this.filename).href)) as Record<
        string,
        unknown
      >;
      return this._instantiate(mod, err);
    }
  }
}
