import { mkdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { camelize, underscore, pluralize } from "@blazetrails/activesupport";

export interface FieldSpec {
  name: string;
  type: string;
}

export interface GenerateMigrationOptions {
  force?: boolean;
  dryRun?: boolean;
}

export interface GenerateMigrationResult {
  path: string;
  written: boolean;
  skipped: boolean;
}

export function parseFields(tokens: string[]): FieldSpec[] {
  return tokens
    .filter((t) => t.includes(":"))
    .map((t) => {
      const [name, type = "string"] = t.split(":");
      return { name, type };
    });
}

function renderBody(snakeName: string, fields: FieldSpec[]): string {
  let m: RegExpExecArray | null;
  m = /^add_.*_to_(.+)$/.exec(snakeName);
  if (m) {
    const tbl = m[1];
    const cols = fields
      .map((f) => `    this.addColumn("${tbl}", "${f.name}", "${f.type}");`)
      .join("\n");
    return cols || `    // add columns to ${tbl}`;
  }
  m = /^remove_.*_from_(.+)$/.exec(snakeName);
  if (m) {
    const tbl = m[1];
    const cols = fields
      .map((f) => `    this.removeColumn("${tbl}", "${f.name}", "${f.type}");`)
      .join("\n");
    return cols || `    // remove columns from ${tbl}`;
  }
  m = /^create_(.+)$/.exec(snakeName);
  if (m) {
    const tbl = pluralize(m[1]);
    const cols = fields.map((f) => `      t.${f.type}("${f.name}");`).join("\n");
    const inner = cols ? `\n${cols}\n      t.timestamps();\n    ` : "\n      t.timestamps();\n    ";
    return `    this.createTable("${tbl}", (t) => {${inner}});`;
  }
  return "    // TODO: implement migration";
}

export function renderMigration(snakeName: string, fields: FieldSpec[]): string {
  const className = camelize(snakeName);
  return (
    `import { Migration } from "@blazetrails/activerecord";\n\n` +
    `export default class ${className} extends Migration {\n` +
    `  async change(): Promise<void> {\n` +
    `${renderBody(snakeName, fields)}\n` +
    `  }\n` +
    `}\n`
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function generateMigration(
  root: string,
  name: string,
  fields: FieldSpec[],
  ts: number,
  options: GenerateMigrationOptions = {},
): Promise<GenerateMigrationResult> {
  const snakeName = underscore(name);
  const path = join(root, "db", "migrate", `${ts}_${snakeName}.ts`);
  if (!options.dryRun) {
    await mkdir(join(root, "db", "migrate"), { recursive: true });
    if (!options.force && (await exists(path))) return { path, written: false, skipped: true };
    await writeFile(path, renderMigration(snakeName, fields), "utf8");
  }
  return { path, written: !options.dryRun, skipped: false };
}
