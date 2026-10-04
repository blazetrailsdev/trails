import {
  ArgumentError,
  aryDelete,
  eachPair,
  extend,
  hashDelete,
  include,
  initializeIncludedModules,
  isEmpty,
  mergeBang,
  NoMethodError,
  puts,
  rbFCaller,
  rbInspect,
  rbModToS,
  rbObjAsString,
  rtest,
  STDOUT,
  union,
} from "@blazetrails/ruby-compat";
import { Base, type BaseClass, ClassMethods } from "./base.js";
import { Command, HiddenCommand } from "./command.js";
import { Arguments } from "./parser/arguments.js";
import type { Option, OptionOptions } from "./parser/option.js";

type Mappings = Record<string, string> | Map<string | string[], string>;

type DescOptions = { for?: string; hide?: unknown };

type LongDescOptions = { for?: string; wrap?: unknown };

type CheckUnknownOptions = { only?: unknown; except?: unknown; [key: string]: unknown };

type Config = { currentCommand?: Command | null };

type Instance = {
  options: unknown;
  invoke(...args: unknown[]): unknown;
};

export type ThorClass = typeof Thor & Omit<BaseClass, keyof typeof Thor>;

export class Thor {
  declare static Group: abstract new (...args: never[]) => object;

  /** @internal */
  static _packageName?: string | null;
  /** @internal */
  static _defaultCommand?: string;
  /** @internal */
  static _usage?: string | null;
  /** @internal */
  static _desc?: string | null;
  /** @internal */
  static _hide?: unknown;
  /** @internal */
  static _longDesc?: string | null;
  /** @internal */
  static _longDescWrap?: boolean | null;
  /** @internal */
  static _map?: Record<string, string>;
  /** @internal */
  static _methodOptions?: Record<string, Option> | null;
  /** @internal */
  static _subcommands?: string[];
  /** @internal */
  static _subcommandClasses?: Record<string, ThorClass>;
  /** @internal */
  static _stopOnUnknownOption?: string[];
  /** @internal */
  static _disableRequiredCheck?: string[];
  /** @internal */
  static _methodExclusiveOptionNames?: string[][] | null;
  /** @internal */
  static _methodAtLeastOneOptionNames?: string[][] | null;

  static packageName(this: ThorClass, name: string | null, _: object = {}): string | null {
    return (this._packageName = name == null || name === "" ? null : name);
  }

  static defaultCommand(this: ThorClass, meth: string | null = null): string {
    if (rtest(meth)) {
      return (this._defaultCommand = meth === "none" ? "help" : rbObjAsString(meth));
    } else {
      if (!Object.hasOwn(this, "_defaultCommand") || !rtest(this._defaultCommand)) {
        this._defaultCommand = this.fromSuperclass("defaultCommand", "help") as string;
      }
      return this._defaultCommand!;
    }
  }
  declare static defaultTask: typeof Thor.defaultCommand;

  static register(
    this: ThorClass,
    klass: ThorClass,
    subcommandName: string,
    usage: string,
    description: string,
    options: DescOptions = {},
  ): void {
    if (klass === Thor.Group || klass.prototype instanceof Thor.Group) {
      this.desc(usage, description, options);
      Object.defineProperty(this.prototype, subcommandName, {
        value: function (this: Instance, ...args: unknown[]) {
          return this.invoke(klass, args);
        },
        writable: true,
        configurable: true,
      });
      this.methodAdded(subcommandName);
    } else {
      this.desc(usage, description, options);
      this.subcommand(subcommandName, klass);
    }
  }

  static desc(
    this: ThorClass,
    usage: string | null,
    description: string | null,
    options: DescOptions = {},
  ): void {
    if (rtest(options.for)) {
      const command = this.findAndRefreshCommand(options.for!);
      if (rtest(usage)) command.usage = usage;
      if (rtest(description)) command.description = description;
    } else {
      this._usage = usage;
      this._desc = description;
      this._hide = rtest(options.hide) ? options.hide : false;
    }
  }

  static longDesc(
    this: ThorClass,
    longDescription: string | null,
    options: LongDescOptions = {},
  ): void {
    if (rtest(options.for)) {
      const command = this.findAndRefreshCommand(options.for!);
      if (rtest(longDescription)) command.longDescription = longDescription;
    } else {
      this._longDesc = longDescription;
      this._longDescWrap = options.wrap !== false;
    }
  }

  static map(
    this: ThorClass,
    mappings: Mappings | null = null,
    kw: Record<string, string> = {},
  ): Record<string, string> {
    if (!Object.hasOwn(this, "_map") || !rtest(this._map)) {
      this._map = this.fromSuperclass("map", {}) as Record<string, string>;
    }

    if (rtest(mappings) && !isEmpty(kw)) {
      mappings = mergeBang(kw, mappings as Record<string, string>);
    } else {
      mappings ||= kw;
    }
    if (rtest(mappings)) {
      eachPair(mappings as Map<string, string>, (key: string | string[], value) => {
        if (Array.isArray(key)) {
          key.forEach((subkey) => (this._map![subkey] = value));
        } else {
          this._map![key] = value;
        }
      });
    }

    return this._map!;
  }

