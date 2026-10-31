import { classAttribute } from "@blazetrails/activesupport";
import { kebabCase, include, rbObjMethod, type Included } from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "@blazetrails/thor";
import type { Command as ThorCommand } from "@blazetrails/thor/command";
import type { Base as ThorBase, BaseConfig } from "@blazetrails/thor/base";
import { Error as ThorError } from "@blazetrails/thor/error";
import type { Shell } from "@blazetrails/thor/shell";
import { HELP_MAPPINGS, hiddenCommands } from "../command.js";
import { Actions } from "./actions.js";
import { subclasses } from "./behavior.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Base extends Included<typeof Actions>, ThorBase, Shell {}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class Base extends Thor {
  declare static _namespace: string | undefined;
  declare private static _commandName: string | undefined;

  declare static bin: string;

  static {
    classAttribute.call(this, "bin", { instanceAccessor: false, default: "bin/rails" });
  }

  static isExitOnFailure(): boolean {
    return false;
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

  /** @inventedArm kebabCase — PERMANENT */
  static commandName(): string {
    if (!Object.hasOwn(this, "_commandName")) {
      const command = this.name.split("::").at(-1)!;
      this._commandName = kebabCase(command.replace(/Command$/, ""));
    }
    return this._commandName!;
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

  /** @internal */
  private static namespacedName(name: string): string {
    const prefix = this.namespace()
      .replace(/^rails:/, "")
      .split(":");
    const basename = prefix.pop()!;
    return [...prefix, ...new Set([basename, String(name)])].join(":");
  }
}

/* eslint-disable-next-line @typescript-eslint/no-namespace */
export namespace Base {
  export class Error extends ThorError {}
}

include(Base, Actions);
