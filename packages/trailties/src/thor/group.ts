import {
  ArgumentError,
  first,
  fetch,
  flatten,
  hasKey,
  include,
  initializeIncludedModules,
  isModuleIncluded,
  last,
  rbInspect,
  rbObjAsString,
  rbObjClone,
  rbObjIsKindOf,
  rbObjRespondTo,
  rtest,
  toS,
  Hash,
} from "@blazetrails/ruby-compat";
import { Base, type BaseClass, type BaseConfig, HELP_MAPPINGS } from "./base.js";
import { Command, DynamicCommand } from "./command.js";
import type { Invocation } from "./invocation.js";
import type { Option } from "./parser/option.js";
import { Options } from "./parser/options.js";
import type { Shell } from "./shell.js";
import type { Basic } from "./shell/basic.js";
import { camelCase } from "./util.js";

type InvokeOptions = Record<string, unknown>;

type InvocationBlock = (...args: never[]) => unknown;

type OptionGroups = Map<string | null, Option[]>;

type Instance = Base & Invocation & Shell & Group;

export type GroupClass = typeof Group &
  Omit<BaseClass, keyof typeof Group> & {
    prepareForInvocation(key: unknown, name: unknown): unknown;
  };

export class Group {
  /** @internal */
  static _desc?: string | null;
  /** @internal */
  static _invocations?: Map<unknown, boolean>;
  /** @internal */
  static _invocationBlocks?: Map<unknown, InvocationBlock>;

  static desc(this: GroupClass, description: string | null = null): string | null {
    if (rtest(description)) {
      return (this._desc = description);
    } else {
      if (!Object.hasOwn(this, "_desc") || !rtest(this._desc)) {
        this._desc = this.fromSuperclass("desc", null) as string | null;
      }
      return this._desc!;
    }
  }

  static help(this: GroupClass, shell: Basic): void {
    shell.say("Usage:");
    shell.say(`  ${this.banner()}\n`);
    shell.say();
    this.classOptionsHelp(shell);
    if (rtest(this.desc())) shell.say(this.desc());
  }

  static invocations(this: GroupClass): Map<unknown, boolean> {
    if (!Object.hasOwn(this, "_invocations") || !rtest(this._invocations)) {
      this._invocations = this.fromSuperclass("invocations", new Map()) as Map<unknown, boolean>;
    }
    return this._invocations!;
  }

  static invocationBlocks(this: GroupClass): Map<unknown, InvocationBlock> {
    if (!Object.hasOwn(this, "_invocationBlocks") || !rtest(this._invocationBlocks)) {
      this._invocationBlocks = this.fromSuperclass("invocationBlocks", new Map()) as Map<
        unknown,
        InvocationBlock
      >;
    }
    return this._invocationBlocks!;
  }

  /**
   * @inventedArm isModuleIncluded — PERMANENT
   * @inventedArm camelCase — PERMANENT
   */
  static invoke(this: GroupClass, ...names: unknown[]): void {
    const block = (
      typeof last(names) === "function" && !isModuleIncluded(last(names) as BaseClass, Base)
        ? names.pop()
        : undefined
    ) as InvocationBlock | undefined;
    const options = (rbObjIsKindOf(last(names), Hash) ? names.pop() : {}) as InvokeOptions;
    const verbose = fetch(options, "verbose", true);

    names.forEach((name) => {
      this.invocations().set(name, false);
      if (block !== undefined) this.invocationBlocks().set(name, block);

      const meth = `_invoke${camelCase(rbObjAsString(name).replace(/\W/g, "_"))}`;
      Object.defineProperty(this.prototype, meth, {
        value: async function (this: Instance) {
          const self = this.constructor as GroupClass;
          const prepared = self.prepareForInvocation(null, name);
          const [klass, command] = Array.isArray(prepared) ? prepared : [prepared];

          if (rtest(klass)) {
            this.sayStatus("invoke", name, verbose);
            const block = self.invocationBlocks().get(name);
            return this._invokeForClassMethod(klass, command, block);
          } else {
            return this.sayStatus("error", `${rbInspect(name)} [not found]`, ":red");
          }
        },
        writable: true,
        configurable: true,
      });
      this.methodAdded(meth);
    });
  }