  static methodOptions(
    this: ThorClass,
    options: Record<string, unknown> | null = null,
  ): Record<string, Option> {
    if (!Object.hasOwn(this, "_methodOptions") || !rtest(this._methodOptions)) {
      this._methodOptions = {};
    }
    if (rtest(options)) this.buildOptions(options!, this._methodOptions!);
    return this._methodOptions!;
  }
  declare static options: typeof Thor.methodOptions;

  static methodOption(
    this: ThorClass,
    name: string,
    options: OptionOptions & { for?: string } = {},
  ): Option {
    if (typeof name !== "string") {
      throw new ArgumentError(`Expected a Symbol or String, got ${rbInspect(name)}`);
    }
    const scope = rtest(options.for)
      ? this.findAndRefreshCommand(options.for!).options
      : this.methodOptions();

    return this.buildOption(name, options, scope);
  }
  declare static option: typeof Thor.methodOption;

  static methodExclusive(this: ThorClass, ...args: unknown[]): void {
    this.registerOptionsRelationFor("methodOptions", "methodExclusiveOptionNames", ...args);
  }
  declare static exclusive: typeof Thor.methodExclusive;

  static methodAtLeastOne(this: ThorClass, ...args: unknown[]): void {
    this.registerOptionsRelationFor("methodOptions", "methodAtLeastOneOptionNames", ...args);
  }
  declare static atLeastOne: typeof Thor.methodAtLeastOne;

  static subcommands(this: ThorClass): string[] {
    if (!Object.hasOwn(this, "_subcommands") || !rtest(this._subcommands)) {
      this._subcommands = this.fromSuperclass("subcommands", []) as string[];
    }
    return this._subcommands!;
  }
  declare static subtasks: typeof Thor.subcommands;

  static subcommandClasses(this: ThorClass): Record<string, ThorClass> {
    if (!Object.hasOwn(this, "_subcommandClasses") || !rtest(this._subcommandClasses)) {
      this._subcommandClasses = {};
    }
    return this._subcommandClasses!;
  }

  static subcommand(this: ThorClass, subcommand: string, subcommandClass: ThorClass): void {
    this.subcommands().push(rbObjAsString(subcommand));
    subcommandClass.subcommandHelp(subcommand);
    this.subcommandClasses()[rbObjAsString(subcommand)] = subcommandClass;

    Object.defineProperty(this.prototype, subcommand, {
      value: function (this: Instance, ...args: unknown[]) {
        let opts: unknown[];
        [args, opts] = Arguments.split(args);
        const invokeArgs: unknown[] = [
          args,
          opts,
          { invokedViaSubcommand: true, classOptions: this.options },
        ];
        if (rtest(aryDelete(opts, "--help")) || rtest(aryDelete(opts, "-h"))) {
          invokeArgs.unshift("help");
        }
        return this.invoke(subcommandClass, ...invokeArgs);
      },
      writable: true,
      configurable: true,
    });
    this.methodAdded(subcommand);
    eachPair(subcommandClass.commands(), (_meth, command) => {
      command.ancestorName = subcommand;
    });
  }
  declare static subtask: typeof Thor.subcommand;

  static checkUnknownOptionsBang(this: ThorClass, options: CheckUnknownOptions = {}): unknown {
    if (!Object.hasOwn(this, "_checkUnknownOptions") || !rtest(this._checkUnknownOptions)) {
      this._checkUnknownOptions = {};
    }
    eachPair(options, (key, value) => {
      if (rtest(value)) {
        (this._checkUnknownOptions as CheckUnknownOptions)[key] = Array.isArray(value)
          ? value
          : [value];
      } else {
        hashDelete(this._checkUnknownOptions as CheckUnknownOptions, key);
      }
    });
    return this._checkUnknownOptions;
  }

  static isCheckUnknownOptions(this: ThorClass, config: Config): boolean {
    const options = this.checkUnknownOptions() as { only?: string[]; except?: string[] } | false;
    if (!rtest(options)) return false;

    const command = config.currentCommand;
    if (!rtest(command)) return true;

    const name = command!.name;

    if (this.subcommands().includes(name)) {
      return false;
    } else if (rtest((options as CheckUnknownOptions).except)) {
      return !(options as { except: string[] }).except.includes(name);
    } else if (rtest((options as CheckUnknownOptions).only)) {
      return (options as { only: string[] }).only.includes(name);
    } else {
      return true;
    }
  }

  static stopOnUnknownOptionBang(this: ThorClass, ...commandNames: string[]): string[] {
    return (this._stopOnUnknownOption = union(this.stopOnUnknownOption(), commandNames));
  }

  static isStopOnUnknownOption(this: ThorClass, command: Command | null): boolean {
    return rtest(command) && this.stopOnUnknownOption().includes(command!.name);
  }

  static disableRequiredCheckBang(this: ThorClass, ...commandNames: string[]): string[] {
    return (this._disableRequiredCheck = union(this.disableRequiredCheck(), commandNames));
  }

  static isDisableRequiredCheck(this: ThorClass, command: Command | null): boolean {
    return rtest(command) && this.disableRequiredCheck().includes(command!.name);
  }

