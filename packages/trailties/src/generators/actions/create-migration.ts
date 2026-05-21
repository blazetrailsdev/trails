import type { FsAdapter, PathAdapter } from "@blazetrails/activesupport";
import { migrationExists } from "../migration.js";

// Mirrors railties/lib/rails/generators/actions/create_migration.rb. Rails
// inherits from Thor::Actions::CreateFile; we don't have Thor, so the
// invoke/revoke and conflict behaviors are ported directly. Status output
// goes through `host.output` (Rails uses shell.say_status).

export interface CreateMigrationHost {
  fs: FsAdapter;
  path: PathAdapter;
  output: (msg: string) => void;
  options: { force?: boolean; skip?: boolean; pretend?: boolean };
  migrationFileName: string;
  relativeToOriginalDestinationRoot(p: string): string;
}

export interface CreateMigrationConfig {
  verbose?: boolean;
  force?: boolean;
  skip?: boolean;
}

export type MigrationRenderer = string | (() => string | Promise<string>);

export class CreateMigration {
  constructor(
    public base: CreateMigrationHost,
    public destination: string,
    public data: MigrationRenderer,
    public config: CreateMigrationConfig = {},
  ) {}

  get migrationDir(): string {
    return this.base.path.dirname(this.destination);
  }

  get migrationFileName(): string {
    return this.base.migrationFileName;
  }

  async render(): Promise<string> {
    return typeof this.data === "function" ? await this.data() : this.data;
  }

  private _existingMigration?: string;

  // Mirrors Rails' `@existing_migration ||= ...` memoization in
  // create_migration.rb. Ruby's `||=` only caches truthy values, so an
  // "absent" lookup re-scans on the next call (the destination may now
  // exist after a successful invoke!).
  async existingMigration(): Promise<string | undefined> {
    if (this._existingMigration) return this._existingMigration;
    const found = await migrationExists(
      this.base.fs,
      this.base.path,
      this.migrationDir,
      this.migrationFileName,
    );
    const value =
      found ?? ((await this.base.fs.exists(this.destination)) ? this.destination : undefined);
    if (value) this._existingMigration = value;
    return value;
  }

  // Force-path / revoke remove the cached file; reset so subsequent reads
  // see the new filesystem state.
  private invalidateExistingMigration(): void {
    this._existingMigration = undefined;
  }

  async exists(): Promise<boolean> {
    return Boolean(await this.existingMigration());
  }

  async identical(): Promise<boolean> {
    const existing = await this.existingMigration();
    if (!existing) return false;
    if (!this.base.fs.readFile) throw new Error("FsAdapter.readFile is required");
    return (await this.base.fs.readFile(existing, "utf-8")) === (await this.render());
  }

  async relativeExistingMigration(): Promise<string> {
    const e = await this.existingMigration();
    return e ? this.base.relativeToOriginalDestinationRoot(e) : "";
  }

  relativeDestination(): string {
    return this.base.relativeToOriginalDestinationRoot(this.destination);
  }

  pretend(): boolean {
    return Boolean(this.base.options.pretend);
  }

  async invoke(): Promise<string> {
    const existing = await this.existingMigration();
    if (existing) await this.onConflictBehavior();
    else {
      if (!this.pretend()) await this.writeRendered();
      this.sayStatus("create", "green");
    }
    // Mirrors Rails' invoke! tail: pretend always returns the destination
    // (Thor short-circuits); otherwise return the new destination when it
    // got written (force / no-conflict) and fall back to the relative path
    // of the existing migration (identical / skip).
    if (this.pretend()) return this.destination;
    if (await this.base.fs.exists(this.destination)) return this.destination;
    return this.relativeExistingMigration();
  }

  async revoke(): Promise<string | undefined> {
    const e = await this.existingMigration();
    const sayDest = e ? this.base.relativeToOriginalDestinationRoot(e) : this.relativeDestination();
    this.sayStatus("remove", "red", sayDest);
    if (!e) return undefined;
    if (!this.pretend()) {
      if (!this.base.fs.unlink) throw new Error("FsAdapter.unlink is required");
      await this.base.fs.unlink(e);
      this.invalidateExistingMigration();
    }
    return e;
  }

  private async onConflictBehavior(): Promise<string | undefined> {
    const options = { ...this.base.options, ...this.config };
    if (await this.identical()) {
      this.sayStatus("identical", "blue", await this.relativeExistingMigration());
      return this.existingMigration();
    }
    if (options.force) {
      this.sayStatus("remove", "green", await this.relativeExistingMigration());
      this.sayStatus("create", "green");
      if (!this.pretend()) {
        const e = await this.existingMigration();
        if (e) {
          if (!this.base.fs.unlink) throw new Error("FsAdapter.unlink is required");
          await this.base.fs.unlink(e);
          this.invalidateExistingMigration();
        }
        await this.writeRendered();
      }
      return this.destination;
    }
    if (options.skip) {
      this.sayStatus("skip", "yellow");
      return this.existingMigration();
    }
    this.sayStatus("conflict", "red");
    throw new Error(
      `Another migration is already named ${this.migrationFileName}: ` +
        `${await this.existingMigration()}. Use --force to replace this ` +
        `migration or --skip to ignore conflicted file.`,
    );
  }

  private async writeRendered(): Promise<void> {
    if (!this.base.fs.writeFile) throw new Error("FsAdapter.writeFile is required");
    if (!this.base.fs.mkdir) throw new Error("FsAdapter.mkdir is required");
    await this.base.fs.mkdir(this.base.path.dirname(this.destination), { recursive: true });
    await this.base.fs.writeFile(this.destination, await this.render());
  }

  private sayStatus(status: string, _color: string, message?: string): void {
    if (this.config.verbose === false) return;
    this.base.output(`      ${status}  ${message ?? this.relativeDestination()}`);
  }
}
