import {
  ArgumentError,
  aryDeleteIf,
  compact,
  eachPair,
  env,
  Errno,
  exit,
  extend,
  File,
  Hash,
  hashDelete,
  hasKey,
  include,
  included,
  initialize,
  last,
  merge,
  max,
  mergeBang,
  NotImplementedError,
  rbArgv,
  rbFSend,
  rbInspect,
  rbModAttrReader,
  rbModAttrWriter,
  rbModName,
  rbModPublicMethodDefined,
  rbObjAsString,
  rbObjClone,
  rbObjDup,
  rbObjIsKindOf,
  rbObjRespondTo,
  rbProgname,
  rtest,
  RuntimeError,
  stringSplit,
  toI,
  TypeError,
  warn,
} from "@blazetrails/ruby-compat";
import type { Command } from "./command.js";
import { Invocation } from "./invocation.js";
import { Error as ThorError, InvocationError, UndefinedCommandError } from "./error.js";
import { NestedContext } from "./nested-context.js";
import type {
  HashWithIndifferentAccess,
  ThorOptions,
} from "./core-ext/hash-with-indifferent-access.js";
import { Argument, type ArgumentOptions } from "./parser/argument.js";
import { Arguments } from "./parser/arguments.js";
import { Option, type OptionOptions } from "./parser/option.js";
import { Options } from "./parser/options.js";
import { Base as ThorBase, Shell } from "./shell.js";
import type { Basic } from "./shell/basic.js";
import { namespaceFromThorClass } from "./util.js";

export const HELP_MAPPINGS = ["-h", "-?", "--help", "-D"];

export const THOR_RESERVED_WORDS = [
  "invoke",
  "shell",
  "options",
  "behavior",
  "root",
  "destination_root",
  "relative_root",
  "action",
  "add_file",
  "create_file",
  "in_root",
  "inside",
  "run",
  "run_ruby_script",
];

export const TEMPLATE_EXTNAME = ".tt";

export function deprecationWarning(message: string): void {
  if (env["THOR_SILENCE_DEPRECATION"] == null) {
    warn(
      `Deprecation warning: ${message}\n` +
        "You can silence deprecations warning by setting the environment variable THOR_SILENCE_DEPRECATION.",
    );
  }
}

export let thorRunner: unknown = false;

/** @noRailsEquivalent PERMANENT */
export function setThorRunner(value: unknown): void {
  thorRunner = value;
}

type Relations = { exclusiveOptionNames?: string[][]; atLeastOneOptionNames?: string[][] };

type RelationBlock = (this: BaseClass) => unknown;

export interface BaseConfig {
  commandOptions?: Record<string, Option> | null;
  currentCommand?: Command | null;
  classOptions?: HashWithIndifferentAccess | null;
  shell?: Basic | null;
  debug?: unknown;
  [key: string]: unknown;
}

type OptionGroups = Map<string | null, Option[]>;

export interface Base {
  options: ThorOptions<Record<string, unknown>>;
  parentOptions: unknown;
  args: unknown[];
}

