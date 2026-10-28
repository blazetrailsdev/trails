import { Shell } from "./shell.js";
import {
  PROTOCOL_PROBES,
  chomp,
  rbFArray,
  rbObjAsString,
  rbFSend,
  rbConstWarnIfDeprecated,
  rbModDeprecateConstant,
} from "@blazetrails/ruby-compat";
import { MiniMagick } from "./mini-magick.js";

/** @noRailsEquivalent PERMANENT */
export type CliTool = Tool & { [option: string]: (...args: unknown[]) => CliTool };

export class Tool {
  declare _name: string;
  declare _args: string[];
  declare _options: { [x: string]: unknown };

  static toString(): string {
    return "MiniMagick::Tool";
  }

  static CREATION_OPERATORS: string[] = [
    "xc",
    "canvas",
    "logo",
    "rose",
    "gradient",
    "radial-gradient",
    "plasma",
    "pattern",
    "text",
    "pango",
  ];

  static new(...args: unknown[]) {
    const block =
      typeof args[args.length - 1] === "function"
        ? (args.pop() as (instance: CliTool) => unknown)
        : undefined;
    const instance = new this(...(args as [string, Record<string, unknown>?]));
    if (block != null) {
      block(instance as CliTool);
      return instance.call();
    } else {
      return instance;
    }
  }

  get name() {
    return this._name;
  }

  get args() {
    return this._args;
  }

  constructor(name: string, { ...options }: Record<string, unknown> = {}) {
    this._name = name;
    this._args = [];
    this._options = options;
    return new Proxy(this, {
      get(target, name, receiver) {
        if (typeof name === "symbol" || name in target || PROTOCOL_PROBES.has(name))
          return Reflect.get(target, name, receiver);
        return (...args: unknown[]) =>
          (receiver as Tool).methodMissing(
            name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
            ...args,
          );
      },
    });
  }

  async call(
    { ...options }: Record<string, unknown> = {},
    block?: (stdout: string | Uint8Array, stderr: string, status: number | null) => unknown,
  ): Promise<string | Uint8Array> {
    options = { ...this._options, ...options };
    if (block != null) {
      options.warnings = false;
    }
    const shell = new Shell();
    const [stdout, stderr, status] = await shell.run(this.command(), { ...options });
    if (block != null) {
      await block(stdout, stderr, status);
    }
    return chomp(stdout, "\n");
  }

  command(): string[] {
    return [...this.executable(), ...this.args];
  }

  executable() {
    const exe = rbFArray(MiniMagick.cliPrefix) as string[];
    if (MiniMagick.isImagemagick7() && this.name !== "magick") {
      exe.push("magick");
    }
    if ((MiniMagick.graphicsmagick ?? false) !== false) {
      exe.push("gm");
    }
    exe.push(this.name);
    return exe;
  }

  append(arg: unknown) {
    this.args.push(rbObjAsString(arg));
    return this;
  }

  mergeBang(newArgs: unknown[]) {
    for (const arg of newArgs) {
      this.append(arg);
    }
    return this;
  }

  plus(...values: unknown[]) {
    this.args[this.args.length - 1] = this.args.at(-1)!.replace(/^-/m, "+");
    this.mergeBang(values);
    return this;
  }

  stack(...args: unknown[]) {
    const block =
      typeof args[args.length - 1] === "function"
        ? (args.pop() as (tool: this) => unknown)
        : undefined;
    this.append("(");
    for (const value of args) {
      if (
        value instanceof Map ||
        (value != null && Object.getPrototypeOf(value) === Object.prototype)
      ) {
        for (const [key, val] of value instanceof Map ? value : Object.entries(value)) {
          rbFSend(this, key, ...(val == null ? [] : Array.isArray(val) ? val : [val]));
        }
      } else if (typeof value === "string") {
        this.append(value);
      }
    }
    if (block != null) {
      block(this);
    }
    return this.append(")");
  }

  stdin() {
    return this.append("-");
  }

  stdout() {
    return this.append("-");
  }

  xc(value: unknown = null) {
    this.append(`xc:${value ?? ""}`);
    return this;
  }

  canvas(value: unknown = null) {
    this.append(`canvas:${value ?? ""}`);
    return this;
  }

  logo(value: unknown = null) {
    this.append(`logo:${value ?? ""}`);
    return this;
  }

  rose(value: unknown = null) {
    this.append(`rose:${value ?? ""}`);
    return this;
  }

  gradient(value: unknown = null) {
    this.append(`gradient:${value ?? ""}`);
    return this;
  }

  radialGradient(value: unknown = null) {
    this.append(`radial-gradient:${value ?? ""}`);
    return this;
  }

  plasma(value: unknown = null) {
    this.append(`plasma:${value ?? ""}`);
    return this;
  }

  pattern(value: unknown = null) {
    this.append(`pattern:${value ?? ""}`);
    return this;
  }

  text(value: unknown = null) {
    this.append(`text:${value ?? ""}`);
    return this;
  }

  pango(value: unknown = null) {
    this.append(`pango:${value ?? ""}`);
    return this;
  }

  clone(...args: unknown[]) {
    this.append("-clone");
    this.mergeBang(args);
    return this;
  }

  methodMissing(name: string, ...args: unknown[]) {
    const option = `-${name.replaceAll("_", "-")}`;
    this.append(option);
    this.mergeBang(args);
    return this;
  }
}
{
  for (const tool of [
    "animate",
    "compare",
    "composite",
    "conjure",
    "convert",
    "display",
    "identify",
    "import",
    "magick",
    "mogrify",
    "montage",
    "stream",
  ]) {
    const Name = tool[0].toUpperCase() + tool.slice(1);
    const klass = class extends Tool {
      static toString(): string {
        return `MiniMagick::Tool::${Name}`;
      }

      constructor(...args: unknown[]) {
        super(tool, ...(args as [Record<string, unknown>?]));
      }
    };
    Object.defineProperty(Tool, Name, {
      get() {
        rbConstWarnIfDeprecated(Tool, Name);
        return klass;
      },
      set(value: unknown) {
        Object.defineProperty(Tool, Name, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
      enumerable: true,
      configurable: true,
    });
    rbModDeprecateConstant(Tool, Name);
  }
}