  /** @inventedArm camelCase — PERMANENT */
  static invokeFromOption(this: GroupClass, ...names: unknown[]): void {
    const block = (typeof last(names) === "function" ? names.pop() : undefined) as
      | InvocationBlock
      | undefined;
    const options = (rbObjIsKindOf(last(names), Hash) ? names.pop() : {}) as InvokeOptions;
    const verbose = fetch(options, "verbose", ":white");

    (names as string[]).forEach((name) => {
      if (!hasKey(this.classOptions(), name)) {
        throw new ArgumentError(
          `You have to define the option ${rbInspect(name)} ` +
            "before setting invoke_from_option.",
        );
      }

      this.invocations().set(name, true);
      if (block !== undefined) this.invocationBlocks().set(name, block);

      const meth = `_invokeFromOption${camelCase(rbObjAsString(name).replace(/\W/g, "_"))}`;
      Object.defineProperty(this.prototype, meth, {
        value: async function (this: Instance) {
          if (!rtest(this.options[name])) return;

          let value = this.options[name];
          if (value === true) value = name;
          const self = this.constructor as GroupClass;
          const prepared = self.prepareForInvocation(name, value);
          const [klass, command] = Array.isArray(prepared) ? prepared : [prepared];

          if (rtest(klass)) {
            this.sayStatus("invoke", value, verbose);
            const block = self.invocationBlocks().get(name);
            return this._invokeForClassMethod(klass, command, block);
          } else {
            return this.sayStatus("error", `${rbObjAsString(value)} [not found]`, ":red");
          }
        },
        writable: true,
        configurable: true,
      });
      this.methodAdded(meth);
    });
  }

  static removeInvocation(this: GroupClass, ...names: string[]): void {
    names.forEach((name) => {
      this.removeCommand(name);
      this.removeClassOption(name);
      this.invocations().delete(name);
      this.invocationBlocks().delete(name);
    });
  }

  static classOptionsHelp(this: GroupClass, shell: Basic, groups: OptionGroups = new Map()): void {
    this.getOptionsFromInvocations(groups, this.classOptions(), (klass) => {
      klass.getOptionsFromInvocations(groups, this.classOptions());
    });
    Base.ClassMethods.classOptionsHelp.call(this, shell, groups);
  }

  static getOptionsFromInvocations(
    this: GroupClass,
    groupOptions: OptionGroups,
    baseOptions: Record<string, Option>,
    block?: (klass: GroupClass) => void,
  ): void {
    this.invocations().forEach((fromOption, name) => {
      let value: unknown;
      if (rtest(fromOption)) {
        const option = this.classOptions()[name as string];
        value = option.type === "boolean" ? name : option.default;
      } else {
        value = name;
      }
      if (!rtest(value)) return;

      const prepared = this.prepareForInvocation(name, value);
      const [klass] = (Array.isArray(prepared) ? prepared : [prepared]) as [GroupClass];
      if (!(rtest(klass) && rbObjRespondTo(klass, "classOptions"))) return;

      value = toS(value);
      const humanName = (
        rbObjRespondTo(value, "classify") ? (value as { classify(): string }).classify() : value
      ) as string;

      if (!rtest(groupOptions.get(humanName))) groupOptions.set(humanName, []);
      groupOptions.set(
        humanName,
        groupOptions
          .get(humanName)!
          .concat(
            Object.values(klass.classOptions()).filter(
              (classOption) =>
                baseOptions[classOption.name] == null &&
                classOption.group == null &&
                !(flatten(Array.from(groupOptions.values())) as Option[]).some(
                  (i) => i.name === classOption.name,
                ),
            ),
          ),
      );

      if (block !== undefined) block(klass);
    });
  }

  static printableCommands(this: GroupClass, ..._: unknown[]): string[][] {
    const item: string[] = [];
    item.push(this.banner());
    item.push(rtest(this.desc()) ? `# ${this.desc()!.replace(/\s+/g, " ")}` : "");
    return [item];
  }
  declare static printableTasks: typeof Group.printableCommands;

