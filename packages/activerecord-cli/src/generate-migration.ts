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
      const type = (rawType || "string").replace(/\{[^}]*\}.*$/, "");
      return { name, type };
    })
    .filter((f): f is FieldSpec => f !== null);
}

export function normalizeSnakeName(name: string): string {
  return underscore(name).replace(/[/\\]/g, "_");
}

export class IllegalMigrationNameError extends Error {
  constructor(name: string) {
    super(
      `Illegal name for migration file: ${name}\n\t(only lower case letters, numbers, and '_' allowed).`,
    );
    this.name = "IllegalMigrationNameError";
  }
}

export function validateMigrationName(snakeName: string): void {
  if (!/^[_a-z0-9]+$/.test(snakeName)) {
    throw new IllegalMigrationNameError(snakeName);
  }
}

export function normalizeRefName(name: string): string {
  return name.endsWith("_id") ? name.slice(0, -3) : name;
}

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
    `export class ${className} extends Migration {\n` +
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
  validateMigrationName(snakeName);
  const migrateDir = join(root, "db", "migrate");
  const path = join(migrateDir, `${ts}_${snakeName}.ts`);
  if (!options.force && (await fileExists(path))) {
    return { path, written: false, skipped: true };
  }
  if (!options.dryRun) {
    await mkdir(migrateDir, { recursive: true });
    try {
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
