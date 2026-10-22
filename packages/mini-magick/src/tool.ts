import { Shell } from "./shell.js";
import {
  rbBlockGivenP,
  PROTOCOL_PROBES,
  merge,
  rbCheckArrayType,
  rbStrSend,
  rbFArray,
  rbEqual,
  rbObjAsString,
  rbObjIsKindOf,
  Hash,
  rbFSend,
  rbModConstSet,
  rbModDefineMethod,
} from "@blazetrails/ruby-compat";
import { rbCallSuper } from "./codegen-runtime.js";
import { isImagemagick7 } from "./mini-magick.js";
import { MiniMagick } from "./namespaces.js";

export class Tool {
  declare _name: string;
  declare _args: unknown[];
  declare _options: { [x: string]: unknown };

  static toString(): string {
    return "MiniMagick::Tool";
  }

  static CREATION_OPERATORS: unknown = [
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
    const block = rbBlockGivenP(args[args.length - 1]) ? args.pop() : undefined;
    const instance = rbCallSuper(this, "constructor", "MiniMagick::Tool", ...args);
    if (block != null) {
      block(instance);
      return instance();
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
        return (...args: unknown[]) => (receiver as Tool).methodMissing(name, ...args);
      },
    });
  }

  call({ ...options }: Record<string, unknown> = {}, block?: (...args: unknown[]) => unknown) {
    options = merge(this._options, options);
    if (block != null) {
      options.warnings = false;
    }
    const shell = new Shell();
    const [stdout, stderr, status] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
      shell.run(this.command(), { ...options }),
    );
    if (block != null) {
      block(stdout, stderr, status);
    }
    return rbStrSend(stdout as string, "chomp", "\n")[0];
  }

  command() {
    return [...this.executable(), ...this.args];
  }

  executable() {
    const exe = rbFArray(MiniMagick.cliPrefix);
    if (isImagemagick7() && !rbEqual(this.name, "magick")) {
      exe.push("magick");
    }
    if ((MiniMagick.graphicsmagick ?? false) !== false) {
      exe.push("gm");
    }
    return exe.push(this.name);
  }

  append(arg: string) {
    if (Array.isArray(this.args)) this.args.push(rbObjAsString(arg));
    else if (this.args instanceof globalThis.Set) this.args.add(rbObjAsString(arg));
    else this.args.append(rbObjAsString(arg));
    return this;
  }

  mergeBang(newArgs: unknown[]) {
    for (const arg of newArgs) {
      this.append(arg as string);
    }
    return this;
  }

  plus(...values: unknown[]) {
    this.args[-1] = rbStrSend(this.args[-1] as string, "sub", /^-/m, "+")[0];
    this.mergeBang(values);
    return this;
  }

  stack(...args: unknown[]) {
    const block = rbBlockGivenP(args[args.length - 1]) ? args.pop() : undefined;
    this.append("(");
    for (const value of args) {
      if (rbObjIsKindOf(value, Hash)) {
        {
          const items = value;
          for (const [key, value] of items instanceof globalThis.Map
            ? [...items]
            : Array.isArray(items)
              ? items
              : Object.entries(items ?? {})) {
            rbFSend(this, key, ...(value == null ? [] : (rbCheckArrayType(value) ?? [value])));
          }
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
    const option = `-${rbStrSend(rbObjAsString(name), "tr", "_", "-")[0] as string}`;
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
    rbModConstSet(
      Tool,
      rbStrSend(tool, "capitalize")[0] as string,
      class extends Tool {
        static {
          rbModDefineMethod(this, "initialize", (...args: unknown[][]) =>
            rbCallSuper(this, "", "MiniMagick::Tool", tool, ...args),
          );
        }
      },
    );
    Tool.deprecateConstant(rbStrSend(tool, "capitalize")[0]);
  }
}
rbModConstSet(MiniMagick, "Tool", Tool);
