import {
  underscore as _underscore,
  dasherize as _dasherize,
  humanize,
} from "@blazetrails/activesupport";
import { File, FileUtils, rbInspect } from "@blazetrails/ruby-compat";
import * as Actions from "./actions.js";
import type { GeneratorActionsState } from "./actions.js";
import * as TrailsActions from "./trails-actions.js";

export interface GeneratorOptions {
  cwd: string;
  output: (msg: string) => void;
  quiet?: boolean;
  behavior?: "invoke" | "revoke";
}

export interface ClassOptionConfig {
  type?: "boolean" | "string" | "numeric";
  default?: unknown;
  desc?: string;
  aliases?: string | string[];
  enum?: readonly string[];
}

export abstract class GeneratorBase implements GeneratorActionsState {
  declare private static _classOptions: Record<string, ClassOptionConfig>;

  static {
    this.classOption("skipNamespace", {
      type: "boolean",
      default: false,
      desc: "Skip namespace (affects only isolated engines)",
    });
    this.classOption("skipCollisionCheck", {
      type: "boolean",
      default: false,
      desc: "Skip collision check",
    });
  }

  cwd: string;
  output: (msg: string) => void;
  options: GeneratorOptions;
  behavior: "invoke" | "revoke";
  protected createdFiles: string[] = [];
  pendingGenerators: Array<{ what: string; args: string[] }> = [];
  afterInstallCallbacks: Array<() => void | Promise<void>> = [];

  log = Actions.log;
  generate = Actions.generate;
  git = Actions.git;
  afterInstall = Actions.afterInstall;
  rake = Actions.rake;
  executeCommand = Actions.executeCommand;

  pkg = TrailsActions.pkg;
  route = TrailsActions.route;
  environment = TrailsActions.environment;
  application = TrailsActions.environment;
  initializer = TrailsActions.initializer;

  constructor(options: GeneratorOptions) {
    this.cwd = options.cwd;
    this.output = options.output;
    const opts: Record<string, unknown> = { ...options };
    for (const [name, option] of Object.entries(
      (this.constructor as typeof GeneratorBase).classOptions(),
    )) {
      if (option.default != null && opts[name] === undefined) opts[name] = option.default;
    }
    this.options = opts as unknown as GeneratorOptions;
    this.behavior = options.behavior === "revoke" ? "revoke" : "invoke";
  }

  /** @noRailsEquivalent PERMANENT */
  say(message: unknown = "", _color: string | null = null): void {
    if (this.isQuiet()) return;

    this.output(String(message));
  }

  /** @noRailsEquivalent PERMANENT */
  sayStatus(status: unknown, message: unknown, logStatus: string | boolean = true): void {
    if (this.isQuiet() || logStatus === false) return;
    const spaces = "  ";
    const statusText = String(status).padStart(12);
    const margin = " ".repeat(statusText.length) + spaces;

    const text = String(message)
      .replace(/(\r\n|\r|\n)$/, "")
      .replace(/\n(?=[^])/g, `\n${margin}`);
    this.output(`${statusText}${spaces}${text}`);
  }

  /** @noRailsEquivalent PERMANENT */
  isQuiet(): boolean {
    return !!this.options.quiet;
  }

  static classOption(name: string, options: ClassOptionConfig = {}): void {
    if (!("desc" in options))
      options.desc = `Indicates when to generate ${humanize(_underscore(name)).toLowerCase()}`;
    this.classOptions()[name] = options;
  }

  /** @noRailsEquivalent PERMANENT */
  static classOptions(): Record<string, ClassOptionConfig> {
    if (!Object.prototype.hasOwnProperty.call(this, "_classOptions")) {
      const superclass = Object.getPrototypeOf(this) as typeof GeneratorBase;
      this._classOptions = { ...(superclass.classOptions?.() ?? {}) };
    }
    return this._classOptions;
  }

  /** @noRailsEquivalent PERMANENT */
  static classOptionsHelp(output: (msg: string) => void): void {
    const rows = Object.entries(this.classOptions()).map(([name, option]) => {
      const sw = `--${dasherize(name)}`;
      const aliases = [option.aliases ?? []].flat();
      let usage =
        option.type === "boolean"
          ? `[${sw}], [--no-${dasherize(name)}], [--skip-${dasherize(name)}]`
          : `[${sw}=${_underscore(name).toUpperCase()}]`;
      if (aliases.length) usage = `${aliases.join(", ")}, ${usage}`;
      const notes = [option.desc ?? ""];
      if (option.type !== "boolean" && option.default != null)
        notes.push(`Default: ${String(option.default)}`);
      if (option.enum) notes.push(`Possible values: ${option.enum.join(", ")}`);
      return [usage, notes] as const;
    });
    if (rows.length === 0) return;
    const width = Math.max(...rows.map(([usage]) => usage.length));
    output("Options:");
    for (const [usage, notes] of rows) {
      output(`  ${usage.padEnd(width)}  # ${notes[0]}`);
      for (const note of notes.slice(1)) output(`  ${"".padEnd(width)}  # ${note}`);
    }
  }

  static async start(
    this: Pick<typeof GeneratorBase, "classOptions"> &
      (new (options: GeneratorOptions & { name: string; attributes: string[] }) => GeneratorBase),
    args: string[],
    config: GeneratorOptions,
  ): Promise<string[]> {
    const options: Record<string, unknown> = {};
    const switches = new Map<string, [string, ClassOptionConfig]>();
    for (const [name, option] of Object.entries(this.classOptions())) {
      switches.set(`--${dasherize(name)}`, [name, option]);
      for (const alias of [option.aliases ?? []].flat()) switches.set(alias, [name, option]);
    }
    const remaining: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const match = /^(--?[^=]+)(?:=([^]*))?$/.exec(args[i]);
      if (!match) {
        remaining.push(args[i]);
        continue;
      }
      let sw = match[1].replace(/_/g, "-");
      let value: unknown = match[2];
      if (!switches.has(sw)) {
        const negated = /^--(?:no|skip)-(.+)$/.exec(sw);
        if (negated && switches.get(`--${negated[1]}`)?.[1].type === "boolean") {
          sw = `--${negated[1]}`;
          value = false;
        } else {
          remaining.push(args[i]);
          continue;
        }
      }
      const [name, option] = switches.get(sw)!;
      if (option.type === "boolean") {
        if (value === undefined && /^(true|false)$/.test(args[i + 1] ?? "")) value = args[++i];
        value = value === undefined || value === true || value === "true";
      } else if (value === undefined) value = args[++i];
      if (option.type === "numeric") value = Number(value);
      if (option.enum && !option.enum.includes(value as string))
        throw new Error(
          `Expected '${sw}' to be one of ${option.enum.join(", ")}; got ${rbInspect(value)}`,
        );
      options[name] = value;
    }

    const generator = new this({
      ...config,
      ...options,
      name: remaining[0] ?? "",
      attributes: remaining.slice(1),
    });
    const run = (generator as { run?: (...a: unknown[]) => unknown }).run;
    if (typeof run === "function")
      await run.call(generator, remaining[0] ?? "", remaining.slice(1));
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

  protected readFile(relativePath: string): string {
    return File.read(File.join(this.cwd, relativePath));
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
  | "digest"
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
