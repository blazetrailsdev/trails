import {
  cmp,
  IndexError,
  pack,
  RangeError,
  rbStrMatch,
  rbStrRespondTo,
  rbStrSend,
  stringSplit,
  TypeError,
  ArgumentError,
} from "@blazetrails/ruby-compat";
import { Unicode } from "./unicode.js";

export class Chars {
  static toString(): string {
    return "Mail::Multibyte::Chars";
  }

  wrappedString: string;

  constructor(string: string) {
    this.wrappedString = string;
  }

  toS(): string {
    return this.wrappedString;
  }

  toStr(): string {
    return this.wrappedString;
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    if (/Bang$/.test(method)) {
      [, this.wrappedString] = rbStrSend(this.wrappedString, method, ...args);
      return this;
    } else {
      const [result] = rbStrSend(this.wrappedString, method, ...args);
      return typeof result === "string" ? this.chars(result) : result;
    }
  }

  isRespondTo(method: string, includePrivate: boolean = false): boolean {
    return method in this || rbStrRespondTo(this.wrappedString, method, includePrivate) || false;
  }

  actsLikeString(): boolean {
    return true;
  }

  compareTo(other: unknown): number | null {
    return cmp(this.wrappedString, String(other));
  }

  matchOperator(other: unknown): unknown {
    return rbStrMatch(this.wrappedString, other);
  }

  split(...args: [pattern?: string | RegExp | null, limit?: number]): Chars[] {
    return stringSplit(this.wrappedString, ...args).map((i) => this.chars(i));
  }

  setIndex(...args: unknown[]): void {
    let replaceBy = args.pop() as string | number;
    if (args[0] instanceof RegExp) {
      this.wrappedString = this.wrappedString.replace(args[0], String(replaceBy));
    } else {
      const result = Unicode.uUnpack(this.wrappedString);
      let range: [number, number];
      if (typeof args[0] === "number") {
        if (args[0] >= result.length) throw new IndexError(`index ${args[0]} out of string`);
        const min = args[0];
        const max = args[1] == null ? min : min + (args[1] as number) - 1;
        range = [min, max];
        if (typeof replaceBy === "number") replaceBy = pack([replaceBy], "U");
      } else if (Array.isArray(args[0])) {
        if (args[0][0] >= result.length) {
          throw new RangeError(`${args[0][0]}..${args[0][1]} out of range`);
        }
        range = args[0] as [number, number];
      } else {
        const needle = String(args[0]);
        const min = Array.from(
          this.wrappedString.slice(0, this.wrappedString.indexOf(needle)),
        ).length;
        const max = min + Unicode.uUnpack(needle).length - 1;
        range = [min, max];
      }
      result.splice(range[0], range[1] - range[0] + 1, ...Unicode.uUnpack(String(replaceBy)));
      this.wrappedString = pack(result, "U*");
    }
  }

  reverse(): Chars {
    return this.chars(pack(Unicode.gUnpack(this.wrappedString).reverse().flat(), "U*"));
  }

  slice(...args: unknown[]): Chars | null {
    let result: string | null;
    if (args.length > 2) {
      throw new ArgumentError(`wrong number of arguments (${args.length} for 1)`);
    } else if (args.length === 2 && !(typeof args[0] === "number" || args[0] instanceof RegExp)) {
      throw new TypeError(`cannot convert ${typeName(args[0])} into Integer`);
    } else if (args.length === 2 && typeof args[1] !== "number") {
      throw new TypeError(`cannot convert ${typeName(args[1])} into Integer`);
    } else if (Array.isArray(args[0])) {
      const cps = Unicode.uUnpack(this.wrappedString);
      const [min, max] = args[0] as [number, number];
      const from = min < 0 ? cps.length + min : min;
      result =
        from > cps.length
          ? null
          : pack(cps.slice(from, max < 0 ? cps.length + max + 1 : max + 1), "U*");
    } else if (args[0] instanceof RegExp) {
      const m = this.wrappedString.match(args[0]);
      result = m ? (m[(args[1] as number) ?? 0] ?? null) : null;
    } else if (args.length === 1 && typeof args[0] === "number") {
      const cps = Unicode.uUnpack(this.wrappedString);
      const character = cps.at(args[0]);
      result = character != null ? pack([character], "U") : null;
    } else {
      const cps = Unicode.uUnpack(this.wrappedString);
      const [start, len] = args as [number, number];
      const from = start < 0 ? cps.length + start : start;
      result = from > cps.length || len < 0 ? null : pack(cps.slice(from, from + len), "U*");
    }
    return result != null ? this.chars(result) : null;
  }

