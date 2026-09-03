import { createRequire } from "node:module";
import { Deprecation } from "@blazetrails/activesupport";
import { getPath } from "@blazetrails/ruby-compat";
import type { Migration } from "./migration.js";
import { gemVersion } from "./gem-version.js";

export { Deprecation as Deprecator };

const _deprecator = new Deprecation();

export function deprecator(): Deprecation {
  return _deprecator;
}

export function version(): string {
  return gemVersion();
}

export interface ActiveRecord {
  deprecator(): Deprecation;
}

export class MigrationProxy {
  name: string;
  version: number;
  filename: string;
  scope: string;

  private _migration: Migration | null = null;
  private _migrationPromise: Promise<Migration> | null = null;

  constructor(name: string, version: number, filename: string, scope: string) {
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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE MigrationProxy#migration (migration.rb:1190) made async because the migration file loads through a dynamic import.
   */
  migration(): Promise<Migration> {
    this._migrationPromise ??= this.loadMigrationAsync().then((m) => (this._migration = m));
    return this._migrationPromise;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE MigrationProxy#load_migration (migration.rb:1194); the sync arm kept for CJS migrations.
   */
  loadMigration(): Migration {
    const req = createRequire(import.meta.url);
    delete req.cache[req.resolve(this.filename)];
    return this._instantiate(req(this.filename) as Record<string, unknown>);
  }

  private _instantiate(mod: Record<string, unknown>, cause?: unknown): Migration {
    const klass = mod[this.name] ?? mod.default;
    if (typeof klass !== "function") {
      throw new Error(
        `Migration ${this.name} could not be loaded from ${this.filename}: ` +
          `no export named "${this.name}" or "default" found`,
        cause === undefined ? undefined : { cause },
      );
    }
    return new (klass as new (name: string, version: number) => Migration)(this.name, this.version);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async loadMigrationAsync(): Promise<Migration> {
    try {
      return this.loadMigration();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ERR_REQUIRE_ESM") throw err;
      const { pathToFileURL } = await import("node:url");
      const mod = (await import(pathToFileURL(this.filename).href)) as Record<string, unknown>;
      return this._instantiate(mod, err);
    }
  }
}
