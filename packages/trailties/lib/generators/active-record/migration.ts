import { Base, Migration as ActiveRecordMigration } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

interface MigrationHost {
  options: { database?: string };
  defaultMigratePath(): string;
  configuredMigratePath(): string | undefined;
}

export function nextMigrationNumber(
  this: { currentMigrationNumber(dirname: string): number },
  dirname: string,
): string {
  const nextMigrationNumber = this.currentMigrationNumber(dirname) + 1;
  return ActiveRecordMigration.nextMigrationNumber(nextMigrationNumber);
}

/** @internal */
export function dbMigratePath(this: MigrationHost): string {
  if (TopLevel.Trails?.application != null) {
    return this.configuredMigratePath() ?? this.defaultMigratePath();
  } else {
    return "db/migrate";
  }
}

/** @internal */
export function defaultMigratePath(this: MigrationHost): string {
  return TopLevel.Trails!.application!.config.paths().get("db/migrate")!.toAry()[0];
}

/** @internal */
export function configuredMigratePath(this: MigrationHost): string | undefined {
  const database = this.options.database;
  if (database == null) return;

  const config = Base.configurations().configsFor({
    envName: TopLevel.Trails!.env,
    name: database,
  });

  return [config?.migrationsPaths ?? []].flat()[0];
}

/** @internal */
export function primaryKeyType(this: { options: { primaryKeyType?: string } }): string | undefined {
  const keyType = this.options.primaryKeyType;
  if (keyType) return `, id: "${keyType}"`;
}

/** @internal */
export function foreignKeyType(this: { options: { primaryKeyType?: string } }): string | undefined {
  const keyType = this.options.primaryKeyType;
  if (keyType) return `, type: "${keyType}"`;
}

export const ClassMethods = { nextMigrationNumber };

export const Migration = {
  primaryKeyType,
  foreignKeyType,
  dbMigratePath,
  defaultMigratePath,
  configuredMigratePath,
};
