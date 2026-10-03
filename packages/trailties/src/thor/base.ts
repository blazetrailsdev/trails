import {
  ArgumentError,
  aryDeleteIf,
  dup,
  eachPair,
  env,
  Hash,
  hashDelete,
  hasKey,
  initialize,
  last,
  merge,
  mergeBang,
  rbFSend,
  rbInspect,
  rbObjAsString,
  rbObjClassname,
  rbObjClone,
  rbObjRespondTo,
  rtest,
  RuntimeError,
  warn,
} from "@blazetrails/ruby-compat";
import type { Command } from "./command.js";
import type {
  HashWithIndifferentAccess,
  ThorOptions,
} from "./core-ext/hash-with-indifferent-access.js";
import { Argument, type ArgumentOptions } from "./parser/argument.js";
import { Arguments } from "./parser/arguments.js";
import { Option, type OptionOptions } from "./parser/option.js";
import { Options } from "./parser/options.js";
import { Base as ThorBase } from "./shell.js";

export const HELP_MAPPINGS = ["-h", "-?", "--help", "-D"];

export const THOR_RESERVED_WORDS = [
  "invoke",
  "shell",
  "options",
  "behavior",
  "root",
  "destinationRoot",
  "relativeRoot",
  "action",
  "addFile",
  "createFile",
  "inRoot",
  "inside",
  "run",
  "runRubyScript",
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

type Relations = { exclusiveOptionNames?: string[][]; atLeastOneOptionNames?: string[][] };

type RelationBlock = (this: BaseClass) => unknown;

interface BaseConfig {
  commandOptions?: Record<string, Option> | null;
  currentCommand?: Command | null;
  classOptions?: HashWithIndifferentAccess | null;
  [key: string]: unknown;
}

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
  baseclass(): unknown;
  attrAccessor(...names: string[]): void;
  noCommands<T>(block: () => T): T;
  commands(): Record<string, Command>;
  allCommands(): Record<string, Command>;
  checkUnknownOptionsBang(): void;
  checkUnknownOptions(): unknown;
  "checkUnknownOptions?"(config: BaseConfig): boolean;
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
  isThorReservedWord(word: string, type: string): boolean;
  buildOption(name: string, options: OptionOptions, scope: Record<string, Option>): Option;
  buildOptions(options: Record<string, unknown>, scope: Record<string, Option>): void;
  findAndRefreshCommand(name: string): Command;
  registerOptionsRelationFor(target: string, relation: string, ...args: unknown[]): void;
  builtOptionNames(target: string, opt: { for?: string }, block: RelationBlock): string[];
  commandScopeMember(name: string, options?: { for?: string }): unknown;
}

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

  if (klass["checkUnknownOptions?"](config)) opts.checkUnknownBang();

  let toParse = args;
  if (!klass["strictArgsPosition?"](config)) toParse = toParse.concat(opts.remaining());

  const thorArgs = new Arguments(klass.arguments());
  eachPair(thorArgs.parse(toParse), (k, v) => rbFSend(this, `${k}=`, v));
  this.args = thorArgs.remaining();
};

export const ClassMethods = {
  checkUnknownOptionsBang(this: BaseClass): void {
    this._checkUnknownOptions = true;
  },

  checkUnknownOptions(this: BaseClass): unknown {
    if (!Object.hasOwn(this, "_checkUnknownOptions") || !rtest(this._checkUnknownOptions)) {
      this._checkUnknownOptions = fromSuperclass.call(this, "checkUnknownOptions", false);
    }
    return this._checkUnknownOptions;
  },

  "checkUnknownOptions?"(this: BaseClass, config: BaseConfig): boolean {
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
      this._checkDefaultType = fromSuperclass.call(this, "checkDefaultType", null) as
        | boolean
        | null;
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
      this._strictArgsPosition = fromSuperclass.call(this, "strictArgsPosition", false);
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
      this._arguments = fromSuperclass.call(this, "arguments", []) as Argument[];
    }
    return this._arguments!;
  },

  classOptions(
    this: BaseClass,
    options: Record<string, unknown> | null = null,
  ): Record<string, Option> {
    if (!Object.hasOwn(this, "_classOptions")) {
      this._classOptions = fromSuperclass.call(this, "classOptions", {}) as Record<string, Option>;
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
      this._classExclusiveOptionNames = fromSuperclass.call(
        this,
        "classExclusiveOptionNames",
        [],
      ) as string[][];
    }
    return this._classExclusiveOptionNames!;
  },

  classAtLeastOneOptionNames(this: BaseClass): string[][] {
    if (!Object.hasOwn(this, "_classAtLeastOneOptionNames")) {
      this._classAtLeastOneOptionNames = fromSuperclass.call(
        this,
        "classAtLeastOneOptionNames",
        [],
      ) as string[][];
    }
    return this._classAtLeastOneOptionNames!;
  },

  removeArgument(this: BaseClass, ...names: unknown[]): void {
    const options = (rbObjClassname(last(names)) === "Hash" ? names.pop() : {}) as {
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
        this._group = fromSuperclass.call(this, "group", "standard") as string;
      }
      return this._group!;
    }
  },

  /** @internal */
  isThorReservedWord(this: BaseClass, word: string, type: string): boolean {
    if (!THOR_RESERVED_WORDS.includes(rbObjAsString(word))) return false;
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

  fromSuperclass,

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
    let opt = (rbObjClassname(last(args)) === "Hash" ? args.pop() : undefined) as
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
    opt: { for?: string } = {},
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

    if (Array.isArray(value)) return [...value];
    if (value instanceof Hash) return dup(value);
    if (
      value !== null &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return dup(value as Record<string, unknown>);
    }
    return value;
  }
}

export const Base = Object.assign(ThorBase, { ClassMethods });
