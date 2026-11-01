import { CreateFile } from "@blazetrails/thor/actions/create-file";
import type { EmptyDirectoryBase } from "@blazetrails/thor/actions/empty-directory";
import { File, FileUtils, getFs, merge, rbEqual, rtest } from "@blazetrails/ruby-compat";
import { migrationExists } from "../migration-lookup.js";
import { GeneratorError } from "../generated-attribute.js";

export interface CreateMigrationHost extends EmptyDirectoryBase {
  behavior?: "invoke" | "revoke";
  migrationFileName: string;
}

export type CreateMigrationConfig = {
  verbose?: boolean;
  force?: boolean;
  skip?: boolean;
};

export type MigrationRenderer = string | (() => string | Promise<string>);

export class CreateMigration extends CreateFile {
  declare base: CreateMigrationHost;
  /** @internal */
  private _existingMigration?: string | false;

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

  override async invokeBang(): Promise<string> {
    if (rtest(this.isPretend())) return super.invokeBang();

    const invokedFile = await super.invokeBang();
    return (await getFs().exists(this.destination))
      ? invokedFile
      : this.relativeExistingMigration();
  }

  /** @missingRailsCall rm_rf — CONVERGEABLE call-gate-credits-file-utils-async */
  override async revokeBang(): Promise<string | undefined> {
    const sayDestination = (await this.isExists())
      ? this.relativeExistingMigration()
      : this.relativeDestination;
    this.sayStatus("remove", ":red", sayDestination);
    if (!(await this.isExists())) return undefined;
    if (!rtest(this.isPretend())) await FileUtils.rmRfAsync(this.existingMigration() as string);
    return this.existingMigration() as string;
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

  /**
   * @internal
   * @missingRailsCall rm_rf — CONVERGEABLE call-gate-credits-file-utils-async
   */
  protected override async onConflictBehavior(block: () => unknown): Promise<void> {
    // eslint-disable-next-line blazetrails/ruby-compat-native-required -- base.options is a HashWithIndifferentAccess, which merge dispatches on
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
