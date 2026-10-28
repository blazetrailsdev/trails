/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Thor::Base includes Thor::Invocation and Thor::Shell (`thor/v1.3.2/lib/thor/base.rb:30-34`); the class/interface merge is how those mixins surface on the type side. */
import {
  camelize,
  constantize,
  underscore as _underscore,
  dasherize as _dasherize,
  extractOptionsBang,
  humanize,
} from "@blazetrails/activesupport";
import {
  File,
  NameError,
  rbObjRespondTo,
  FileUtils,
  Pathname,
  getFs,
  include,
  hashDelete,
  regexpEscape,
  isRegisteredConstant,
} from "@blazetrails/ruby-compat";
import { Generators, type GeneratorClass } from "../generators.js";
import { GeneratorError } from "./generated-attribute.js";
import * as Actions from "./actions.js";
import type { GeneratorActionsState } from "./actions.js";
import * as TrailsActions from "./trails-actions.js";
import * as ThorActions from "@blazetrails/thor/actions";
import type { BaseConfig } from "@blazetrails/thor/base";
import { Group } from "@blazetrails/thor/group";
import type { Invocation } from "@blazetrails/thor/invocation";
import type { Command } from "@blazetrails/thor/command";
import type { Argument, ArgumentOptions } from "@blazetrails/thor/parser/argument";
import type { Option, OptionOptions } from "@blazetrails/thor/parser/option";
import type { Shell as ShellHost } from "@blazetrails/thor/shell";
import type { Basic } from "@blazetrails/thor/shell/basic";

export interface GeneratorOptions {
  force?: boolean;
  skip?: boolean;
  pretend?: boolean;
  quiet?: boolean;
  skipNamespace?: boolean;
  skipCollisionCheck?: boolean;
}

export interface GeneratorConfig extends BaseConfig {
  destinationRoot?: string | null;
  behavior?: "invoke" | "revoke" | "force" | "skip" | null;
  shell?: Basic | null;
}

export type ClassOptionConfig = OptionOptions & { group?: string };

export interface HookForOptions extends ClassOptionConfig {
  in?: string;
  as?: string;
  verbose?: string | boolean;
}

type HookYield = (
  instance: GeneratorBase,
  klass: GeneratorClass,
  command?: string | null,
) => unknown;
type HookExec = (this: never, klass: GeneratorClass) => unknown;

export type HookBlock = HookYield | HookExec;

type GroupStatics = {
  argument(name: string, options?: ArgumentOptions & { optional?: unknown }): void;
  arguments(): Argument[];
  removeArgument(...names: unknown[]): void;
  removeClassOption(...names: string[]): void;
  commands(): Record<string, Command>;
  allCommands(): Record<string, Command>;
  removeCommand(...names: unknown[]): void;
  noCommands<T>(block: () => T): T;
  classOption(name: string, options?: OptionOptions): Option;
  classOptions(): Record<string, Option>;
  invokeFromOption(...names: unknown[]): void;
  removeInvocation(...names: string[]): void;
  addRuntimeOptionsBang(): void;
  strictArgsPositionBang(): void;
  methodAdded(meth: string): void;
  namespace(name?: string | null): string;
  start(givenArgs?: string[], config?: GeneratorConfig): Promise<unknown>;
  sourcePaths: typeof ThorActions.ClassMethods.sourcePaths;
  sourcePathsForSearch: typeof ThorActions.ClassMethods.sourcePathsForSearch;
  prepareForInvocation(name: unknown, value: unknown): unknown;
  fromSuperclass(method: string, defaultValue?: unknown): unknown;
};

export interface GeneratorBase extends Invocation, GeneratorActionsState {
  shell: ShellHost["shell"];
  say: ShellHost["say"];
  sayStatus: ShellHost["sayStatus"];
}

