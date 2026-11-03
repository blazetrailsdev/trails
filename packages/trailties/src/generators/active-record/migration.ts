import { Base, Migration } from "@blazetrails/activerecord";
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
  return Migration.nextMigrationNumber(nextMigrationNumber);
}

export function dbMigratePath(this: MigrationHost): string {
  if (TopLevel.Trails?.application != null) {
    return this.configuredMigratePath() ?? this.defaultMigratePath();
  } else {
    return "db/migrate";
  }
}

export function defaultMigratePath(this: MigrationHost): string {
  return TopLevel.Trails!.application!.config.paths().get("db/migrate")!.toAry()[0];
}

export function configuredMigratePath(this: MigrationHost): string | undefined {
  const database = this.options.database;
  if (database == null) return;

  const config = Base.configurations().configsFor({
    envName: TopLevel.Trails!.env,
    name: database,
  });

  return [config?.migrationsPaths ?? []].flat()[0];
}