  static isCommandExists(this: ThorClass, commandName: string): boolean {
    return Object.keys(this.commands()).includes(
      (this as unknown as { normalizeCommandName(meth: string): string }).normalizeCommandName(
        commandName,
      ),
    );
  }

  /** @internal */
  static methodExclusiveOptionNames(this: ThorClass): string[][] {
    if (
      !Object.hasOwn(this, "_methodExclusiveOptionNames") ||
      !rtest(this._methodExclusiveOptionNames)
    ) {
      this._methodExclusiveOptionNames = [];
    }
    return this._methodExclusiveOptionNames!;
  }

  /** @internal */
  static methodAtLeastOneOptionNames(this: ThorClass): string[][] {
    if (
      !Object.hasOwn(this, "_methodAtLeastOneOptionNames") ||
      !rtest(this._methodAtLeastOneOptionNames)
    ) {
      this._methodAtLeastOneOptionNames = [];
    }
    return this._methodAtLeastOneOptionNames!;
  }

  static stopOnUnknownOption(this: ThorClass): string[] {
    if (!Object.hasOwn(this, "_stopOnUnknownOption") || !rtest(this._stopOnUnknownOption)) {
      this._stopOnUnknownOption = [];
    }
    return this._stopOnUnknownOption!;
  }

  static disableRequiredCheck(this: ThorClass): string[] {
    if (!Object.hasOwn(this, "_disableRequiredCheck") || !rtest(this._disableRequiredCheck)) {
      this._disableRequiredCheck = ["help"];
    }
    return this._disableRequiredCheck!;
  }

  /** @internal */
  static createCommand(this: ThorClass, meth: string): boolean {
    if (!Object.hasOwn(this, "_usage") || !rtest(this._usage)) this._usage = null;
    if (!Object.hasOwn(this, "_desc") || !rtest(this._desc)) this._desc = null;
    if (!Object.hasOwn(this, "_longDesc") || !rtest(this._longDesc)) this._longDesc = null;
    if (!Object.hasOwn(this, "_longDescWrap") || !rtest(this._longDescWrap)) {
      this._longDescWrap = null;
    }
    if (!Object.hasOwn(this, "_hide") || !rtest(this._hide)) this._hide = null;

    if (rtest(this._usage) && rtest(this._desc)) {
      const baseClass = rtest(this._hide) ? HiddenCommand : Command;
      const relations = {
        exclusiveOptionNames: this.methodExclusiveOptionNames(),
        atLeastOneOptionNames: this.methodAtLeastOneOptionNames(),
      };
      this.commands()[meth] = new baseClass(
        meth,
        this._desc!,
        this._longDesc!,
        this._longDescWrap!,
        this._usage!,
        this.methodOptions(),
        relations,
      );
      this._usage = this._desc = this._longDesc = this._longDescWrap = null;
      this._methodOptions = this._hide = null;
      this._methodExclusiveOptionNames = this._methodAtLeastOneOptionNames = null;
      return true;
    } else if (rtest(this.allCommands()[meth]) || meth === "method_missing") {
      return true;
    } else {
      puts.call(
        STDOUT,
        `[WARNING] Attempted to create command ${rbInspect(meth)} without usage or description. ` +
          "Call desc if you want this method to be available as command or declare it inside a " +
          `no_commands{} block. Invoked from ${rbInspect(rbFCaller()[1])}.`,
      );
      return false;
    }
  }
  /** @internal */
  declare static createTask: typeof Thor.createCommand;

  /** @internal */
  static initializeAdded(this: ThorClass): void {
    mergeBang(this.classOptions(), this.methodOptions());
    this._methodOptions = null;
  }

  /** @internal */
  static subcommandHelp(this: ThorClass, cmd: string): void {
    this.desc("help [COMMAND]", "Describe subcommands or one specific subcommand");
    const prototype = this.prototype;
    Object.defineProperty(prototype, "help", {
      value: function (this: object, command: string | null = null, subcommand: unknown = true) {
        const superMethod = (Object.getPrototypeOf(prototype) as Record<string, unknown>).help;
        if (typeof superMethod !== "function") {
          throw new NoMethodError(
            `super: no superclass method 'help' for an instance of ${rbModToS(prototype.constructor as never)}`,
            "help",
          );
        }
        return superMethod.call(this, command, subcommand);
      },
      writable: true,
      configurable: true,
    });
    this.methodAdded("help");
  }
  /** @internal */
  declare static subtaskHelp: typeof Thor.subcommandHelp;

  constructor(...args: unknown[]) {
    initializeIncludedModules(this, ...args);
  }
}

Thor.defaultTask = Thor.defaultCommand;
Thor.options = Thor.methodOptions;
Thor.option = Thor.methodOption;
Thor.exclusive = Thor.methodExclusive;
Thor.atLeastOne = Thor.methodAtLeastOne;
Thor.subtasks = Thor.subcommands;
Thor.subtask = Thor.subcommand;
Thor.createTask = Thor.createCommand;
Thor.subtaskHelp = Thor.subcommandHelp;

include(Thor, Base);
extend(Thor, ClassMethods);
