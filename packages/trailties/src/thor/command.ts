import {
  ArgumentError,
  dup,
  NoMethodError,
  rbCheckArity,
  rbFSend,
  rbObjAsString,
  rbObjMethod,
  rbObjMethods,
  rbObjPublicMethods,
  rbObjRespondTo,
  rbSetClassPathString,
  regexpEscape,
  rtest,
  RUBY_ENGINE,
  RUBY_PLATFORM,
  strip,
  Struct,
} from "@blazetrails/ruby-compat";
import type { Argument } from "./parser/argument.js";
import type { Option } from "./parser/option.js";

interface CommandClass {
  debugging?: unknown;
  handleNoCommandError(name: string): unknown;
  handleArgumentError(
    command: Command,
    error: ArgumentError,
    args: unknown[],
    arity: number | null,
  ): unknown;
}

interface UsageClass {
  namespace(): string;
  arguments(): Argument[];
}

interface Instance {
  constructor: CommandClass;
}

type Method = (...args: unknown[]) => unknown;

export class Command extends Struct.new(
  "name",
  "description",
  "longDescription",
  "wrapLongDescription",
  "usage",
  "options",
  "optionsRelation",
  "ancestorName",
) {
  static FILE_REGEXP = new RegExp(
    `^${regexpEscape(new URL(".", import.meta.url).href.replace(/\/$/, ""))}`,
  );

  declare name: string;
  declare description: string | null;
  declare longDescription: string | null;
  declare wrapLongDescription: unknown;
  declare usage: string | string[] | null;
  declare options: Record<string, Option>;
  declare optionsRelation: Record<string, string[][] | undefined>;
  declare ancestorName: string | null;

  declare private _requiredOptions?: string;

  constructor(
    name: string,
    description: string | null,
    longDescription: string | null,
    wrapLongDescription: unknown,
    usage: string | string[] | null,
    options: Record<string, Option> | null = null,
    optionsRelation: Record<string, string[][] | undefined> | null = null,
  ) {
    super(
      rbObjAsString(name),
      description,
      longDescription,
      wrapLongDescription,
      usage,
      options ?? {},
      optionsRelation ?? {},
    );
  }

  override initializeCopy(other: Command): this {
    super.initializeCopy(other);
    if (rtest(other.options)) this.options = dup(other.options);
    if (rtest(other.optionsRelation)) this.optionsRelation = dup(other.optionsRelation);
    return this;
  }

  isHidden(): boolean {
    return false;
  }

  async run(instance: Instance, args: unknown[] = []): Promise<unknown> {
    let arity: number | null = null;
    let caller: unknown = null;

    try {
      if (this.isPrivateMethod(instance)) {
        return instance.constructor.handleNoCommandError(this.name);
      } else if (this.isPublicMethod(instance)) {
        arity = rbObjMethod(instance, this.name).arity();
        try {
          rbCheckArity((instance as unknown as Record<string, Method>)[this.name], args.length);
        } catch (e) {
          caller = e;
          throw e;
        }
        return await rbFSend(instance, this.name, ...args);
      } else if (this.isLocalMethod(instance, "methodMissing")) {
        return await rbFSend(instance, "methodMissing", this.name, ...args);
      } else {
        return instance.constructor.handleNoCommandError(this.name);
      }
    } catch (e) {
      if (e instanceof ArgumentError) {
        if (this.isHandleArgumentError(instance, e, caller)) {
          return instance.constructor.handleArgumentError(this, e, args, arity);
        } else {
          throw e;
        }
      } else if (e instanceof NoMethodError) {
        if (this.isHandleNoMethodError(instance, e, caller)) {
          return instance.constructor.handleNoCommandError(this.name);
        } else {
          throw e;
        }
      }
      throw e;
    }
  }

  formattedUsage(
    klass: UsageClass,
    namespace: unknown = true,
    subcommand: unknown = false,
  ): string {
    let formatted: string | null = null;
    if (rtest(this.ancestorName)) {
      formatted = `${this.ancestorName} `;
    } else if (rtest(namespace)) {
      namespace = klass.namespace();
      formatted = `${(namespace as string).replace(/^(default)/gm, "")}:`;
    }
    if (rtest(subcommand)) formatted ??= `${klass.namespace().split(":").at(-1)} `;

    formatted ??= "";

    const usage = this.usage;
    return (usage == null ? [] : Array.isArray(usage) ? usage : [usage])
      .map((specificUsage) => {
        let formattedSpecificUsage = formatted;

        formattedSpecificUsage += this.requiredArgumentsFor(klass, specificUsage);

        formattedSpecificUsage += ` ${this.requiredOptions()}`;

        return strip(formattedSpecificUsage);
      })
      .join("\n");
  }

  methodExclusiveOptionNames(): string[][] {
    return this.optionsRelation.exclusiveOptionNames ?? [];
  }

  methodAtLeastOneOptionNames(): string[][] {
    return this.optionsRelation.atLeastOneOptionNames ?? [];
  }

  /** @internal */
  protected requiredArgumentsFor(klass: UsageClass | null, usage: string | null): string {
    if (klass != null && klass.arguments().length !== 0) {
      return rbObjAsString(usage).replace(
        new RegExp(`^${this.name}`, "gm"),
        (match) =>
          match +
          " " +
          klass
            .arguments()
            .map((argument) => argument.usage())
            .filter((argumentUsage) => argumentUsage != null)
            .join(" "),
      );
    } else {
      return rbObjAsString(usage);
    }
  }

  /** @internal */
  protected isNotDebugging(instance: Instance): boolean {
    return !(
      rbObjRespondTo(instance.constructor, "debugging") && rtest(instance.constructor.debugging)
    );
  }

  /** @internal */
  protected requiredOptions(): string {
    return (this._requiredOptions ??= Object.values(this.options)
      .map((o) => (rtest(o.isRequired()) ? o.usage() : null))
      .filter((optionUsage) => optionUsage != null)
      .sort()
      .join(" "));
  }

  /** @internal */
  protected isPublicMethod(instance: Instance): boolean {
    return rbObjPublicMethods(instance).includes(this.name);
  }

  /**
   * @internal
   * @missingRailsCall private_methods — PERMANENT
   */
  protected isPrivateMethod(_instance: Instance): boolean {
    return false;
  }

  /** @internal */
  protected isLocalMethod(instance: Instance, name: string): boolean {
    const methods = rbObjPublicMethods(instance, false);
    return methods.includes(name);
  }

  /** @internal */
  protected sansBacktrace(backtrace: string[], caller: string[]): string[] {
    const saned = backtrace.filter(
      (frame) =>
        !(
          Command.FILE_REGEXP.test(frame) ||
          (/\.java:/.test(frame) && /java/.test(RUBY_PLATFORM())) ||
          (/^kernel\//m.test(frame) && /rbx/.test(RUBY_ENGINE()))
        ),
    );
    return saned.filter((frame) => !caller.includes(frame));
  }

  /**
   * @internal
   * @missingRailsCall sans_backtrace — PERMANENT
   */
  protected isHandleArgumentError(
    instance: Instance,
    error: ArgumentError,
    caller: unknown,
  ): boolean {
    return (
      this.isNotDebugging(instance) &&
      (/wrong number of arguments/.test(error.message) ||
        /given \d*, expected \d*/.test(error.message)) &&
      error === caller
    );
  }

  /** @internal */
  protected isHandleNoMethodError(
    instance: Instance,
    error: NoMethodError,
    _caller: unknown,
  ): boolean {
    return (
      this.isNotDebugging(instance) &&
      new RegExp(
        `^undefined method \`${this.name}' for ${regexpEscape(rbObjAsString(instance))}$`,
        "m",
      ).test(error.message)
    );
  }
}
rbSetClassPathString(Command, { name: "Thor" }, "Command");
export const Task = Command;

export class HiddenCommand extends Command {
  override isHidden(): boolean {
    return true;
  }
}
rbSetClassPathString(HiddenCommand, { name: "Thor" }, "HiddenCommand");
export const HiddenTask = HiddenCommand;

export class DynamicCommand extends Command {
  constructor(name: string, options: Record<string, Option> | null = null) {
    super(
      rbObjAsString(name),
      "A dynamically-generated command",
      rbObjAsString(name),
      null,
      rbObjAsString(name),
      options,
    );
  }

  override async run(instance: Instance, args: unknown[] = []): Promise<unknown> {
    if (!rbObjMethods(instance).includes(this.name)) {
      return super.run(instance, args);
    } else {
      return instance.constructor.handleNoCommandError(this.name);
    }
  }
}
rbSetClassPathString(DynamicCommand, { name: "Thor" }, "DynamicCommand");
export const DynamicTask = DynamicCommand;
