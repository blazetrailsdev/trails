import {
  tsBody,
  tsClass,
  tsField,
  tsImport,
  tsMethod,
  tsModule,
} from "../../../template-builder/index.js";
import { NamedBase } from "../../named-base.js";
import { File } from "@blazetrails/ruby-compat";
import { migrationTemplate } from "../../migration.js";
import { nextMigrationNumber } from "../../active-record/migration.js";

export function emitMigrationSource(className: string, timestamp: string): string {
  const { refs } = tsImport("@blazetrails/activerecord", { Migration: "named" });
  return tsModule({
    declarations: [
      tsClass({
        name: className,
        extends: refs.Migration,
        body: [
          tsField("version", "string", {
            static: true,
            inferType: true,
            initializer: `"${timestamp}"`,
          }),
          tsMethod({
            name: "change",
            async: true,
            params: [],
            returnType: "Promise<void>",
            body: tsBody``,
          }),
        ],
      }),
    ],
  });
}

export class MigrationGenerator extends NamedBase {
  declare ["constructor"]: typeof MigrationGenerator;
  migrationNumber = "";
  migrationFileName = "";
  migrationClassName = "";

  static exitOnFailure(): boolean {
    return true;
  }

  static nextMigrationNumber = nextMigrationNumber;

  async run(): Promise<string[]> {
    if (!/^\w+$/.test(this.name)) {
      throw new Error(`Illegal name for a migration: ${this.name}`);
    }
    const file = await migrationTemplate(
      this,
      () => emitMigrationSource(this.migrationClassName, this.migrationNumber),
      File.join("db/migrate", `${this.fileName}${this.ext()}`),
    );
    if (file) this.createdFiles.push(this.relativeToOriginalDestinationRoot(file));
    return this.getCreatedFiles();
  }
}
