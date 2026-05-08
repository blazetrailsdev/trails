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
 */
export class MigrationProxy {
  name: string;
  version: string;
  filename: string;
  scope: string;

  private _migration: object | null = null;

  constructor(name: string, version: string, filename: string, scope: string) {
    this.name = name;
    this.version = version;
    this.filename = filename;
    this.scope = scope;
  }

  basename(): string {
    return getPath().basename(this.filename);
  }

  migrate(direction: "up" | "down"): Promise<void> {
    return (this.migration() as { migrate(d: "up" | "down"): Promise<void> }).migrate(direction);
  }

  announce(message: string): void {
    (this.migration() as { announce(msg: string): void }).announce(message);
  }

  write(text = ""): void {
    (this.migration() as { write(t: string): void }).write(text);
  }

  get disableDdlTransaction(): boolean {
    return !!(this.migration() as { disableDdlTransaction?: boolean }).disableDdlTransaction;
  }

  /** @internal */
  migration(): object {
    this._migration ??= this.loadMigration();
    return this._migration;
  }

  /** @internal */
  loadMigration(): object {
    const req = createRequire(import.meta.url);
    delete req.cache[req.resolve(this.filename)];
    const mod = req(this.filename) as Record<string, new (name: string, version: string) => object>;
    const klass = mod[this.name] ?? mod.default;
    if (typeof klass !== "function") {
      throw new Error(
        `Migration ${this.name} could not be loaded from ${this.filename}: ` +
          `no export named "${this.name}" or "default" found`,
      );
    }
    return new (klass as new (name: string, version: string) => object)(this.name, this.version);
  }

  /**
   * @internal
   * ESM-capable loader. The sync `loadMigration()` / `migration()` path is
   * retained for backward compatibility; wiring this into Migrator would
   * require making `MigrationProxy.migration()` async, cascading to the
   * `MigrationProxy` interface in migration.ts. In practice, the trailties
   * migration-loader already uses `import(pathToFileURL(...))` so ESM
   * migrations are handled before they reach this class.
   */
  async loadMigrationAsync(): Promise<object> {
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
        new (name: string, version: string) => object
      >;
      const klass = mod[this.name] ?? mod.default;
      if (typeof klass !== "function") {
        throw new Error(
          `Migration ${this.name} could not be loaded from ${this.filename}: ` +
            `no export named "${this.name}" or "default" found`,
          { cause: err },
        );
      }
      return new (klass as new (name: string, version: string) => object)(this.name, this.version);
    }
  }
}
