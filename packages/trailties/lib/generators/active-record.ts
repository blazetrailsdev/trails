import "../constants.active-record.generated.js";
import { File, extend, include, type Extended, type Included } from "@blazetrails/ruby-compat";
import { NamedBase } from "./named-base.js";
import * as Generators from "./migration.js";
import type { CreateMigrationConfig, MigrationRenderer } from "./actions/create-migration.js";
import { ClassMethods, Migration } from "./active-record/migration.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base
  extends
    Omit<Included<typeof Generators.Migration>, "createMigration">,
    Included<typeof Migration> {
  createMigration(
    destination: string,
    data: unknown,
    config?: CreateMigrationConfig,
    block?: Exclude<MigrationRenderer, string> | null,
  ): Promise<string | undefined>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base extends NamedBase {
  declare options: NamedBase["options"] & { primaryKeyType?: string; timestamps?: boolean };
  migrationNumber = "";
  migrationFileName = "";
  migrationClassName = "";

  declare static migrationLookupAt: Extended<typeof Generators.ClassMethods>["migrationLookupAt"];
  declare static isMigrationExists: Extended<typeof Generators.ClassMethods>["isMigrationExists"];
  declare static currentMigrationNumber: Extended<
    typeof Generators.ClassMethods
  >["currentMigrationNumber"];
  declare static nextMigrationNumber: Extended<typeof ClassMethods>["nextMigrationNumber"];

  static override baseRoot(): string {
    return __dir__;
  }
}

include(Base, Generators.Migration);
include(Base, Migration);
extend(Base, Generators.ClassMethods);
extend(Base, ClassMethods);

Object.defineProperty(Base, "name", { value: "ActiveRecord::Generators::Base" });
