import {
  tsBody,
  tsClass,
  tsField,
  tsImport,
  tsMethod,
  tsModule,
} from "../../../template-builder/index.js";
import { NamedBase } from "../../named-base.js";
import { migrationTimestamp } from "../../base.js";
import { camelize } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { CreateMigration } from "../../actions/create-migration.js";

let lastTimestamp: string | null = null;

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
  migrationFileName = "";

  static exitOnFailure(): boolean {
    return true;
  }

  run(): string[] {
    if (!/^\w+$/.test(this.name)) {
      throw new Error(`Illegal name for a migration: ${this.name}`);
    }
    let timestamp = migrationTimestamp();
    if (lastTimestamp && timestamp <= lastTimestamp) {
      timestamp = (parseInt(lastTimestamp, 10) + 1).toString();
    }
    lastTimestamp = timestamp;
    const filename = `db/migrate/${timestamp}_${this.fileName}${this.ext()}`;
    if (this.behavior === "revoke") {
      this.migrationFileName = this.fileName;
      new CreateMigration(this, File.join(this.cwd, filename), "").revoke();
      return this.getCreatedFiles();
    }
    this.createFile(filename, emitMigrationSource(camelize(this.fileName), timestamp));
    return this.getCreatedFiles();
  }
}