export interface BaseClass {
  prototype: object;
  /** @internal */
  _checkUnknownOptions?: unknown;
  /** @internal */
  _checkDefaultType?: boolean | null;
  /** @internal */
  _strictArgsPosition?: unknown;
  /** @internal */
  _arguments?: Argument[];
  /** @internal */
  _classOptions?: Record<string, Option>;
  /** @internal */
  _classExclusiveOptionNames?: string[][];
  /** @internal */
  _classAtLeastOneOptionNames?: string[][];
  /** @internal */
  _group?: string;
  /** @internal */
  _commands?: Record<string, Command>;
  /** @internal */
  _allCommands?: Record<string, Command>;
  /** @internal */
  _noCommandsContext?: NestedContext;
  /** @internal */
  _namespace?: string;
  banner(command: Command): string;
  attrReader(...names: string[]): void;
  attrWriter(...names: string[]): void;
  attrAccessor(...names: string[]): void;
  checkUnknownOptionsBang(): void;
  checkUnknownOptions(): unknown;
  isCheckUnknownOptions(config: BaseConfig): boolean;
  checkDefaultTypeBang(): void;
  allowIncompatibleDefaultTypeBang(): void;
  checkDefaultType(): boolean | null;
  isStopOnUnknownOption(commandName: unknown): boolean;
  isDisableRequiredCheck(commandName: unknown): boolean;
  strictArgsPositionBang(): void;
  strictArgsPosition(): unknown;
  "strictArgsPosition?"(config: BaseConfig): boolean;
  argument(name: string, options?: ArgumentOptions & { optional?: unknown }): void;
  arguments(): Argument[];
  classOptions(options?: Record<string, unknown> | null): Record<string, Option>;
  classOption(name: string, options?: OptionOptions): Option;
  classExclusive(...args: unknown[]): void;
  classAtLeastOne(...args: unknown[]): void;
  classExclusiveOptionNames(): string[][];
  classAtLeastOneOptionNames(): string[][];
  removeArgument(...names: unknown[]): void;
  removeClassOption(...names: string[]): void;
  group(name?: string | null): string;
  commands(): Record<string, Command>;
  allCommands(): Record<string, Command>;
  removeCommand(...names: unknown[]): void;
  noCommands<T>(block: () => T): T;
  noCommandsContext(): NestedContext;
  isNoCommands(): boolean;
  namespace(name?: string | null): string;
  start(givenArgs?: string[], config?: BaseConfig): Promise<unknown>;
  publicCommand(...names: string[]): void;
  handleNoCommandError(command: string, hasNamespace?: unknown): never;
  handleArgumentError(command: Command, error: unknown, args: unknown[], arity: unknown): never;
  isExitOnFailure(): boolean;
  classOptionsHelp(shell: Basic, groups?: OptionGroups): void;
  printOptions(shell: Basic, options: Option[], groupName?: string | null): void;
  isThorReservedWord(word: string, type: string): boolean;
  buildOption(name: string, options: OptionOptions, scope: Record<string, Option>): Option;
  buildOptions(options: Record<string, unknown>, scope: Record<string, Option>): void;
  findAndRefreshCommand(name: string): Command;
  methodAdded(meth: string): void;
  fromSuperclass(method: string, defaultValue?: unknown): unknown;
  basename(): string | null;
  baseclass(): unknown;
  createCommand(meth: string): unknown;
  initializeAdded(): void;
  dispatch(
    command: unknown,
    givenArgs: string[],
    givenOpts: unknown,
    config: BaseConfig,
    block?: (instance: Base) => void,
  ): unknown;
  registerOptionsRelationFor(target: string, relation: string, ...args: unknown[]): void;
  builtOptionNames(target: string, opt: { for?: string }, block: RelationBlock): string[];
  commandScopeMember(name: string, options?: { for?: string }): unknown;
}

ThorBase.attrReader("options", "parentOptions", "args");
ThorBase.attrWriter("options", "parentOptions", "args");

