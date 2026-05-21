import {
  tsBody,
  tsClass,
  tsField,
  tsImport,
  tsMethod,
  tsModule,
} from "../../../template-builder/index.js";
import { NamedBase } from "../../named-base.js";
import { classify, dasherize, migrationTimestamp } from "../../base.js";

// Mirrors railties/lib/rails/generators/rails/migration/migration_generator.rb.
// hook_for :orm defers to the ORM-provided generator. This skeleton emits a
// minimal Migration shell; CreateX/AddXToY inference lives in the existing
// top-level MigrationGenerator and folds in when the ORM hook lands.
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
    const filename = `db/migrations/${timestamp}-${dasherize(this.fileName)}${this.ext()}`;
    this.createFile(filename, emitMigrationSource(classify(this.fileName), timestamp));
    return this.getCreatedFiles();
  }
}
