import { mkdir, writeFile, access, unlink } from "fs/promises";
import { join } from "path";
import { camelize, pluralize } from "@blazetrails/activesupport";
import { renderMigration, normalizeSnakeName, normalizeRefName } from "./generate-migration.js";
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

  // Foreign-key declarations for reference fields (e.g. post_id: number)
  const fkAttrs = refs.map((f) => `  declare ${normalizeRefName(f.name)}_id: number;`).join("\n");
  const colAttrs = cols
    .map((f) => `  declare ${f.name}: ${TS_TYPES[f.type] ?? "string"};`)
    .join("\n");

  // Single static {} block for all associations — matches the codebase convention
  const assocCalls = refs
    .map((f) => `    this.belongsTo(${JSON.stringify(normalizeRefName(f.name))});`)
    .join("\n");
  const staticBlock = assocCalls ? `  static {\n${assocCalls}\n  }` : "";

  const parts = [fkAttrs, colAttrs, staticBlock].filter(Boolean).join("\n");
  return (
    `import { Base } from "@blazetrails/activerecord";\n\n` +
    `export class ${className} extends Base {${parts ? `\n${parts}\n` : ""}}\n`
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function generateModel(
  root: string,
  name: string,
  fields: FieldSpec[],
  ts: string,
  options: GenerateMigrationOptions = {},
): Promise<GenerateModelResult> {
  // Normalize namespace separators (Admin::User → admin_user) before building paths.
  const snakeName = normalizeSnakeName(name);
  const className = camelize(snakeName);
  const modelPath = join(root, "app", "models", `${snakeName}.ts`);
  const migrationPath = join(root, "db", "migrate", `${ts}_create_${pluralize(snakeName)}.ts`);
  // Existence check runs even in dry-run so the output reflects what a real run would do.
  if (!options.force && ((await fileExists(modelPath)) || (await fileExists(migrationPath)))) {
    return { modelPath, migrationPath, written: false, skipped: true };
  }
  if (!options.dryRun) {
    await mkdir(join(root, "app", "models"), { recursive: true });
    await mkdir(join(root, "db", "migrate"), { recursive: true });
    const writeFlag = { encoding: "utf8" as const, flag: options.force ? "w" : "wx" };
    // Atomic create: "wx" fails with EEXIST if a concurrent write beat the upfront check.
    let modelWritten = false;
    try {
      await writeFile(modelPath, renderModel(className, fields), writeFlag);
      modelWritten = true;
      await writeFile(
        migrationPath,
        renderMigration(`create_${pluralize(snakeName)}`, fields),
        writeFlag,
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // Clean up the model file if we created it in this run to avoid partial state.
        if (modelWritten) await unlink(modelPath).catch(() => undefined);
        return { modelPath, migrationPath, written: false, skipped: true };
      }
      throw err;
    }
  }
  return { modelPath, migrationPath, written: !options.dryRun, skipped: false };
}