(ThorBase as unknown as Record<symbol, unknown>)[initialize] = function (
  this: Base,
  args: unknown[] = [],
  localOptions: unknown[] | Record<string, unknown> = {},
  config: BaseConfig = {},
): void {
  const klass = this.constructor as unknown as BaseClass;
  let parseOptions = klass.classOptions();

  const commandOptions = hashDelete(config, "commandOptions") as Record<string, Option> | null;
  if (rtest(commandOptions)) parseOptions = merge(parseOptions, commandOptions!);

  let arrayOptions: unknown[];
  let hashOptions: Record<string, unknown>;
  if (Array.isArray(localOptions)) {
    arrayOptions = localOptions;
    hashOptions = {};
  } else {
    arrayOptions = [];
    hashOptions = localOptions;
  }

  const currentCommand = config.currentCommand ?? null;
  const stopOnUnknown = klass.isStopOnUnknownOption(currentCommand);

  const relations: Relations =
    currentCommand == null
      ? { exclusiveOptionNames: [], atLeastOneOptionNames: [] }
      : currentCommand.optionsRelation;

  klass.classExclusiveOptionNames().map((n) => relations.exclusiveOptionNames!.push(n));
  klass.classAtLeastOneOptionNames().map((n) => relations.atLeastOneOptionNames!.push(n));

  const disableRequiredCheck = klass.isDisableRequiredCheck(currentCommand);

  const opts = new Options(
    parseOptions,
    hashOptions,
    stopOnUnknown,
    disableRequiredCheck,
    relations,
  );

  this.options = opts.parse(arrayOptions);
  if (rtest(config.classOptions)) {
    this.options = config.classOptions!.merge(this.options) as typeof this.options;
  }

  if (klass.isCheckUnknownOptions(config)) opts.checkUnknownBang();

  let toParse = args;
  if (!klass["strictArgsPosition?"](config)) toParse = toParse.concat(opts.remaining());

  const thorArgs = new Arguments(klass.arguments());
  eachPair(thorArgs.parse(toParse), (k, v) => rbFSend(this, `${k}=`, v));
  this.args = thorArgs.remaining();
};

function subclasses(this: object): BaseClass[] {
  return ((this as { _subclasses?: BaseClass[] })._subclasses ||= []);
}

function registerKlassFile(klass: BaseClass): void {
  if (!Base.subclasses().includes(klass)) Base.subclasses().push(klass);
}

