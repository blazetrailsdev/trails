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

/** Rails-style YYYYMMDDHHMMSS migration version prefix. */
export function migrationTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const mo = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  const h = now.getHours().toString().padStart(2, "0");
  const mi = now.getMinutes().toString().padStart(2, "0");
  const s = now.getSeconds().toString().padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}${s}`;
}

export function parseFields(tokens: string[]): FieldSpec[] {
  return tokens
    .filter((t) => t.includes(":"))
    .map((t) => {
      const [name, rawType = "string"] = t.split(":");
      if (!name) return null;
      // Strip Rails-style attribute option suffixes: title:string{40}, name:string{index}
      const type = (rawType || "string").replace(/\{[^}]*\}.*$/, "");
      return { name, type };
    })
    .filter((f): f is FieldSpec => f !== null);
}

/**
 * Normalize a user-supplied migration/model name: convert to snake_case and
 * replace path separators (/ and \\ from namespace notation) with underscores.
 */
export function normalizeSnakeName(name: string): string {
  return underscore(name).replace(/[/\\]/g, "_");
}

/** Strip a trailing `_id` suffix so `author_id:references` generates `author_id`, not `author_id_id`. */
export function normalizeRefName(name: string): string {
  return name.endsWith("_id") ? name.slice(0, -3) : name;
}

/** pluralize(underscore(x)) — mirrors Rails' `tableize`. */
function tableize(name: string): string {
  return pluralize(underscore(name));
}

function isReference(type: string): boolean {
  return type === "references" || type === "belongs_to";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function renderBody(snakeName: string, fields: FieldSpec[]): string {
  let m: RegExpExecArray | null;

  // add_*_to_* — tableize the captured segment so "add_email_to_user" → table "users"
  m = /^add_.*_to_(.+)$/.exec(snakeName);
  if (m) {
    const tbl = tableize(m[1]);
    const cols = fields
      .map((f) =>
        isReference(f.type)
          ? `    await this.addReference(${JSON.stringify(tbl)}, ${JSON.stringify(normalizeRefName(f.name))}, { foreignKey: true });`
          : `    await this.addColumn(${JSON.stringify(tbl)}, ${JSON.stringify(f.name)}, ${JSON.stringify(f.type)});`,
      )
      .join("\n");
    return cols || `    // TODO: add columns to ${tbl}`;
  }

  // remove_*_from_* — same tableize treatment
  m = /^remove_.*_from_(.+)$/.exec(snakeName);
  if (m) {
    const tbl = tableize(m[1]);
    const cols = fields
      .map((f) =>
        isReference(f.type)
          ? `    await this.removeReference(${JSON.stringify(tbl)}, ${JSON.stringify(normalizeRefName(f.name))});`
          : `    await this.removeColumn(${JSON.stringify(tbl)}, ${JSON.stringify(f.name)}, ${JSON.stringify(f.type)});`,
      )
      .join("\n");
    return cols || `    // TODO: remove columns from ${tbl}`;
  }

  // create_* — use t.column(name, type) to keep type as a string literal (no injection risk)
  m = /^create_(.+)$/.exec(snakeName);
  if (m) {
    const tbl = pluralize(m[1]);
    const cols = fields
      .map((f) =>
        isReference(f.type)
          ? `      t.references(${JSON.stringify(normalizeRefName(f.name))}, { foreignKey: true });`
          : `      t.column(${JSON.stringify(f.name)}, ${JSON.stringify(f.type)});`,
      )
      .join("\n");
    const inner = cols ? `\n${cols}\n      t.timestamps();\n    ` : "\n      t.timestamps();\n    ";
    return `    await this.createTable(${JSON.stringify(tbl)}, (t) => {${inner}});`;
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

export async function generateMigration(
  root: string,
  name: string,
  fields: FieldSpec[],
  ts: string,
  options: GenerateMigrationOptions = {},
): Promise<GenerateMigrationResult> {
  const snakeName = normalizeSnakeName(name);
  const migrateDir = join(root, "db", "migrate");
  const path = join(migrateDir, `${ts}_${snakeName}.ts`);
  // Check existence upfront so dry-run reflects what a real run would do.
  if (!options.force && (await fileExists(path))) {
    return { path, written: false, skipped: true };
  }
  if (!options.dryRun) {
    await mkdir(migrateDir, { recursive: true });
    try {
      // Atomic create: "wx" fails with EEXIST if a concurrent write beat the check above.
      await writeFile(path, renderMigration(snakeName, fields), {
        encoding: "utf8",
        flag: options.force ? "w" : "wx",
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        return { path, written: false, skipped: true };
      }
      throw err;
    }
  }
  return { path, written: !options.dryRun, skipped: false };
}
