import { ArgumentError, TypeError, rbBuiltinClassName } from "@blazetrails/ruby-compat";

export interface IO {
  read(): string | null;
}

/** @noRailsEquivalent PERMANENT */
export class Context {
  io: IO | null = null;
  encoding: string | null = null;

  constructor(readonly _source: string) {}

  static io(io: IO | null): Context {
    if (io == null) throw new TypeError("Must pass in an IO object");
    const result = new Context(io.read() ?? "");
    result.io = io;
    return result;
  }

  static string(string: string | null): Context {
    if (typeof string !== "string")
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(string)} (expected String)`);
    if (string.length === 0)
      throw new ArgumentError("Must specify a string with one or more characters");
    return new Context(string);
  }
}