export const ClassMethods = {
  attrReader(this: BaseClass, ...names: string[]): void {
    this.noCommands(() => rbModAttrReader(this, ...names));
  },

  attrWriter(this: BaseClass, ...names: string[]): void {
    this.noCommands(() => rbModAttrWriter(this, ...names));
  },

  attrAccessor(this: BaseClass, ...names: string[]): void {
    this.noCommands(() => {
      rbModAttrReader(this, ...names);
      rbModAttrWriter(this, ...names);
    });
  },

  checkUnknownOptionsBang(this: BaseClass): void {
    this._checkUnknownOptions = true;
  },

  checkUnknownOptions(this: BaseClass): unknown {
    if (!Object.hasOwn(this, "_checkUnknownOptions") || !rtest(this._checkUnknownOptions)) {
      this._checkUnknownOptions = this.fromSuperclass("checkUnknownOptions", false);
    }
    return this._checkUnknownOptions;
  },

  isCheckUnknownOptions(this: BaseClass, config: BaseConfig): boolean {
    return rtest(this.checkUnknownOptions());
  },

  checkDefaultTypeBang(this: BaseClass): void {
    this._checkDefaultType = true;
  },

  allowIncompatibleDefaultTypeBang(this: BaseClass): void {
    this._checkDefaultType = false;
  },

  checkDefaultType(this: BaseClass): boolean | null {
    if (!Object.hasOwn(this, "_checkDefaultType")) {
      this._checkDefaultType = this.fromSuperclass("checkDefaultType", null) as boolean | null;
    }
    return this._checkDefaultType!;
  },

  isStopOnUnknownOption(this: BaseClass, commandName: unknown): boolean {
    return false;
  },

  isDisableRequiredCheck(this: BaseClass, commandName: unknown): boolean {
    return false;
  },

  strictArgsPositionBang(this: BaseClass): void {
    this._strictArgsPosition = true;
  },

  strictArgsPosition(this: BaseClass): unknown {
    if (!Object.hasOwn(this, "_strictArgsPosition") || !rtest(this._strictArgsPosition)) {
      this._strictArgsPosition = this.fromSuperclass("strictArgsPosition", false);
    }
    return this._strictArgsPosition;
  },

  "strictArgsPosition?"(this: BaseClass, config: BaseConfig): boolean {
    return rtest(this.strictArgsPosition());
  },

  argument(
    this: BaseClass,
    name: string,
    options: ArgumentOptions & { optional?: unknown } = {},
  ): void {
    this.isThorReservedWord(name, "argument");
    this.noCommands(() => this.attrAccessor(name));

    let required: unknown;
    if (hasKey(options, "optional")) {
      required = !rtest(options.optional);
    } else if (hasKey(options, "required")) {
      required = options.required;
    } else {
      required = options.default == null;
    }

    this.removeArgument(name);

    if (rtest(required)) {
      this.arguments().forEach((argument) => {
        if (rtest(argument.isRequired())) return;
        throw new ArgumentError(
          `You cannot have ${rbInspect(rbObjAsString(name))} as required argument after ` +
            `the non-required argument ${rbInspect(argument.humanName)}.`,
        );
      });
    }

    options.required = required;

    this.arguments().push(new Argument(name, options));
  },

  arguments(this: BaseClass): Argument[] {
    if (!Object.hasOwn(this, "_arguments")) {
      this._arguments = this.fromSuperclass("arguments", []) as Argument[];
    }
    return this._arguments!;
  },

  classOptions(
    this: BaseClass,
    options: Record<string, unknown> | null = null,
  ): Record<string, Option> {
    if (!Object.hasOwn(this, "_classOptions")) {
      this._classOptions = this.fromSuperclass("classOptions", {}) as Record<string, Option>;
    }
    if (rtest(options)) this.buildOptions(options!, this._classOptions!);
    return this._classOptions!;
  },

  classOption(this: BaseClass, name: string, options: OptionOptions = {}): Option {
    if (typeof name !== "string") {
      throw new ArgumentError(`Expected a Symbol or String, got ${rbInspect(name)}`);
    }
    return this.buildOption(name, options, this.classOptions());
  },

  classExclusive(this: BaseClass, ...args: unknown[]): void {
    this.registerOptionsRelationFor("classOptions", "classExclusiveOptionNames", ...args);
  },

  classAtLeastOne(this: BaseClass, ...args: unknown[]): void {
    this.registerOptionsRelationFor("classOptions", "classAtLeastOneOptionNames", ...args);
  },

  classExclusiveOptionNames(this: BaseClass): string[][] {
    if (!Object.hasOwn(this, "_classExclusiveOptionNames")) {
      this._classExclusiveOptionNames = this.fromSuperclass(
        "classExclusiveOptionNames",
        [],
      ) as string[][];
    }
    return this._classExclusiveOptionNames!;
  },

  classAtLeastOneOptionNames(this: BaseClass): string[][] {
    if (!Object.hasOwn(this, "_classAtLeastOneOptionNames")) {
      this._classAtLeastOneOptionNames = this.fromSuperclass(
        "classAtLeastOneOptionNames",
        [],
      ) as string[][];
    }
    return this._classAtLeastOneOptionNames!;
  },

  removeArgument(this: BaseClass, ...names: unknown[]): void {
    const options = (rbObjIsKindOf(last(names), Hash) ? names.pop() : {}) as {
      undefine?: unknown;
    };

    names.forEach((name) => {
      aryDeleteIf(this.arguments(), (a) => a.name === rbObjAsString(name));
      if (rtest(options.undefine)) {
        Object.defineProperty(this.prototype, name as string, {
          value: undefined,
          writable: true,
          configurable: true,
        });
      }
    });
  },

  removeClassOption(this: BaseClass, ...names: string[]): void {
    names.forEach((name) => {
      hashDelete(this.classOptions(), name);
    });
  },

  group(this: BaseClass, name: string | null = null): string {
    if (rtest(name)) {
      return (this._group = rbObjAsString(name));
    } else {
      if (!Object.hasOwn(this, "_group") || !rtest(this._group)) {
        this._group = this.fromSuperclass("group", "standard") as string;
      }
      return this._group!;
    }
  },

  commands(this: BaseClass): Record<string, Command> {
    if (!Object.hasOwn(this, "_commands")) this._commands = {};
    return this._commands!;
  },
  tasks: undefined as unknown as BaseClass["commands"],

  allCommands(this: BaseClass): Record<string, Command> {
    if (!Object.hasOwn(this, "_allCommands")) {
      this._allCommands = this.fromSuperclass("allCommands", {}) as Record<string, Command>;
    }
    return mergeBang(this._allCommands!, this.commands());
  },
  allTasks: undefined as unknown as BaseClass["allCommands"],

  removeCommand(this: BaseClass, ...names: unknown[]): void {
    const options = (rbObjIsKindOf(last(names), Hash) ? names.pop() : {}) as {
      undefine?: unknown;
    };

    names.forEach((name) => {
      hashDelete(this.commands(), rbObjAsString(name));
      hashDelete(this.allCommands(), rbObjAsString(name));
      if (rtest(options.undefine)) {
        Object.defineProperty(this.prototype, rbObjAsString(name), {
          value: undefined,
          writable: true,
          configurable: true,
        });
      }
    });
  },
  removeTask: undefined as unknown as BaseClass["removeCommand"],

  noCommands<T>(this: BaseClass, block: () => T): T {
    return this.noCommandsContext().enter(block);
  },
  noTasks: undefined as unknown as BaseClass["noCommands"],

  noCommandsContext(this: BaseClass): NestedContext {
    if (!Object.hasOwn(this, "_noCommandsContext")) this._noCommandsContext = new NestedContext();
    return this._noCommandsContext!;
  },

  isNoCommands(this: BaseClass): boolean {
    return this.noCommandsContext().isEntered();
  },

  /** @inventedArm registerKlassFile — PERMANENT */
  namespace(this: BaseClass, name: string | null = null): string {
    if (rtest(name)) {
      Base.registerKlassFile(this);
      return (this._namespace = rbObjAsString(name));
    } else {
      if (!Object.hasOwn(this, "_namespace") || !rtest(this._namespace)) {
        this._namespace = namespaceFromThorClass(this);
      }
      return this._namespace!;
    }
  },

  async start(
    this: BaseClass,
    givenArgs: string[] = rbArgv(),
    config: BaseConfig = {},
  ): Promise<unknown> {
    try {
      config.shell ||= new ThorBase.shell!();
      return await this.dispatch(null, rbObjDup(givenArgs), null, config);
    } catch (e) {
      if (e instanceof ThorError) {
        if (rtest(config.debug) || env["THOR_DEBUG"] === "1") {
          throw e;
        } else {
          config.shell!.error(e.message);
        }
        if (this.isExitOnFailure()) exit(1);
        return null;
      } else if (e instanceof Errno.EPIPE) {
        return exit(0);
      }
      throw e;
    }
  },

  publicCommand(this: BaseClass, ...names: string[]): void {
    names.forEach((name) => {
      const prototype = this.prototype;
      Object.defineProperty(this.prototype, name, {
        value: function (this: object, ...args: unknown[]) {
          return (
            Object.getPrototypeOf(prototype) as Record<string, (...args: unknown[]) => unknown>
          )[name].apply(this, args);
        },
        writable: true,
        configurable: true,
      });
      this.methodAdded(name);
    });
  },
  publicTask: undefined as unknown as BaseClass["publicCommand"],

  handleNoCommandError(
    this: BaseClass,
    command: string,
    hasNamespace: unknown = thorRunner,
  ): never {
    throw new UndefinedCommandError(
      command,
      Object.keys(this.allCommands()),
      rtest(hasNamespace) ? this.namespace() : null,
    );
  },
  handleNoTaskError: undefined as unknown as BaseClass["handleNoCommandError"],

  handleArgumentError(
    this: BaseClass,
    command: Command,
    error: unknown,
    args: unknown[],
    arity: unknown,
  ): never {
    const name = compact([command.ancestorName, command.name]).join(" ");
    let msg = `ERROR: "${this.basename() ?? ""} ${name}" was called with `;
    if (args.length === 0) msg += "no arguments";
    if (!(args.length === 0)) msg += "arguments " + rbInspect(args);
    msg += `\nUsage: "${stringSplit(this.banner(command), "\n").join('"\n       "')}"`;
    throw new InvocationError(msg);
  },

  isExitOnFailure(this: BaseClass): boolean {
    deprecationWarning(
      `Thor exit with status 0 on errors. To keep this behavior, you must define \`exit_on_failure?\` in \`${rbModName(this) ?? ""}\``,
    );
    return false;
  },

  /** @internal */
  classOptionsHelp(this: BaseClass, shell: Basic, groups: OptionGroups = new Map()): void {
    eachPair(this.classOptions(), (_, value) => {
      if (!groups.has(value.group)) groups.set(value.group, []);
      groups.get(value.group)!.push(value);
    });

    const globalOptions = hashDelete(groups, null) || [];
    this.printOptions(shell, globalOptions);

    groups.forEach((options, groupName) => {
      this.printOptions(shell, options, groupName);
    });
  },

  /** @internal */
  printOptions(
    this: BaseClass,
    shell: Basic,
    options: Option[],
    groupName: string | null = null,
  ): void {
    if (options.length === 0) return;

    const list: string[][] = [];
    const padding = toI(max(options.map((o) => o.aliasesForUsage().length))) as number;
    options.forEach((option) => {
      if (rtest(option.hide)) return;
      const item = [option.usage(padding)];
      item.push(option.description != null ? `# ${option.description}` : "");

      list.push(item);
      if (rtest(option.isShowDefault())) list.push(["", `# Default: ${option.printDefault()}`]);
      if (rtest(option.enum)) list.push(["", `# Possible values: ${option.enumToS()}`]);
    });

    shell.say(groupName != null ? `${groupName} options:` : "Options:");
    shell.printTable(list, { indent: 2 });
    shell.say("");
  },

  /** @internal */
  isThorReservedWord(this: BaseClass, word: string, type: string): boolean {
    if (
      !THOR_RESERVED_WORDS.includes(
        rbObjAsString(word).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      )
    )
      return false;
    throw new RuntimeError(
      `${rbInspect(word)} is a Thor reserved word and cannot be defined as ${type}`,
    );
  },

  /** @internal */
  buildOption(
    this: BaseClass,
    name: string,
    options: OptionOptions,
    scope: Record<string, Option>,
  ): Option {
    return (scope[name] = new Option(
      name,
      mergeBang({ checkDefaultType: this.checkDefaultType() } as OptionOptions, options),
    ));
  },

  /** @internal */
  buildOptions(
    this: BaseClass,
    options: Record<string, unknown>,
    scope: Record<string, Option>,
  ): void {
    eachPair(options, (key, value) => {
      scope[key] = Option.parse(key, value);
    });
  },

  /** @internal */
  findAndRefreshCommand(this: BaseClass, name: string): Command {
    let command: Command | undefined;
    if (this.commands()[rbObjAsString(name)] != null) {
      return this.commands()[rbObjAsString(name)];
    } else if ((command = this.allCommands()[rbObjAsString(name)]) != null) {
      return (this.commands()[rbObjAsString(name)] = rbObjClone(command));
    } else {
      throw new ArgumentError(
        `You supplied :for => ${rbInspect(name)}, but the command ${rbInspect(name)} could not be found.`,
      );
    }
  },
  /** @internal */
  findAndRefreshTask: undefined as unknown as BaseClass["findAndRefreshCommand"],

  /** @internal */
  methodAdded(this: BaseClass, meth: string): void {
    meth = rbObjAsString(meth);

    if (meth === "initialize") {
      this.initializeAdded();
      return;
    }

    if (!rbModPublicMethodDefined(this, meth)) return;

    if (this.isNoCommands() || !rtest(this.createCommand(meth))) return;

    this.isThorReservedWord(meth, "command");
    Base.registerKlassFile(this);
  },

  fromSuperclass,

  /** @internal */
  basename(this: BaseClass): string | null {
    return stringSplit(File.basename(rbProgname()), " ")[0] ?? null;
  },

  /** @internal */
  baseclass(this: BaseClass): unknown {
    return null;
  },

  /** @internal */
  createCommand(this: BaseClass, meth: string): unknown {
    return null;
  },
  /** @internal */
  createTask: undefined as unknown as BaseClass["createCommand"],

  /** @internal */
  initializeAdded(this: BaseClass): void {},

  /** @internal */
  dispatch(
    this: BaseClass,
    command: unknown,
    givenArgs: string[],
    givenOpts: unknown,
    config: BaseConfig,
  ): unknown {
    throw new NotImplementedError();
  },

  /** @internal */
  registerOptionsRelationFor(
    this: BaseClass,
    target: string,
    relation: string,
    ...args: unknown[]
  ): void {
    const block = (typeof last(args) === "function" ? args.pop() : undefined) as
      | RelationBlock
      | undefined;
    let opt = (rbObjIsKindOf(last(args), Hash) ? args.pop() : undefined) as
      | { for?: string }
      | undefined;
    opt ||= {};
    let names = args.map((arg) => rbObjAsString(arg));
    if (block !== undefined) names = names.concat(this.builtOptionNames(target, opt, block));
    (this.commandScopeMember(relation, opt) as string[][]).push(names);
  },

  /** @internal */
  builtOptionNames(
    this: BaseClass,
    target: string,
    opt: { for?: string },
    block: RelationBlock,
  ): string[] {
    const before = Object.values(
      this.commandScopeMember(target, opt) as Record<string, Option>,
    ).map((v) => v.name);
    block.call(this);
    const after = Object.values(this.commandScopeMember(target, opt) as Record<string, Option>).map(
      (v) => v.name,
    );
    return after.filter((name) => !before.includes(name));
  },

  /** @internal */
  commandScopeMember(this: BaseClass, name: string, options: { for?: string } = {}): unknown {
    if (rtest(options.for)) {
      return rbFSend(this.findAndRefreshCommand(options.for!), name);
    } else {
      return rbFSend(this, name);
    }
  },
};

