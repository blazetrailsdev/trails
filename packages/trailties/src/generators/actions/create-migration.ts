import type { Basic } from "@blazetrails/thor/shell/basic";
import { CreateFile } from "@blazetrails/thor/actions/create-file";
import type { EmptyDirectoryBase } from "@blazetrails/thor/actions/empty-directory";
import { File, FileUtils, getFs, merge, rbEqual, rtest } from "@blazetrails/ruby-compat";
import { migrationExists } from "../migration-lookup.js";
import { GeneratorError } from "../generated-attribute.js";

export interface CreateMigrationHost {
  behavior?: "invoke" | "revoke";
  shell: Basic;
  options: { force?: boolean; skip?: boolean; pretend?: boolean };
  destinationRoot: string;
  migrationFileName: string;
  relativeToOriginalDestinationRoot(p: string): string;
}

export interface CreateMigrationConfig {
  verbose?: boolean;
  force?: boolean;
  skip?: boolean;
}

export type MigrationRenderer = string | (() => string | Promise<string>);

export class CreateMigration extends CreateFile {
  declare base: EmptyDirectoryBase & CreateMigrationHost;
  /** @internal */
  private _existingMigration?: string | false;

  constructor(
    base: CreateMigrationHost,
    destination: string,
    data: MigrationRenderer,
    config: CreateMigrationConfig = {},
  ) {
    super(
      base as EmptyDirectoryBase & CreateMigrationHost,
      destination,
      data,
      config as Record<string, unknown>,
    );
  }

  get migrationDir(): string {
    return File.dirname(this.destination);
  }

  get migrationFileName(): string {
    return this.base.migrationFileName;
  }

  override async isIdentical(): Promise<boolean> {
    return (
      (await this.isExists()) &&
      rbEqual(File.binread(this.existingMigration() as string), await this.render())
    );
  }

  override async invokeBang(): Promise<unknown> {
    if (rtest(this.isPretend())) return super.invokeBang();

    const invokedFile = await super.invokeBang();
    return (await getFs().exists(this.destination))
      ? invokedFile
      : this.relativeExistingMigration();
  }

  override async revokeBang(): Promise<unknown> {
    const sayDestination = (await this.isExists())
      ? this.relativeExistingMigration()
      : this.relativeDestination;
    this.sayStatus("remove", ":red", sayDestination);
    if (!(await this.isExists())) return undefined;
    if (!rtest(this.isPretend())) await FileUtils.rmRfAsync(this.existingMigration() as string);
    return this.existingMigration();
  }

  relativeExistingMigration(): string {
    return this.base.relativeToOriginalDestinationRoot(this.existingMigration() as string);
  }

  existingMigration(): string | false {
    return (this._existingMigration ||=
      migrationExists(this.migrationDir, this.migrationFileName) ||
      (File.isExist(this.destination) && this.destination));
  }

  override async isExists(): Promise<boolean> {
    return rtest(this.existingMigration());
  }

  /** @internal */
  protected override async onConflictBehavior(block: () => unknown): Promise<void> {
    const options = merge(this.base.options, this.config);
    if (await this.isIdentical()) {
      this.sayStatus("identical", ":blue", this.relativeExistingMigration());
    } else if (rtest(options["force"])) {
      this.sayStatus("remove", ":green", this.relativeExistingMigration());
      this.sayStatus("create", ":green");
      if (!rtest(this.isPretend())) {
        await FileUtils.rmRfAsync(this.existingMigration() as string);
        await block();
      }
    } else if (rtest(options["skip"])) {
      this.sayStatus("skip", ":yellow");
    } else {
      this.sayStatus("conflict", ":red");
      throw new GeneratorError(
        `Another migration is already named ${this.migrationFileName}: ` +
          `${this.existingMigration()}. Use --force to replace this migration ` +
          "or --skip to ignore conflicted file.",
      );
    }
  }

  /** @internal */
  protected override sayStatus(
    status: string,
    color: unknown,
    message: string = this.relativeDestination,
  ): void {
    if (rtest(this.config["verbose"])) this.base.shell.sayStatus(status, message, color);
  }
}
