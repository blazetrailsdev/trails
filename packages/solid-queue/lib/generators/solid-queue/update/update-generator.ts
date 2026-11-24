import "../../../constants.solid-queue-update-update-generator.generated.js";
import { Dir, File, extend, include, type Included } from "@blazetrails/ruby-compat";
import {
  ActiveRecordMigration,
  Base,
  ClassMethods,
  Migration,
} from "@blazetrails/trailties/generators";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UpdateGenerator
  extends Included<typeof Migration>, Included<typeof ActiveRecordMigration.Migration> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UpdateGenerator extends Base {
  static {
    this.sourceRoot(
      File.expandPath("templates", decodeURIComponent(new URL(".", import.meta.url).pathname)),
    );

    this.classOption("database", {
      type: "string",
      aliases: ["--db"],
      default: "queue",
      desc: "The database that Solid Queue uses. Defaults to `queue`",
    });

    this.methodAdded("copyNewMigrations");
  }

  /**
   * @missingRailsArgs basename — CONVERGEABLE solid-queue-update-generator-migration-templates-are-plain-ts
   * @missingRailsArgs join — CONVERGEABLE solid-queue-update-generator-migration-templates-are-plain-ts
   */
  async copyNewMigrations(): Promise<void> {
    const sourceRoot = (await (this.constructor as typeof UpdateGenerator).sourceRoot())!;
    for (const migrationFile of await Dir.globAsync(File.join(sourceRoot, "db", "*.ts.tt"))) {
      const name = File.basename(migrationFile, ".tt");
      await this.migrationTemplate(File.join("db", name), File.join(this.dbMigratePath(), name), {
        skip: true,
      });
    }
  }
}
include(UpdateGenerator, ActiveRecordMigration.Migration);
extend(UpdateGenerator, ClassMethods);
extend(UpdateGenerator, ActiveRecordMigration.ClassMethods);