ClassMethods.tasks = ClassMethods.commands;
ClassMethods.allTasks = ClassMethods.allCommands;
ClassMethods.removeTask = ClassMethods.removeCommand;
ClassMethods.noTasks = ClassMethods.noCommands;
ClassMethods.publicTask = ClassMethods.publicCommand;
ClassMethods.handleNoTaskError = ClassMethods.handleNoCommandError;
ClassMethods.findAndRefreshTask = ClassMethods.findAndRefreshCommand;
ClassMethods.createTask = ClassMethods.createCommand;

/** @internal */
export function fromSuperclass(
  this: { baseclass(): unknown },
  method: string,
  defaultValue: unknown = null,
): unknown {
  const superclass = Object.getPrototypeOf(this) as Record<string, () => unknown>;
  if (this === this.baseclass() || !rbObjRespondTo(superclass, method, true)) {
    return defaultValue;
  } else {
    const value = superclass[method]();

    try {
      return rbObjDup(value);
    } catch (e) {
      if (e instanceof TypeError) return value;
      throw e;
    }
  }
}

(ThorBase as unknown as Record<symbol, unknown>)[included] = function (base: object): void {
  extend(base, ClassMethods);
  include(base as { prototype: object }, Invocation);
  include(base as { prototype: object }, Shell);
};

export const Base = Object.assign(ThorBase, { ClassMethods, subclasses, registerKlassFile });
