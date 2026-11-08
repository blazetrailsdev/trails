import { File, extend, include, type Extended, type Included } from "@blazetrails/ruby-compat";
import {
  Base,
  ClassMethods,
  Migration,
  ActiveRecordMigration,
} from "@blazetrails/trailties/generators";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface UpdateGenerator extends Included<typeof Migration> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UpdateGenerator extends Base {
  static {
    void this.sourceRoot(
      File.expandPath("templates", decodeURIComponent(new URL(".", import.meta.url).pathname)),
    );
    this.methodAdded("copyFiles");
  }

  migrationNumber = "";
  migrationFileName = "";
  migrationClassName = "";

  declare static migrationLookupAt: Extended<typeof ClassMethods>["migrationLookupAt"];
  declare static migrationExists: Extended<typeof ClassMethods>["migrationExists"];
  declare static currentMigrationNumber: Extended<typeof ClassMethods>["currentMigrationNumber"];
  static nextMigrationNumber = ActiveRecordMigration.nextMigrationNumber;

  dbMigratePath = ActiveRecordMigration.dbMigratePath;
  defaultMigratePath = ActiveRecordMigration.defaultMigratePath;
  configuredMigratePath = ActiveRecordMigration.configuredMigratePath;

  async copyFiles(): Promise<void> {
    await this.migrationTemplate(
      "db/migrate/create_compact_channel.ts",
      "db/cable_migrate/create_compact_channel.ts",
    );
  }
}
include(UpdateGenerator, Migration);
extend(UpdateGenerator, ClassMethods);
