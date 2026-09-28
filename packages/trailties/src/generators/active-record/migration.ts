import { Migration } from "@blazetrails/activerecord";
import { currentMigrationNumber } from "../migration.js";

export function nextMigrationNumber(dirname: string): string {
  const nextMigrationNumber = currentMigrationNumber(dirname) + 1;
  return Migration.nextMigrationNumber(nextMigrationNumber);
}
