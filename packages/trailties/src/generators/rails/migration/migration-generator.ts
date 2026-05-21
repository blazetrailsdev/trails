import { camelize } from "@blazetrails/activesupport";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { migrationTimestamp } from "../../base.js";

// Mirrors railties/lib/rails/generators/rails/migration/migration_generator.rb.
// Rails' `hook_for :orm, required: true` defers to an ORM-provided generator;
// trailties emits a minimal ORM-agnostic migration scaffold directly.
export class MigrationGenerator extends NamedBase {
  constructor(options: NamedBaseOptions) {
    super(options);
  }

  static exitOnFailure(): boolean {
    return true;
  }

  run(): string[] {
    const ext = this.ext();
    const filename = `db/migrate/${migrationTimestamp()}_${this.fileName}${ext}`;
    const className = camelize(this.fileName);
    const cols = this.attributes
      .map((a) => `      t.column("${a.columnName()}", "${a.type}");`)
      .join("\n");
    this.createFile(
      filename,
      `// migration: ${className}
export default {
  up: async (m: { createTable: (n: string, fn: (t: { column: (n: string, t: string) => void }) => void) => Promise<void> }) => {
    await m.createTable("${this.pluralName()}", (t) => {
${cols}
    });
  },
  down: async () => {},
};
`,
    );
    return this.getCreatedFiles();
  }
}
