import {
  camelize,
  constantize,
  isRegisteredConstant,
  underscore as _underscore,
  dasherize as _dasherize,
  extractOptionsBang,
  humanize,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  File,
  NameError,
  NoMethodError,
  rbObjRespondTo,
  FileUtils,
  getFs,
  include,
  hasKey,
  hashDelete,
  rbInspect,
  regexpEscape,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Generators, type GeneratorClass } from "../generators.js";
import { GeneratorError } from "./generated-attribute.js";
import * as Actions from "./actions.js";
import type { GeneratorActionsState } from "./actions.js";
import * as TrailsActions from "./trails-actions.js";
import * as ThorActions from "../thor/actions.js";

export interface GeneratorOptions {
  cwd: string;
  output: (msg: string) => void;
  quiet?: boolean;
  force?: boolean;
  skip?: boolean;
  pretend?: boolean;
  behavior?: "invoke" | "revoke" | "force" | "skip";
}

export interface ClassOptionConfig {
  type?: "boolean" | "string" | "numeric" | "array";
  default?: unknown;
  desc?: string;
  aliases?: string | string[];
  enum?: readonly string[];
  banner?: string;
  required?: boolean;
  group?: string;
}

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
type HookExec = (this: GeneratorBase, klass: GeneratorClass) => unknown;

export type HookBlock = HookYield | HookExec;

type Invocations = Map<unknown, string[]>;

type GeneratorConstructor = Pick<typeof GeneratorBase, "classOptions"> &
  (new (options: GeneratorOptions & { name: string; attributes: string[] }) => GeneratorBase);

export abstract class GeneratorBase implements GeneratorActionsState {
  declare private static _classOptions: Record<string, ClassOptionConfig>;
  declare private static _hooks: Record<string, [string | undefined, string | undefined]>;
  declare private static _invocations: Record<string, boolean>;
  declare private static _invocationBlocks: Record<string, HookBlock>;
  declare private static _commands: string[];
  declare static _sourcePaths?: string[];
  declare static _sourceRoot?: string | null;

  declare static sourcePaths: typeof ThorActions.ClassMethods.sourcePaths;
  declare static sourcePathsForSearch: typeof ThorActions.ClassMethods.sourcePathsForSearch;

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