export abstract class GeneratorBase extends (Group as unknown as (abstract new (
  args?: unknown[],
  localOptions?: unknown,
  config?: GeneratorConfig,
) => Group) &
  GroupStatics) {
  declare static _sourcePaths?: string[];
  declare static _sourceRoot?: string | null;
  /** @internal */
  declare static _hooks?: Record<string, [string | undefined, string | undefined]>;

  static {
    include(this as unknown as new (...args: unknown[]) => unknown, ThorActions.Actions);

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

    this.addRuntimeOptionsBang();
    this.strictArgsPositionBang();
  }

  static isExitOnFailure(): boolean {
    return false;
  }

  static async sourceRoot(path: string | null = null): Promise<string | null | undefined> {
    if (path != null) this._sourceRoot = path;
    if (!Object.hasOwn(this, "_sourceRoot") || this._sourceRoot == null) {
      this._sourceRoot = await this.defaultSourceRoot();
    }
    return this._sourceRoot;
  }

  static async defaultSourceRoot(): Promise<string | undefined> {
    if (!(this.baseName() != null && this.generatorName() != null)) return;
    if ((await this.defaultGeneratorRoot()) == null) return;
    const path = File.join((await this.defaultGeneratorRoot())!, "templates");
    if (await getFs().exists(path)) return path;
  }

  static baseRoot(): string {
    const path = decodeURIComponent(new URL(import.meta.url).pathname);
    return File.dirname(/^\/[A-Za-z]:/.test(path) ? path.slice(1) : path);
  }

  /** @internal */
  declare _destinationStack: string[];
  declare destinationRoot: string;
  declare options: GeneratorOptions;
  declare args: unknown[];
  declare behavior: "invoke" | "revoke";
  protected createdFiles: string[] = [];
  pendingGenerators: Array<{ what: string; args: string[] }> = [];
  afterInstallCallbacks: Array<() => void | Promise<void>> = [];

  _sourcePaths?: string[];

  declare relativeToOriginalDestinationRoot: typeof ThorActions.relativeToOriginalDestinationRoot;
  declare sourcePaths: typeof ThorActions.sourcePaths;
  declare findInSourcePaths: typeof ThorActions.findInSourcePaths;
  declare apply: OmitThisParameter<typeof ThorActions.apply>;
  declare inRoot: <T>(block: () => T | Promise<T>) => Promise<T>;
  declare injectIntoFile: (destination: string, ...args: unknown[]) => unknown;
  /** @internal */
  declare protected _cleanupOptionsAndSet: ThorActions.ActionsHost["_cleanupOptionsAndSet"];

  environment = Actions.environment;
  application = Actions.application;
  git = Actions.git;
  vendor = Actions.vendor;
  lib = Actions.lib;
  rakefile = Actions.rakefile;
  initializer = Actions.initializer;
  generate = Actions.generate;
  afterInstall = Actions.afterInstall;
  rake = Actions.rake;
  route = Actions.route;
  readme = Actions.readme;
  log = Actions.log;
  executeCommand = Actions.executeCommand;

  pkg = TrailsActions.pkg;

  static hookFor(...names: Array<string | HookForOptions | HookBlock>): void {
    const block = typeof names.at(-1) === "function" ? (names.pop() as HookBlock) : undefined;
    const options = extractOptionsBang(names) as HookForOptions;
    const inBase = hashDelete(options as Record<string, unknown>, "in") ?? this.baseName();
    const asHook = hashDelete(options as Record<string, unknown>, "as") ?? this.generatorName();

    for (const name of names as string[]) {
      if (!Object.hasOwn(this.classOptions(), name)) {
        let defaults: ClassOptionConfig;
        if (options.type === "boolean") {
          defaults = {};
        } else if ([true, false].includes(this.defaultValueForOption(name, options) as boolean)) {
          defaults = { banner: "" };
        } else {
          defaults = {
            desc: `${humanize(_underscore(name))} to be invoked`,
            banner: "NAME",
          };
        }

        this.classOption(name, Object.assign(defaults, options));
      }

      // eslint-disable-next-line @typescript-eslint/no-this-alias -- `klass = self` (`generators/base.rb:192`).
      const klass = this;

      Object.defineProperty(this, `${name}Generator`, {
        value: function (this: GroupStatics) {
          const value = this.classOptions()[name].default;
          return Generators.findByNamespace(klass.generatorName()!, value as string);
        },
        configurable: true,
        writable: true,
      });

      this.hooks()[name] = [inBase as string | undefined, asHook as string | undefined];
      if (block !== undefined) this.invokeFromOption(name, options, block);
      else this.invokeFromOption(name, options);
    }
  }

  static removeHookFor(...names: string[]): void {
    (this as unknown as GroupStatics).removeInvocation(...names);

    for (const name of names) {
      if (!rbObjRespondTo(this, `${name}Generator`)) {
        throw new NameError(
          `undefined method \`${name}Generator' for class \`#<Class:${this.name}>'`,
          `${name}Generator`,
        );
      }
      Object.defineProperty(this, `${name}Generator`, {
        value: undefined,
        configurable: true,
        writable: true,
      });
      delete this.hooks()[name];
    }
  }

  static classOption(name: string, options: ClassOptionConfig = {}): Option {
    if (!("desc" in options))
      options.desc = `Indicates when to generate ${humanize(_underscore(name)).toLowerCase()}`;
    options.aliases = this.defaultAliasesForOption(name, options) as OptionOptions["aliases"];
    options.default = this.defaultValueForOption(name, options);
    return super.classOption(name, options);
  }

  protected classCollisions(...classNames: Array<string | string[]>): void {
    if (this.behavior !== "invoke") return;
    const options = this.options as GeneratorOptions & { skipCollisionCheck?: boolean };
    if (options.skipCollisionCheck) return;
    if (options.force) return;

    for (let className of classNames.flat()) {
      className = String(className);
      if (className.trim() === "") continue;

      const nesting = className.split("::");
      const lastName = nesting.pop()!;
      const last = this.extractLastModule(nesting);

      if (
        last &&
        (isRegisteredConstant([...nesting, camelize(lastName)].join("::")) ||
          (last !== Object && Object.hasOwn(last, camelize(lastName))))
      ) {
        throw new GeneratorError(
          `The name '${className}' is either already used in your application ` +
            "or reserved by Ruby on Rails. Please choose an alternative or use --skip-collision-check " +
            "or --force to skip this check and run this generator again.",
        );
      }
    }
  }

  protected extractLastModule(nesting: string[]): object | undefined {
    let lastModule: object = Object;
    const path: string[] = [];
    for (const nest of nesting) {
      path.push(nest);
      if (isRegisteredConstant(path.join("::"))) {
        lastModule = constantize(path.join("::")) as object;
      } else if (lastModule !== Object && Object.hasOwn(lastModule, nest)) {
        lastModule = (lastModule as Record<string, object>)[nest];
      } else {
        return undefined;
      }
    }
    return lastModule;
  }

  /** @internal */
  protected static baseName(): string | undefined {
    const segments = this.name.split("::");
    while (segments.at(-1) === "") segments.pop();
    const base = segments[0];
    return base != null ? _underscore(base) : undefined;
  }

  /** @internal */
  protected static generatorName(): string | undefined {
    const segments = this.name.split("::");
    while (segments.at(-1) === "") segments.pop();
    const generator = segments.at(-1);
    return generator != null ? _underscore(generator.replace(/Generator$/, "")) : undefined;
  }

  /** @internal */
  protected static defaultValueForOption(name: string, options: ClassOptionConfig): unknown {
    return this.defaultForOption(Generators.options(), name, options, options.default);
  }

  /** @internal */
  protected static defaultAliasesForOption(
    name: string,
    options: ClassOptionConfig,
  ): string | string[] | undefined {
    return this.defaultForOption(Generators.aliases(), name, options, options.aliases) as
      | string
      | string[]
      | undefined;
  }

  /** @internal */
  protected static defaultForOption(
    config: Record<string, Record<string, unknown>>,
    name: string,
    _options: ClassOptionConfig,
    defaultValue: unknown,
  ): unknown {
    let c: Record<string, unknown> | undefined;
    const generatorName = this.generatorName();
    const baseName = this.baseName();
    if (generatorName && (c = config[generatorName]) && Object.hasOwn(c, name)) {
      return c[name];
    } else if (baseName && (c = config[baseName]) && Object.hasOwn(c, name)) {
      return c[name];
    } else if (Object.hasOwn(config["rails"], name)) {
      return config["rails"][name];
    } else {
      return defaultValue;
    }
  }

  static baseclass(): typeof GeneratorBase {
    return GeneratorBase;
  }

  /** @internal */
  protected static async defaultGeneratorRoot(): Promise<string | undefined> {
    const path = File.expandPath(
      File.join(dasherize(this.baseName()!), dasherize(this.generatorName()!)),
      this.baseRoot(),
    );
    if (await getFs().exists(path)) return path;
  }

  /** @internal */
  static hooks(): Record<string, [string | undefined, string | undefined]> {
    if (!Object.hasOwn(this, "_hooks") || this._hooks == null) {
      this._hooks = this.fromSuperclass("hooks", {}) as Record<
        string,
        [string | undefined, string | undefined]
      >;
    }
    return this._hooks;
  }

  /** @internal */
  static async prepareForInvocation(name: string | null, value: unknown): Promise<unknown> {
    const thorPrepareForInvocation = super.prepareForInvocation.bind(this);
    if (typeof value !== "string") return thorPrepareForInvocation(name, value);

    let constants: [string | undefined, string | undefined] | undefined;
    let klass: GeneratorClass | null;
    if (value != null && (constants = this.hooks()[name as string])) {
      if ((value as unknown) === true) value = name;
      return Generators.findByNamespace(
        value as string,
        constants[0] ?? null,
        constants[1] ?? null,
      );
    } else if ((klass = await Generators.findByNamespace(value))) {
      return klass;
    } else {
      return thorPrepareForInvocation(name, value);
    }
  }

  protected isTypeScript(): boolean {
    return File.isExist(File.join(this.destinationRoot, "tsconfig.json"));
  }

  protected ext(): string {
    return this.isTypeScript() ? ".ts" : ".js";
  }

  protected createFile(
    destination: string | Pathname,
    content: string,
    options?: { mode?: number },
  ): string {
    const relativePath = destination.toString();
    const fullPath = File.join(this.destinationRoot, relativePath);
    if (this.behavior === "revoke") {
      this.sayStatus("remove", relativePath);
      if (!this.options.pretend && File.isExist(fullPath)) FileUtils.rmRf(fullPath);
      return relativePath;
    }
    let status = "create";
    if (File.isExist(fullPath)) {
      if (File.read(fullPath) === content) {
        this.sayStatus("identical", relativePath);
        this.createdFiles.push(relativePath);
        return relativePath;
      }
      if (this.options.force) {
        status = "force";
      } else if (this.options.skip) {
        this.sayStatus("skip", relativePath);
        return relativePath;
      } else {
        this.sayStatus("conflict", relativePath);
        status = "force";
      }
    }
    if (!this.options.pretend) {
      FileUtils.mkdirP(File.dirname(fullPath));
      File.write(fullPath, content);
      if (options?.mode !== undefined) File.chmod(options.mode, fullPath);
    }
    Generators.addGeneratedFile(fullPath);
    this.createdFiles.push(relativePath);
    this.sayStatus(status, relativePath);
    return relativePath;
  }

  protected emptyDirectory(destination: string, config: { verbose?: boolean } = {}): string {
    const verbose = config.verbose ?? true;
    const fullPath = File.join(this.destinationRoot, destination);
    if (this.behavior === "revoke") {
      this.sayStatus("remove", destination, verbose);
      if (!this.options.pretend && File.isExist(fullPath)) FileUtils.rmRf(fullPath);
      return destination;
    }
    if (File.isExist(fullPath)) {
      this.sayStatus("exist", destination, verbose);
    } else {
      if (!this.options.pretend) FileUtils.mkdirP(fullPath);
      this.sayStatus("create", destination, verbose);
    }
    return fullPath;
  }

  protected appendToFile(relativePath: string, content: string): void {
    const fullPath = File.join(this.destinationRoot, relativePath);
    if (this.behavior === "revoke") {
      this.revokeInjection(relativePath, `(${regexpEscape(content)})([^]*)(${"$"})`, "$2$3");
      return;
    }
    if (!File.isExist(fullPath)) {
      this.createFile(relativePath, content);
      return;
    }
    File.open(fullPath, "a", (file) => file.write(content));
    this.sayStatus("append", relativePath);
  }

  protected revokeInjection(relativePath: string, pattern: string, content: string): void {
    const fullPath = File.join(this.destinationRoot, relativePath);
    this.sayStatus("subtract", relativePath);
    if (!File.isExist(fullPath)) return;
    const existing = File.read(fullPath);
    const updated = existing.replace(new RegExp(pattern, "g"), content);
    if (!this.options.pretend) File.write(fullPath, updated);
  }

  getCreatedFiles(): string[] {
    return [...this.createdFiles];
  }
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