  static handleArgumentError(
    this: GroupClass,
    command: Command,
    error: Error,
    _args: unknown[],
    arity: number,
  ): never {
    let msg = `${this.basename() ?? ""} ${command.name} takes ${arity} argument`;
    if (arity > 1) msg += "s";
    msg += ", but it should not.";
    const exception = rbObjClone(error);
    exception.message = msg;
    throw exception;
  }

  static isCommandExists(this: GroupClass, commandName: string): boolean {
    return Object.keys(this.commands()).includes(commandName);
  }

  /** @internal */
  static async dispatch(
    this: GroupClass,
    command: string | null | undefined,
    givenArgs: unknown[],
    givenOpts: unknown[] | Record<string, unknown> | null,
    config: BaseConfig,
    block?: (instance: Instance) => void,
  ): Promise<unknown> {
    if (HELP_MAPPINGS.includes(first(givenArgs) as string)) {
      this.help(config.shell!);
      return;
    }

    const split = Options.split(givenArgs);
    const args = split[0];
    let opts: unknown[] | Record<string, unknown> = split[1];
    opts = givenOpts || opts;

    const instance = new this(args, opts, config) as unknown as Instance;
    if (block !== undefined) block(instance);

    if (rtest(command)) {
      return await instance.invokeCommand(this.allCommands()[command!]);
    } else {
      return await instance.invokeAll();
    }
  }

  /** @internal */
  static banner(this: GroupClass): string {
    return `${this.basename() ?? ""} ${this.selfCommand().formattedUsage(this, false)}`;
  }

  /** @internal */
  static selfCommand(this: GroupClass): DynamicCommand {
    return new DynamicCommand(this.namespace(), this.classOptions());
  }
  /** @internal */
  declare static selfTask: typeof Group.selfCommand;

  /** @internal */
  static baseclass(this: GroupClass): typeof Group {
    return Group;
  }

  /** @internal */
  static createCommand(this: GroupClass, meth: string): boolean {
    this.commands()[rbObjAsString(meth)] = new Command(meth, null, null, null, null);
    return true;
  }
  /** @internal */
  declare static createTask: typeof Group.createCommand;

  /**
   * @missingRailsCall class_options — CONVERGEABLE call-gate-pairs-includer-constructor-with-included-module-initialize
   * @missingRailsCall merge — CONVERGEABLE call-gate-pairs-includer-constructor-with-included-module-initialize
   * @missingRailsCall stop_on_unknown_option? — CONVERGEABLE call-gate-pairs-includer-constructor-with-included-module-initialize
   * @missingRailsCall map — CONVERGEABLE call-gate-pairs-includer-constructor-with-included-module-initialize
   * @missingRailsCall disable_required_check? — CONVERGEABLE call-gate-pairs-includer-constructor-with-included-module-initialize
   * @missingRailsCall new — CONVERGEABLE call-gate-pairs-includer-constructor-with-included-module-initialize
   * @missingRailsCall check_unknown_options? — CONVERGEABLE call-gate-pairs-includer-constructor-with-included-module-initialize
   */
  constructor(...args: unknown[]) {
    initializeIncludedModules(this, ...args);
  }

  /** @internal */
  protected _invokeForClassMethod(
    this: Instance,
    klass: unknown,
    command: unknown = null,
    ...args: unknown[]
  ): unknown {
    const block = (typeof last(args) === "function" ? args.pop() : undefined) as
      | ((...yielded: unknown[]) => unknown)
      | undefined;
    return this.withPadding(() => {
      if (block !== undefined) {
        switch (block.length) {
          case 3:
            return block(this, klass, command);
          case 2:
            return block(this, klass);
          case 1:
            return block.call(this, klass);
        }
      } else {
        return this.invoke(klass, command, ...args);
      }
    });
  }
}

Group.printableTasks = Group.printableCommands;
Group.selfTask = Group.selfCommand;
Group.createTask = Group.createCommand;

include(Group, Base);