  get(...args: unknown[]): Chars | null {
    return this.slice(...args);
  }

  limit(limit: number): Chars | null {
    return this.slice([0, this.translateOffset(limit)! - 1]);
  }

  upcase(): Chars {
    return this.chars(Unicode.applyMapping(this.wrappedString, ":uppercase_mapping"));
  }

  downcase(): Chars {
    return this.chars(Unicode.applyMapping(this.wrappedString, ":lowercase_mapping"));
  }

  capitalize(): Chars {
    return this.chars(
      (this.slice(0) ?? this.chars("")).upcase().toS() +
        (this.slice([1, -1]) ?? this.chars("")).downcase().toS(),
    );
  }

  titleize(): Chars {
    return this.chars(
      this.downcase()
        .toS()
        .replace(WORD_BOUNDARY_TITLEIZE, (_m, c: string) =>
          Unicode.applyMapping(c, ":uppercase_mapping"),
        ),
    );
  }

  titlecase(): Chars {
    return this.titleize();
  }

  normalize(form: string | null = null): Chars {
    return this.chars(Unicode.normalize(this.wrappedString, form));
  }

  decompose(): Chars {
    return this.chars(
      pack(Unicode.decomposeCodepoints(":canonical", Unicode.uUnpack(this.wrappedString)), "U*"),
    );
  }

  compose(): Chars {
    return this.chars(pack(Unicode.composeCodepoints(Unicode.uUnpack(this.wrappedString)), "U*"));
  }

  gLength(): number {
    return Unicode.gUnpack(this.wrappedString).length;
  }

  tidyBytes(force: boolean = false): Chars {
    return this.chars(Unicode.tidyBytes(this.wrappedString, force));
  }

  capitalizeBang(): this {
    this.wrappedString = this.capitalize().toS();
    return this;
  }

  downcaseBang(): this {
    this.wrappedString = this.downcase().toS();
    return this;
  }

  reverseBang(): this {
    this.wrappedString = this.reverse().toS();
    return this;
  }

  sliceBang(...args: unknown[]): this {
    this.wrappedString = this.slice(...args)?.toS() ?? "";
    return this;
  }

  tidyBytesBang(force: boolean = false): this {
    this.wrappedString = this.tidyBytes(force).toS();
    return this;
  }

  upcaseBang(): this {
    this.wrappedString = this.upcase().toS();
    return this;
  }

  /** @internal */
  protected translateOffset(byteOffset: number | null): number | null {
    if (byteOffset == null) return null;
    if (this.wrappedString === "") return 0;
    let bytes = 0;
    let length = 0;
    for (const c of this.wrappedString) {
      bytes += new TextEncoder().encode(c).length;
      if (bytes > byteOffset) break;
      length += 1;
    }
    return length;
  }

  /** @internal */
  protected justify(integer: number, way: string, padstr: string = " "): Chars {
    if (padstr.length === 0) throw new ArgumentError("zero width padding");
    let padsize = integer - Array.from(this.wrappedString).length;
    padsize = padsize > 0 ? padsize : 0;
    let result = "";
    switch (way) {
      case ":right":
        result = this.padding(padsize, padstr) + this.wrappedString;
        break;
      case ":left":
        result = this.wrappedString + this.padding(padsize, padstr);
        break;
      case ":center": {
        const lpad = this.padding(Math.floor(padsize / 2.0), padstr);
        const rpad = this.padding(Math.ceil(padsize / 2.0), padstr);
        result = lpad + this.wrappedString + rpad;
        break;
      }
    }
    return this.chars(result);
  }

  /** @internal */
  protected padding(padsize: number, padstr: string = " "): string {
    if (padsize !== 0) {
      return (
        this.chars(padstr.repeat(Math.floor(padsize / Unicode.uUnpack(padstr).length) + 1))
          .slice(0, padsize)
          ?.toS() ?? ""
      );
    } else {
      return "";
    }
  }

  /** @internal */
  protected chars(string: string): Chars {
    return new (this.constructor as typeof Chars)(string);
  }
}

const W = "[\\p{L}\\p{M}\\p{N}\\p{Pc}]";
const WORD_BOUNDARY_TITLEIZE = new RegExp(`(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))('?\\S)`, "gu");

function typeName(value: unknown): string {
  return value == null ? "NilClass" : typeof value === "string" ? "String" : value.constructor.name;
}