    this.classOption("force", {
      type: "boolean",
      aliases: "-f",
      group: "runtime",
      desc: "Overwrite files that already exist",
    });
    this.classOption("pretend", {
      type: "boolean",
      aliases: "-p",
      group: "runtime",
      desc: "Run but do not make any changes",
    });
    this.classOption("quiet", {
      type: "boolean",
      aliases: "-q",
      group: "runtime",
      desc: "Suppress status output",
    });
    this.classOption("skip", {
      type: "boolean",
      aliases: "-s",
      group: "runtime",
      desc: "Skip files that already exist",
    });
  }

  static async sourceRoot(path: string | null = null): Promise<string | null | undefined> {
    if (path != null) this._sourceRoot = path;
    if (!Object.prototype.hasOwnProperty.call(this, "_sourceRoot") || this._sourceRoot == null) {
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

  cwd: string;
  destinationRoot: string;
  output: (msg: string) => void;
  options: GeneratorOptions;
  behavior: "invoke" | "revoke";
  protected createdFiles: string[] = [];
  pendingGenerators: Array<{ what: string; args: string[] }> = [];
  afterInstallCallbacks: Array<() => void | Promise<void>> = [];
  private _initializer?: [
    unknown[],
    unknown[] | Record<string, unknown>,
    GeneratorOptions & { invocations?: Invocations },
  ];
  private _invocations?: Invocations;
  /** @noRailsEquivalent PERMANENT */
  parentOptions?: Record<string, unknown>;

  _sourcePaths?: string[];

  declare relativeToOriginalDestinationRoot: typeof ThorActions.relativeToOriginalDestinationRoot;
  declare sourcePaths: typeof ThorActions.sourcePaths;
  declare findInSourcePaths: typeof ThorActions.findInSourcePaths;

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
    this.destinationRoot = options.cwd;
    this.output = options.output;
    const opts: Record<string, unknown> = { ...options };
    for (const [name, option] of Object.entries(
      (this.constructor as typeof GeneratorBase).classOptions(),
    )) {
      if (option.default != null && opts[name] === undefined) opts[name] = option.default;
    }
    switch (String(options.behavior)) {
      case "force":
      case "skip":
        this._cleanupOptionsAndSet(opts, options.behavior!);
        this.behavior = "invoke";
        break;
      case "revoke":
        this.behavior = "revoke";
        break;
      default:
        this.behavior = "invoke";
    }
    this.options = opts as unknown as GeneratorOptions;
  }

  /** @internal */
  private _cleanupOptionsAndSet(options: Record<string, unknown>, key: string): void {
    for (const i of ["force", "skip"]) delete options[i];
    options[key] = true;
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

  static hookFor(...names: Array<string | HookForOptions | HookBlock>): void {
    const block = typeof names.at(-1) === "function" ? (names.pop() as HookBlock) : undefined;
    const options = extractOptionsBang(names) as HookForOptions;
    const inBase = hashDelete(options as Record<string, unknown>, "in") ?? this.baseName();
    const asHook = hashDelete(options as Record<string, unknown>, "as") ?? this.generatorName();

    for (const name of names as string[]) {
      if (!hasKey(this.classOptions(), name)) {
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
        value: function (this: typeof GeneratorBase) {
          const value = this.classOptions()[name].default;
          return Generators.findByNamespace(klass.generatorName()!, value as string);
        },
        configurable: true,
        writable: true,
      });

      this.hooks()[name] = [inBase as string | undefined, asHook as string | undefined];
      this.invokeFromOption(name, options, block);
    }
  }

  static removeHookFor(...names: string[]): void {
    this.removeInvocation(...names);

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
      hashDelete(this.hooks(), name);
    }
  }

  /** @noRailsEquivalent PERMANENT */
  static removeClassOption(...names: string[]): void {
    for (const name of names) delete this.classOptions()[name];
  }

  static classOption(name: string, options: ClassOptionConfig = {}): void {
    if (!("desc" in options))
      options.desc = `Indicates when to generate ${humanize(_underscore(name)).toLowerCase()}`;
    options.aliases = this.defaultAliasesForOption(name, options);
    options.default = this.defaultValueForOption(name, options);
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
    givenArgs: string[],
    config: GeneratorOptions,
  ): Promise<string[]> {
    return GeneratorBase.dispatch.call(this, null, [...givenArgs], null, config);
  }

  /**
   * @missingRailsCall help — CONVERGEABLE generator-dispatch-help-mappings-arm
   * @missingRailsArgs new — CONVERGEABLE generator-base-thor-initialize-arguments-and-options-parse
   */
  private static async dispatch(
    this: GeneratorConstructor,
    command: string | null,
    givenArgs: unknown[],
    givenOpts: unknown[] | Record<string, unknown> | null,
    config: GeneratorOptions & { invocations?: Invocations },
    block?: (instance: GeneratorBase) => void,
  ): Promise<string[]> {
    const argumentsList: unknown[] = [];
    for (const item of givenArgs) {
      if (typeof item === "string" && /^-/.test(item)) break;
      argumentsList.push(item);
    }
    const args = argumentsList;
    const opts = givenOpts ?? givenArgs.slice(argumentsList.length);

    const { invocations, ...rest } = config;
    let toParse = args;
    let options: Record<string, unknown>;
    if (Array.isArray(opts)) {
      const arrayOptions = opts as string[];
      options = {};
      const switches = new Map<string, [string, ClassOptionConfig]>();
      for (const [name, option] of Object.entries(this.classOptions())) {
        switches.set(`--${dasherize(name)}`, [name, option]);
        for (const alias of [option.aliases ?? []].flat()) switches.set(alias, [name, option]);
      }
      const remaining: string[] = [];
      for (let i = 0; i < arrayOptions.length; i++) {
        const match = /^(--?[^=]+)(?:=([^]*))?$/.exec(arrayOptions[i]);
        if (!match) {
          remaining.push(arrayOptions[i]);
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
            remaining.push(arrayOptions[i]);
            continue;
          }
        }
        const [name, option] = switches.get(sw)!;
        if (option.type === "boolean") {
          if (value === undefined && /^(true|false)$/.test(arrayOptions[i + 1] ?? ""))
            value = arrayOptions[++i];
          value = value === undefined || value === true || value === "true";
        } else if (option.type === "array") {
          const values = value === undefined ? [] : [value];
          while (i + 1 < arrayOptions.length && !arrayOptions[i + 1].startsWith("-"))
            values.push(arrayOptions[++i]);
          value = values;
        } else if (value === undefined) value = arrayOptions[++i];
        if (option.type === "numeric") value = Number(value);
        if (option.enum && !option.enum.includes(value as string))
          throw new Error(
            `Expected '${sw}' to be one of ${option.enum.join(", ")}; got ${rbInspect(value)}`,
          );
        options[name] = value;
      }
      toParse = [...args, ...remaining];
    } else {
      options = opts;
    }
    const nonAssignedRequired = Object.entries(this.classOptions())
      .filter(
        ([name, option]) => option.required && option.default == null && options[name] == null,
      )
      .map(([name]) => `--${dasherize(name)}`);
    if (nonAssignedRequired.length > 0)
      throw new Error(
        `No value provided for required options '${nonAssignedRequired.join("', '")}'`,
      );

    const attributes = Array.isArray(toParse[1]) ? toParse[1] : toParse.slice(1);
    const instance = new this({
      ...rest,
      ...options,
      name: (toParse[0] as string | undefined) ?? "",
      attributes: attributes as string[],
    });
    instance._initializer = [args, opts, config];
    instance._invocations = invocations ?? new Map();
    block?.(instance);

    if (command != null) {
      await instance.invokeCommand(
        (this as unknown as typeof GeneratorBase).allCommands().includes(command) ? command : null,
      );
    } else {
      await instance.invokeAll();
    }
    return instance.getCreatedFiles();
  }

  protected static commands(): string[] {
    if (!Object.prototype.hasOwnProperty.call(this, "_commands")) this._commands = [];
    return this._commands;
  }

  private static allCommands(): string[] {
    const commands: string[] = [];
    for (
      let proto: GeneratorBase = this.prototype;
      proto !== GeneratorBase.prototype;
      proto = Object.getPrototypeOf(proto) as GeneratorBase
    )
      commands.unshift(...(proto.constructor as typeof GeneratorBase).commands());
    if (typeof (this.prototype as { run?: unknown }).run === "function") commands.push("run");
    for (const name of Object.keys(this.invocations()))
      commands.push(
        `_invokeFromOption${name.charAt(0).toUpperCase()}${name.slice(1).replace(/\W/g, "_")}`,
      );
    return commands;
  }

  private static invocations(): Record<string, boolean> {
    if (!Object.prototype.hasOwnProperty.call(this, "_invocations")) {
      const superclass = Object.getPrototypeOf(this) as typeof GeneratorBase;
      this._invocations = { ...(superclass.invocations?.() ?? {}) };
    }
    return this._invocations;
  }

  private static invocationBlocks(): Record<string, HookBlock> {
    if (!Object.prototype.hasOwnProperty.call(this, "_invocationBlocks")) {
      const superclass = Object.getPrototypeOf(this) as typeof GeneratorBase;
      this._invocationBlocks = { ...(superclass.invocationBlocks?.() ?? {}) };
    }
    return this._invocationBlocks;
  }

  private static invokeFromOption(name: string, options: HookForOptions, block?: HookBlock): void {
    const verbose = hasKey(options, "verbose")
      ? (options as { verbose?: string | boolean }).verbose!
      : "white";

    if (!hasKey(this.classOptions(), name)) {
      throw new ArgumentError(
        `You have to define the option ${rbInspect(name)} before setting invoke_from_option.`,
      );
    }

    this.invocations()[name] = true;
    if (block) this.invocationBlocks()[name] = block;

    Object.defineProperty(
      this.prototype,
      `_invokeFromOption${name.charAt(0).toUpperCase()}${name.slice(1).replace(/\W/g, "_")}`,
      {
        async value(this: GeneratorBase): Promise<void> {
          const options = this.options as unknown as Record<string, unknown>;
          if (!(options[name] != null && options[name] !== false)) return;

          let value = options[name];
          if (value === true) value = _underscore(name);
          const ctor = this.constructor as typeof GeneratorBase;
          const klass = await ctor.prepareForInvocation(name, value);

          if (klass) {
            this.sayStatus("invoke", value, verbose);
            const block = ctor.invocationBlocks()[name];
            await this._invokeForClassMethod(klass, null, block);
          } else {
            this.sayStatus("error", `${String(value)} [not found]`, "red");
          }
        },
        configurable: true,
        writable: true,
      },
    );
  }

  private static removeInvocation(...names: string[]): void {
    for (const name of names) {
      delete this.classOptions()[name];
      delete this.invocations()[name];
      delete this.invocationBlocks()[name];
    }
  }

  /** @noRailsEquivalent PERMANENT */
  async invoke(
    name: string | GeneratorClass | null = null,
    ...args: unknown[]
  ): Promise<string[] | void> {
    if (name == null) {
      console.warn(
        "[Thor] Calling invoke() without argument is deprecated. Please use invoke_all instead.",
      );
      return this.invokeAll();
    }

    if (Array.isArray(args[0]) || args[0] == null) args.unshift(null);
    const [sentCommand, givenArgs, givenOpts, givenConfig] = args as [
      string | null,
      unknown[] | null | undefined,
      unknown[] | Record<string, unknown> | null | undefined,
      Partial<GeneratorOptions> | null | undefined,
    ];

    const [klass, command] = await this._retrieveClassAndCommand(name, sentCommand);
    if (!klass) throw new RuntimeError(`Missing Thor class for invoke ${String(name)}`);
    if (!(klass === (GeneratorBase as unknown) || klass.prototype instanceof GeneratorBase)) {
      throw new RuntimeError(
        `Expected Thor class, got ${String((klass as { name?: string }).name ?? klass)}`,
      );
    }

    const [parsedArgs, parsedOpts, config] = this._parseInitializationOptions(
      givenArgs ?? null,
      givenOpts ?? null,
      givenConfig ?? null,
    );
    return GeneratorBase.dispatch.call(
      klass as unknown as GeneratorConstructor,
      command,
      parsedArgs,
      parsedOpts,
      config,
      (instance) => {
        instance.parentOptions = this.options as unknown as Record<string, unknown>;
      },
    );
  }

  /**
   * @missingRailsArgs run — CONVERGEABLE generator-base-thor-initialize-arguments-and-options-parse
   * @noRailsEquivalent PERMANENT
   */
  async invokeCommand(command: string | null): Promise<void> {
    if (command == null) throw new NoMethodError("undefined method `name' for nil", "name");
    const current = this._invocations!.get(this.constructor) ?? [];
    this._invocations!.set(this.constructor, current);

    if (!current.includes(command)) {
      current.push(command);
      const method = (this as unknown as Record<string, (...a: unknown[]) => unknown>)[command];
      if (command === "run") {
        const { name, attributes } = this.options as unknown as {
          name: string;
          attributes: string[];
        };
        await method.call(this, name, attributes);
      } else {
        await method.call(this);
      }
    }
  }

  /** @noRailsEquivalent PERMANENT */
  async invokeAll(): Promise<void> {
    for (const command of (this.constructor as typeof GeneratorBase).allCommands())
      await this.invokeCommand(command);
  }

  private async _retrieveClassAndCommand(
    name: string | GeneratorClass | null,
    sentCommand: string | null = null,
  ): Promise<[GeneratorClass | null, string | null]> {
    const ctor = this.constructor as typeof GeneratorBase;
    if (name == null) {
      return [ctor as unknown as GeneratorClass, null];
    } else if (typeof name === "string" && ctor.allCommands().includes(name)) {
      return [ctor as unknown as GeneratorClass, name];
    } else {
      const klass = await ctor.prepareForInvocation(null, name);
      return [klass, sentCommand];
    }
  }

  private _parseInitializationOptions(
    args: unknown[] | null,
    opts: unknown[] | Record<string, unknown> | null,
    config: Partial<GeneratorOptions> | null,
  ): [
    unknown[],
    unknown[] | Record<string, unknown>,
    GeneratorOptions & { invocations?: Invocations },
  ] {
    const [storedArgs, storedOpts, storedConfig] = this._initializer!;

    args ??= [...storedArgs];
    opts ??= Array.isArray(storedOpts) ? [...storedOpts] : { ...storedOpts };

    config ??= {};
    const merged = { ...storedConfig, ...this._sharedConfiguration(), ...config };

    return [args, opts, merged];
  }

  private _sharedConfiguration(): { invocations: Invocations } {
    return { invocations: this._invocations! };
  }

  /** @missingRailsCall with_padding — CONVERGEABLE generator-invoke-for-class-method-with-padding */
  private async _invokeForClassMethod(
    klass: GeneratorClass,
    command: string | null = null,
    block?: HookBlock,
  ): Promise<void> {
    if (block) {
      switch (block.length) {
        case 3:
          await (block as HookYield)(this, klass, command);
          break;
        case 2:
          await (block as HookYield)(this, klass);
          break;
        case 1:
          await (block as HookExec).call(this, klass);
          break;
      }
    } else {
      await this.invoke(klass, command);
    }
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
    if (generatorName && (c = config[generatorName]) && hasKey(c, name)) {
      return c[name];
    } else if (baseName && (c = config[baseName]) && hasKey(c, name)) {
      return c[name];
    } else if (hasKey(config["rails"], name)) {
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
    if (!Object.prototype.hasOwnProperty.call(this, "_hooks")) {
      const superclass = Object.getPrototypeOf(this) as typeof GeneratorBase;
      this._hooks = { ...(superclass.hooks?.() ?? {}) };
    }
    return this._hooks;
  }

  /** @internal */
  static async prepareForInvocation(
    name: string | null,
    value: unknown,
  ): Promise<GeneratorClass | null> {
    if (typeof value !== "string") return value as GeneratorClass | null;

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
      return null;
    }
  }

  protected isTypeScript(): boolean {
    return File.isExist(File.join(this.cwd, "tsconfig.json"));
  }

  protected ext(): string {
    return this.isTypeScript() ? ".ts" : ".js";
  }

  protected createFile(relativePath: string, content: string, options?: { mode?: number }): string {
    const fullPath = File.join(this.cwd, relativePath);
    if (this.behavior === "revoke") {
      this.output(`      remove  ${relativePath}`);
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
    this.output(`${status.padStart(12)}  ${relativePath}`);
    return relativePath;
  }

  protected emptyDirectory(destination: string, config: { verbose?: boolean } = {}): string {
    const verbose = config.verbose ?? true;
    const fullPath = File.join(this.cwd, destination);
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
    const fullPath = File.join(this.cwd, relativePath);
    if (this.behavior === "revoke") {
      this.revokeInjection(relativePath, `(${regexpEscape(content)})([^]*)(${"$"})`, "$2$3");
      return;
    }
    if (!File.isExist(fullPath)) {
      this.createFile(relativePath, content);
      return;
    }
    File.open(fullPath, "a", (file) => file.write(content));
    this.output(`      append  ${relativePath}`);
  }

  protected revokeInjection(relativePath: string, pattern: string, content: string): void {
    const fullPath = File.join(this.cwd, relativePath);
    this.output(`    subtract  ${relativePath}`);
    if (!File.isExist(fullPath)) return;
    const existing = File.read(fullPath);
    const updated = existing.replace(new RegExp(pattern, "g"), content);
    if (!this.options.pretend) File.write(fullPath, updated);
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
