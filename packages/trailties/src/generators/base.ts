import {
  getFs,
  getPath,
  type FsAdapter,
  type PathAdapter,
  underscore as _underscore,
  camelize as _camelize,
  tableize as _tableize,
  dasherize as _dasherize,
} from "@blazetrails/activesupport";

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

  protected get fs(): FsAdapter {
    return getFs();
  }

  protected get path(): PathAdapter {
    return getPath();
  }

  protected isTypeScript(): boolean {
    return this.fs.existsSync(this.path.join(this.cwd, "tsconfig.json"));
  }

  protected ext(): string {
    return this.isTypeScript() ? ".ts" : ".js";
  }

  protected createFile(relativePath: string, content: string, options?: { mode?: number }): void {
    const fullPath = this.path.join(this.cwd, relativePath);
    this.fs.mkdirSync(this.path.dirname(fullPath), { recursive: true });
    this.fs.writeFileSync(fullPath, content, { mode: options?.mode });
    this.createdFiles.push(relativePath);
    this.output(`      create  ${relativePath}`);
  }

  protected appendToFile(relativePath: string, content: string): void {
    const fullPath = this.path.join(this.cwd, relativePath);
    if (!this.fs.existsSync(fullPath)) {
      this.createFile(relativePath, content);
      return;
    }
    this.fs.appendFileSync(fullPath, content);
    this.output(`      append  ${relativePath}`);
  }

  protected insertIntoFile(relativePath: string, marker: string, content: string): void {
    const fullPath = this.path.join(this.cwd, relativePath);
    if (!this.fs.existsSync(fullPath)) return;
    const existing = this.fs.readFileSync(fullPath, "utf-8");
    const idx = existing.indexOf(marker);
    if (idx === -1) return;
    const updated = existing.slice(0, idx) + content + existing.slice(idx);
    this.fs.writeFileSync(fullPath, updated);
    this.output(`      insert  ${relativePath}`);
  }

  protected fileExists(relativePath: string): boolean {
    return this.fs.existsSync(this.path.join(this.cwd, relativePath));
  }

  protected removeFile(relativePath: string): boolean {
    const fullPath = this.path.join(this.cwd, relativePath);
    if (!this.fs.existsSync(fullPath)) return false;
    this.fs.unlinkSync(fullPath);
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

export const tableize = _tableize;
export const underscore = _underscore;

export function classify(name: string): string {
  return _camelize(name.replace(/-/g, "_"));
}

export function dasherize(name: string): string {
  return _dasherize(_underscore(name));
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
  | "references"
  | "belongs_to"
  | "token"
  | "rich_text"
  | "attachment"
  | "attachments";

export function parseColumns(args: string[]): Array<{ name: string; type: ColumnType }> {
  const columns: Array<{ name: string; type: ColumnType }> = [];
  for (const arg of args) {
    if (arg.startsWith("-")) continue;
    const [name, rawType] = arg.split(":");
    if (!name || !rawType) continue;
    const type = rawType.replace(/\{[^}]*\}/, "") as ColumnType;
    columns.push({ name, type });
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
    case "belongs_to":
      return "number";
    default:
      return "string";
  }
}
