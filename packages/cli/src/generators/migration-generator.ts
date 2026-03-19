import {
  GeneratorBase,
  GeneratorOptions,
  migrationTimestamp,
  classify,
  underscore,
  dasherize,
  parseColumns,
  ColumnType,
} from "./base.js";

export class MigrationGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(name: string, args: string[]): string[] {
    const columns = parseColumns(args);
    const className = classify(name);
    const body = this.inferBody(name, className, columns);
    const timestamp = migrationTimestamp();
    const filename = `db/migrations/${timestamp}-${dasherize(name)}.ts`;

    this.createFile(
      filename,
      `import { Migration } from "@rails-ts/activerecord";

export class ${className} extends Migration {
  async up(): Promise<void> {
${body.up}
  }

  async down(): Promise<void> {
${body.down}
  }
}
`,
    );

    return this.getCreatedFiles();
  }

  private inferBody(
    name: string,
    className: string,
    columns: Array<{ name: string; type: ColumnType }>,
  ): { up: string; down: string } {
    // CreateUsers -> createTable("users", ...)
    const createMatch = name.match(/^create[_-]?(.+)$/i);
    if (createMatch) {
      const table = underscore(createMatch[1]);
      const colLines = columns.map((c) => `      t.${c.type}("${c.name}");`).join("\n");
      return {
        up: `    await this.createTable("${table}", (t) => {\n${colLines}\n      t.timestamps();\n    });`,
        down: `    await this.dropTable("${table}");`,
      };
    }

    // AddEmailToUsers -> addColumn("users", "email", "string")
    const addMatch = name.match(/^add[_-]?(.+?)[_-]?to[_-]?(.+)$/i);
    if (addMatch) {
      const table = underscore(addMatch[2]);
      const colLines = columns
        .map((c) => `    await this.addColumn("${table}", "${c.name}", "${c.type}");`)
        .join("\n");
      const downLines = columns
        .map((c) => `    await this.removeColumn("${table}", "${c.name}");`)
        .join("\n");
      return { up: colLines, down: downLines };
    }

    // RemoveEmailFromUsers -> removeColumn("users", "email")
    const removeMatch = name.match(/^remove[_-]?(.+?)[_-]?from[_-]?(.+)$/i);
    if (removeMatch) {
      const table = underscore(removeMatch[2]);
      const colLines = columns
        .map((c) => `    await this.removeColumn("${table}", "${c.name}");`)
        .join("\n");
      const downLines = columns
        .map((c) => `    await this.addColumn("${table}", "${c.name}", "${c.type}");`)
        .join("\n");
      return { up: colLines, down: downLines };
    }

    // Default: empty body
    return {
      up: "    // TODO: implement migration",
      down: "    // TODO: implement rollback",
    };
  }
}
