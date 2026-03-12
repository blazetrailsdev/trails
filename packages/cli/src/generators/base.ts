import * as fs from "node:fs";
import * as path from "node:path";

export interface GeneratorOptions {
  cwd: string;
  output: (msg: string) => void;
}

export abstract class GeneratorBase {
  protected cwd: string;
  protected output: (msg: string) => void;
  protected createdFiles: string[] = [];

  constructor(options: GeneratorOptions) {
    this.cwd = options.cwd;
    this.output = options.output;
  }

  protected createFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.cwd, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    this.createdFiles.push(relativePath);
    this.output(`      create  ${relativePath}`);
  }

  protected appendToFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.cwd, relativePath);
    if (!fs.existsSync(fullPath)) {
      this.createFile(relativePath, content);
      return;
    }
    fs.appendFileSync(fullPath, content);
    this.output(`      append  ${relativePath}`);
  }

  protected insertIntoFile(relativePath: string, marker: string, content: string): void {
    const fullPath = path.join(this.cwd, relativePath);
    if (!fs.existsSync(fullPath)) return;
    const existing = fs.readFileSync(fullPath, "utf-8");
    const idx = existing.indexOf(marker);
    if (idx === -1) return;
    const updated = existing.slice(0, idx) + content + existing.slice(idx);
    fs.writeFileSync(fullPath, updated);
    this.output(`      insert  ${relativePath}`);
  }

  protected fileExists(relativePath: string): boolean {
    return fs.existsSync(path.join(this.cwd, relativePath));
  }

  protected removeFile(relativePath: string): boolean {
    const fullPath = path.join(this.cwd, relativePath);
    if (!fs.existsSync(fullPath)) return false;
    fs.unlinkSync(fullPath);
    this.output(`      remove  ${relativePath}`);
    return true;
  }

  getCreatedFiles(): string[] {
    return [...this.createdFiles];
  }
}

export function migrationTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  const h = now.getHours().toString().padStart(2, "0");
  const min = now.getMinutes().toString().padStart(2, "0");
  const sec = now.getSeconds().toString().padStart(2, "0");
  return `${y}${m}${d}${h}${min}${sec}`;
}

export function classify(name: string): string {
  return name
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

export function tableize(name: string): string {
  // Simple pluralization: add "s", handle common cases
  const snake = name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
  if (snake.endsWith("y")) return snake.slice(0, -1) + "ies";
  if (snake.endsWith("s") || snake.endsWith("x") || snake.endsWith("sh") || snake.endsWith("ch"))
    return snake + "es";
  return snake + "s";
}

export function underscore(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

export function dasherize(name: string): string {
  return underscore(name).replace(/_/g, "-");
}

export type ColumnType =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "timestamp"
  | "references";

export function parseColumns(args: string[]): Array<{ name: string; type: ColumnType }> {
  const columns: Array<{ name: string; type: ColumnType }> = [];
  for (const arg of args) {
    if (arg.startsWith("-")) continue;
    const [name, type] = arg.split(":");
    if (name && type) {
      columns.push({ name, type: type as ColumnType });
    }
  }
  return columns;
}

export function tsType(colType: ColumnType): string {
  switch (colType) {
    case "string":
    case "text":
      return "string";
    case "integer":
    case "float":
    case "decimal":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
    case "datetime":
    case "timestamp":
      return "Date";
    case "references":
      return "number";
    default:
      return "string";
  }
}
