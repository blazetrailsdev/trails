import { classAttribute, underscore } from "@blazetrails/activesupport";
import { include, type Included } from "@blazetrails/ruby-compat";
import { HELP_MAPPINGS, hiddenCommands } from "../command.js";
import { Actions } from "./actions.js";

export interface ClassOptionConfig {
  aliases?: string | string[];
  desc?: string;
  type?: "boolean" | "string" | "numeric";
  enum?: string[];
  default?: unknown;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */
export interface Base extends Included<typeof Actions> {}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class Base {
  declare private static _namespace: string | undefined;
  declare private static _commandName: string | undefined;
  declare private static _classOptions: Record<string, ClassOptionConfig>;

  declare static bin: string;

  static {
    classAttribute.call(this, "bin", { instanceAccessor: false, default: "bin/rails" });
  }

  options: object;

  constructor(options: object = {}) {
    this.options = options;
  }

  static namespace(name: string | null = null): string {
    if (name != null) {
      return (this._namespace = name);
    } else {
      if (!Object.hasOwn(this, "_namespace")) {
        this._namespace = underscore(this.name)
          .replace(/\//g, ":")
          .replace(/_command$/, "")
          .replace(/:command:/, ":");
      }
      return this._namespace!;
    }
  }

  static hideCommandBang(): void {
    hiddenCommands().push(this);
  }

  static async perform(
    command: string,
    args: string[],
    config: { options?: object } = {},
  ): Promise<void> {
    if (HELP_MAPPINGS.has(args[0])) {
      [command, args] = ["help", [command]];
      if ((this.prototype as { help?: () => unknown }).help?.length === 0) args.length = 0;
    }

    await this.dispatch(command, [...args], null, config);
  }

  static executable(commandName: string = this.commandName()): string {
    return `${this.bin} ${this.namespacedName(commandName)}`;
  }

  static commandName(): string {
    if (!Object.hasOwn(this, "_commandName")) {
      const command = this.name.split("::").at(-1)!;
      this._commandName = underscore(command.replace(/Command$/, ""));
    }
    return this._commandName!;
  }

  /** @internal */
  private static namespacedName(name: string): string {
    const prefix = this.namespace()
      .replace(/^rails:/, "")
      .split(":");
    const basename = prefix.pop()!;
    return [...prefix, ...new Set([basename, String(name)])].join(":");
  }

  /** @noRailsEquivalent CONVERGEABLE vendor-thor-and-port-command-base-thor-surface */
  static classOption(name: string, options: ClassOptionConfig = {}): void {
    this.classOptions()[name] = options;
  }

  /** @noRailsEquivalent CONVERGEABLE vendor-thor-and-port-command-base-thor-surface */
  static classOptions(): Record<string, ClassOptionConfig> {
    if (!Object.hasOwn(this, "_classOptions")) {
      const superclass = Object.getPrototypeOf(this) as typeof Base;
      this._classOptions = { ...(superclass.classOptions?.() ?? {}) };
    }
    return this._classOptions;
  }

  /** @noRailsEquivalent CONVERGEABLE vendor-thor-and-port-command-base-thor-surface */
  static async dispatch(
    meth: string,
    givenArgs: string[],
    givenOpts: object | null,
    config: { options?: object },
  ): Promise<void> {
    const instance = new this(givenOpts ?? config.options ?? {}) as unknown as Record<
      string,
      (...args: string[]) => unknown
    >;
    await instance[meth === this.commandName() ? "perform" : meth](...givenArgs);
  }

  help(command?: string | null): void {
    const klass = this.constructor as typeof Base;
    this.say("Usage:");
    this.say(`  ${klass.executable(command ?? klass.commandName())}`);

    const options = Object.entries(klass.classOptions());
    if (options.length === 0) return;
    this.say("");
    this.say("Options:");
    for (const [name, option] of options) {
      const aliases = [option.aliases ?? []].flat();
      const usage = [...aliases, `[--${name}=${name.toUpperCase()}]`].join(", ");
      this.say(`  ${usage}  # ${option.desc ?? ""}`);
    }
  }

  /** @noRailsEquivalent CONVERGEABLE vendor-thor-and-port-command-base-thor-surface */
  say(message: unknown = "", _color: string | null = null): void {
    console.log(String(message));
  }
}

include(Base, Actions);
