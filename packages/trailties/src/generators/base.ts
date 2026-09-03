import {
  underscore as _underscore,
  camelize as _camelize,
  dasherize as _dasherize,
} from "@blazetrails/activesupport";
import { File, FileUtils } from "@blazetrails/ruby-compat";
import * as Actions from "./actions.js";
import type { GeneratorActionsState } from "./actions.js";
import * as TrailsActions from "./trails-actions.js";

export interface GeneratorOptions {
  cwd: string;
  output: (msg: string) => void;
}

export abstract class GeneratorBase implements GeneratorActionsState {
  cwd: string;
  output: (msg: string) => void;
  protected createdFiles: string[] = [];
  pendingGenerators: Array<{ what: string; args: string[] }> = [];
  afterInstallCallbacks: Array<() => void | Promise<void>> = [];

  generate = Actions.generate;
  git = Actions.git;
  afterInstall = Actions.afterInstall;
  rake = Actions.rake;
  executeCommand = Actions.executeCommand;

  pkg = TrailsActions.pkg;
  route = TrailsActions.route;
  environment = TrailsActions.environment;
  initializer = TrailsActions.initializer;

  constructor(options: GeneratorOptions) {
    this.cwd = options.cwd;
    this.output = options.output;
  }

  static async start(
    this: new (options: GeneratorOptions & { name: string; attributes: string[] }) => GeneratorBase,
    args: string[],
    config: GeneratorOptions,
  ): Promise<string[]> {
    const generator = new this({ ...config, name: args[0] ?? "", attributes: args.slice(1) });
    const run = (generator as { run?: (...a: unknown[]) => unknown }).run;
    if (typeof run === "function") await run.call(generator, args[0] ?? "", args.slice(1));
    return generator.getCreatedFiles();
  }

  protected isTypeScript(): boolean {
    return File.isExist(File.join(this.cwd, "tsconfig.json"));
  }

  protected ext(): string {
    return this.isTypeScript() ? ".ts" : ".js";
  }

  protected createFile(relativePath: string, content: string, options?: { mode?: number }): void {
    const fullPath = File.join(this.cwd, relativePath);
    FileUtils.mkdirP(File.dirname(fullPath));
    File.write(fullPath, content);
    if (options?.mode !== undefined) File.chmod(options.mode, fullPath);
    this.createdFiles.push(relativePath);
    this.output(`      create  ${relativePath}`);
  }

  protected appendToFile(relativePath: string, content: string): void {
    const fullPath = File.join(this.cwd, relativePath);
    if (!File.isExist(fullPath)) {
      this.createFile(relativePath, content);
      return;
    }
    File.open(fullPath, "a", (file) => file.write(content));
    this.output(`      append  ${relativePath}`);
  }

  protected insertIntoFile(relativePath: string, marker: string, content: string): void {
    const fullPath = File.join(this.cwd, relativePath);
    if (!File.isExist(fullPath)) return;
    const existing = File.read(fullPath);
    const idx = existing.indexOf(marker);
    if (idx === -1) return;
    const updated = existing.slice(0, idx) + content + existing.slice(idx);
    File.write(fullPath, updated);
    this.output(`      insert  ${relativePath}`);
  }

  protected fileExists(relativePath: string): boolean {
    return File.isExist(File.join(this.cwd, relativePath));
  }

  protected removeFile(relativePath: string): boolean {
    const fullPath = File.join(this.cwd, relativePath);
    if (!File.isExist(fullPath)) return false;
    File.delete(fullPath);
    this.output(`      remove  ${relativePath}`);
    return true;
  }

  getCreatedFiles(): string[] {
    return [...this.createdFiles];
  }
}

export function migrationTimestamp(): string {
  // boundary: generator timestamp uses local-clock components for the
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
