import { File, FileUtils } from "@blazetrails/ruby-compat";
import { migrationExists } from "../migration-lookup.js";

// Mirrors railties/lib/rails/generators/actions/create_migration.rb. Rails
// inherits from Thor::Actions::CreateFile; we don't have Thor, so the
// invoke/revoke and conflict behaviors are ported directly. Status output
// goes through `host.output` (Rails uses shell.say_status). Filesystem and
// path access go through Ruby `File` / `FileUtils`.

export interface CreateMigrationHost {
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
    return File.dirname(this.destination);
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
  existingMigration(): string | undefined {
    if (this._existingMigration) return this._existingMigration;
    const found = migrationExists(this.migrationDir, this.migrationFileName);
    const value = found ?? (File.isExist(this.destination) ? this.destination : undefined);
    if (value) this._existingMigration = value;
    return value;
  }

  // Force-path / revoke remove the cached file; reset so subsequent reads
  // see the new filesystem state.
  private invalidateExistingMigration(): void {
    this._existingMigration = undefined;
  }

  exists(): boolean {
    return Boolean(this.existingMigration());
  }

  async identical(): Promise<boolean> {
    const existing = this.existingMigration();
    if (!existing) return false;
    return File.binread(existing) === (await this.render());
  }

  relativeExistingMigration(): string {
    const existingMigration = this.existingMigration();
    return existingMigration ? this.base.relativeToOriginalDestinationRoot(existingMigration) : "";
  }

  relativeDestination(): string {
    return this.base.relativeToOriginalDestinationRoot(this.destination);
  }

  pretend(): boolean {
    return Boolean(this.base.options.pretend);
  }

  async invoke(): Promise<string> {
    const existing = this.existingMigration();
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
    if (File.isExist(this.destination)) return this.destination;
    return this.relativeExistingMigration();
  }

  revoke(): string | undefined {
    const e = this.existingMigration();
    const sayDest = e ? this.base.relativeToOriginalDestinationRoot(e) : this.relativeDestination();
    this.sayStatus("remove", "red", sayDest);
    if (!e) return undefined;
    if (!this.pretend()) {
      FileUtils.rmR(e, { force: true });
      this.invalidateExistingMigration();
    }
    return e;
  }

  private async onConflictBehavior(): Promise<string | undefined> {
    const options = { ...this.base.options, ...this.config };
    if (await this.identical()) {
      this.sayStatus("identical", "blue", this.relativeExistingMigration());
      return this.existingMigration();
    }
    if (options.force) {
      this.sayStatus("remove", "green", this.relativeExistingMigration());
      this.sayStatus("create", "green");
      if (!this.pretend()) {
        const e = this.existingMigration();
        if (e) {
          FileUtils.rmR(e, { force: true });
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
        `${this.existingMigration()}. Use --force to replace this ` +
        `migration or --skip to ignore conflicted file.`,
    );
  }

  private async writeRendered(): Promise<void> {
    FileUtils.mkdirP(File.dirname(this.destination));
    File.write(this.destination, await this.render());
  }

  private sayStatus(status: string, _color: string, message?: string): void {
    if (this.config.verbose === false) return;
    this.base.output(`      ${status}  ${message ?? this.relativeDestination()}`);
  }
}
