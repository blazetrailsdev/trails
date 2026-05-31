import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { camelize, pluralize } from "@blazetrails/activesupport";
import { renderMigration, exists, normalizeSnakeName } from "./generate-migration.js";
import type { FieldSpec, GenerateMigrationOptions } from "./generate-migration.js";

export type { FieldSpec };

export interface GenerateModelResult {
  modelPath: string;
  migrationPath: string;
  written: boolean;
  skipped: boolean;
}

const TS_TYPES: Record<string, string> = {
  integer: "number",
  bigint: "number",
  float: "number",
  decimal: "number",
  boolean: "boolean",
  date: "Date",
  datetime: "Date",
  timestamp: "Date",
};

function renderModel(className: string, fields: FieldSpec[]): string {
  const refs = fields.filter((f) => f.type === "references" || f.type === "belongs_to");
  const cols = fields.filter((f) => f.type !== "references" && f.type !== "belongs_to");
  const assocs = refs.map((f) => `  static { this.belongsTo("${f.name}"); }`).join("\n");
  const attrs = cols.map((f) => `  declare ${f.name}: ${TS_TYPES[f.type] ?? "string"};`).join("\n");
  const body = [assocs, attrs].filter(Boolean).join("\n");
  return (
    `import { Base } from "@blazetrails/activerecord";\n\n` +
    `export class ${className} extends Base {${body ? `\n${body}\n` : ""}}\n`
  );
}

export async function generateModel(
  root: string,
  name: string,
  fields: FieldSpec[],
  ts: number,
  options: GenerateMigrationOptions = {},
): Promise<GenerateModelResult> {
  // Normalize namespace separators (Admin::User → admin_user) before building paths.
  const snakeName = normalizeSnakeName(name);
  const className = camelize(snakeName);
  const modelPath = join(root, "app", "models", `${snakeName}.ts`);
  const migrationPath = join(root, "db", "migrate", `${ts}_create_${pluralize(snakeName)}.ts`);
  if (!options.dryRun) {
    await mkdir(join(root, "app", "models"), { recursive: true });
    await mkdir(join(root, "db", "migrate"), { recursive: true });
    if (!options.force && ((await exists(modelPath)) || (await exists(migrationPath)))) {
      return { modelPath, migrationPath, written: false, skipped: true };
    }
    await writeFile(modelPath, renderModel(className, fields), "utf8");
    await writeFile(
      migrationPath,
      renderMigration(`create_${pluralize(snakeName)}`, fields),
      "utf8",
    );
  }
  return { modelPath, migrationPath, written: !options.dryRun, skipped: false };
}
