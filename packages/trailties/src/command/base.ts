import { classAttribute, underscore } from "@blazetrails/activesupport";
import {
  File,
  kebabCase,
  include,
  rbFBinding,
  rbModName,
  rbObjAsString as toS,
  rbObjMethod,
  TSE,
  type Included,
} from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "@blazetrails/thor";
import type { Basic } from "@blazetrails/thor/shell/basic";
import type { Command as ThorCommand } from "@blazetrails/thor/command";
import type { Base as ThorBase, BaseConfig } from "@blazetrails/thor/base";
import { Error as ThorError } from "@blazetrails/thor/error";
import type { Shell } from "@blazetrails/thor/shell";
import { ENGINE_ROOT } from "../app-path.js";
import { HELP_MAPPINGS, hiddenCommands } from "../command.js";
import { Actions } from "./actions.js";
import { subclasses } from "./behavior.js";

declare module "@blazetrails/thor" {
  interface Thor {
    invokeCommand(command: ThorCommand, ...args: unknown[]): Promise<unknown>;
  }
}

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Base extends Included<typeof Actions>, ThorBase, Shell {}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class Base extends Thor {
  declare static _namespace: string | undefined;
  declare private static _commandName: string | undefined;
  declare private static _baseName: string | null | undefined;
  declare private static _classUsage: string | undefined;
  declare private static _usagePath: string | null;
  declare private static _defaultCommandRoot: string | null;

  declare static bin: string;

  /** @internal */
  private _currentSubcommand: string | null | undefined;

  static {
    classAttribute.call(this, "bin", { instanceAccessor: false, default: "bin/rails" });
    const klass = this as unknown as ThorClass;
    klass.noCommands(() => {
      this.methodAdded("executable");
      this.methodAdded("invokeCommand");
    });
  }

  static isExitOnFailure(): boolean {
    return false;
  }

  static isEngine(): boolean {
    return ENGINE_ROOT != null;
  }

  static desc(
    usage: string | string[] | null = null,
    description: string | null = null,
    options: Record<string, unknown> = {},
  ): void | Promise<string | null> {
    if (usage != null) {
      return (Thor as unknown as ThorClass).desc.call(
        this as unknown as ThorClass,
        usage,
        description,
        options,
      );
    } else {
      return this.classUsage();
    }
  }

  /** @inventedArm replaceAll — PERMANENT */
  static namespace(name: string | null = null): string {
    const thor = Thor as unknown as ThorClass;
    if (name != null) {
      return thor.namespace.call(this as unknown as ThorClass, name);
    } else {
      if (!Object.hasOwn(this, "_namespace") || this._namespace == null) {
        this._namespace = thor.namespace
          .call(this as unknown as ThorClass)
          .replace(/_command$/, "")
          .replace(/:command:/, ":")
          .replaceAll("_", "-");
      }
      return this._namespace;
    }
  }

  static methodAdded(meth: string): void {
    if (this.name && !this.name.endsWith("Base") && !subclasses().includes(this)) {
      subclasses().push(this);
    }
    (Thor as unknown as ThorClass).methodAdded.call(this as unknown as ThorClass, meth);
  }

  static hideCommandBang(): void {
    hiddenCommands().push(this);
  }

  static async perform(command: string, args: string[], config: BaseConfig): Promise<void> {
    if (HELP_MAPPINGS.has(args[0])) {
      [command, args] = ["help", [command]];
      if (rbObjMethod(this.prototype, "help").arity() === 0) args.length = 0;
    }

    await (this as unknown as ThorClass).dispatch(command, [...args], null, config);
  }

  static printingCommands(): [string, string | null][] {
    return Object.entries((this as unknown as ThorClass).commands())
      .filter(([, command]) => !command.isHidden())
      .map(([name, command]) => [this.namespacedName(name), command.description]);
  }

  static executable(commandName: string = this.commandName()): string {
    return `${this.bin} ${this.namespacedName(commandName)}`;
  }

  static banner(command: ThorCommand | null = null, ..._rest: unknown[]): string {
    if (command != null) {
      return command
        .formattedUsage(this as unknown as ThorClass)
        .replace(new RegExp(`^${this.namespace()}:([\\w-]+)`, "gm"), (_, name: string) =>
          this.executable(name),
        );
    } else {
      return this.executable();
    }
  }

  static async help(shell: Basic, ...rest: unknown[]): Promise<void> {
    (Thor as unknown as ThorClass).help.call(this as unknown as ThorClass, shell, ...rest);
    if ((await this.classUsage()) != null) shell.say(await this.classUsage());
  }

  static baseName(): string | null {
    if (!Object.hasOwn(this, "_baseName") || this._baseName == null) {
      const base = toS(rbModName(this)).split("::")[0];
      this._baseName = base === "" ? null : underscore(base);
    }
    return this._baseName;
  }

  /** @inventedArm kebabCase — PERMANENT */
  static commandName(): string {
    if (!Object.hasOwn(this, "_commandName")) {
      const command = this.name.split("::").at(-1)!;
      this._commandName = kebabCase(command.replace(/Command$/, ""));
    }
    return this._commandName!;
  }

  static async classUsage(): Promise<string | null> {
    const usagePath = await this.usagePath();
    if (usagePath != null) {
      if (!Object.hasOwn(this, "_classUsage") || this._classUsage == null) {
        const erb = new TSE(await File.readAsync(usagePath), { trimMode: "-" });
        erb.filename = usagePath;
        this._classUsage = await erb.result(rbFBinding(this));
      }
      return this._classUsage;
    }
    return null;
  }

  static async usagePath(): Promise<string | null> {
    if (!Object.hasOwn(this, "_usagePath")) this._usagePath = await this.resolvePath("USAGE");
    return this._usagePath;
  }

  static async defaultCommandRoot(): Promise<string | null> {
    if (!Object.hasOwn(this, "_defaultCommandRoot")) {
      this._defaultCommandRoot = await this.resolvePath(".");
    }
    return this._defaultCommandRoot;
  }

  /** @internal */
  static createCommand(meth: string): boolean {
    const klass = this as unknown as ThorClass & { _usage?: unknown; _desc?: unknown };
    if (meth === "perform") {
      Object.defineProperty(this.prototype, this.commandName(), {
        value: (this.prototype as unknown as Record<string, unknown>)[meth],
        writable: true,
        configurable: true,
      });
      klass.methodAdded(this.commandName());
      return true;
    } else {
      if (!Object.hasOwn(this, "_usage") || klass._usage == null) klass._usage = kebabCase(meth);
      if (!Object.hasOwn(this, "_desc") || klass._desc == null) klass._desc = "";

      return (Thor as unknown as ThorClass).createCommand.call(klass, meth);
    }
  }

  executable(commandName?: string): string {
    return (this.constructor as typeof Base).executable(commandName);
  }

  get currentSubcommand(): string | null | undefined {
    return this._currentSubcommand;
  }

  async invokeCommand(command: ThorCommand, ...args: unknown[]): Promise<unknown> {
    this._currentSubcommand ??= null;
    const originalSubcommand = this._currentSubcommand;
    this._currentSubcommand = command.name;
    try {
      return await super.invokeCommand(command, ...args);
    } finally {
      this._currentSubcommand = originalSubcommand;
    }
  }

  /** @internal */
  private static namespacedName(name: string): string {
    const prefix = this.namespace()
      .replace(/^rails:/, "")
      .split(":");
    const basename = prefix.pop()!;
    return [...prefix, ...new Set([basename, String(name)])].join(":");
  }

  /** @internal */
  private static async resolvePath(path: string): Promise<string | null> {
    const namespace = this.namespace();
    path = File.join(
      "../commands",
      ...(namespace.startsWith("rails:") ? namespace.slice("rails:".length) : namespace).split(":"),
      path,
    );
    path = File.expandPath(path, __dir__);
    return (await File.isExistAsync(path)) ? path : null;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-namespace */
export namespace Base {
  export class Error extends ThorError {}
}

include(Base, Actions);
