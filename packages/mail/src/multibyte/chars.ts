import {
  cmp,
  equals as cmpEquals,
  NoMethodError,
  IndexError,
  pack,
  RangeError,
  rbStrMatch,
  rbStrRespondTo,
  rbStrSend,
  stringSplit,
  TypeError,
  ArgumentError,
  arySlice,
  Range,
  rbObjClassname,
} from "@blazetrails/ruby-compat";
import { Multibyte } from "../multibyte.js";
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

  equals = cmpEquals;

  matchOperator(other: unknown): unknown {
    return rbStrMatch(this.wrappedString, other);
  }

  split(...args: [pattern?: string | RegExp | null, limit?: number]): (Chars | string)[] {
    return stringSplit(this.wrappedString, ...args).map((i) => Multibyte.mbChars(i));
  }

  set(...args: unknown[]): void {
    let replaceBy = args.pop() as string | number;
    if (args[0] instanceof RegExp) {
      const m = firstMatch(this.wrappedString, args[0]);
      const capture = args.length > 1 ? (args[1] as number) : 0;
      if (m == null || m[capture] == null) throw new IndexError("regexp not matched");
      const start = m.index + (capture === 0 ? 0 : m[0].indexOf(m[capture]));
      this.wrappedString =
        this.wrappedString.slice(0, start) +
        String(replaceBy) +
        this.wrappedString.slice(start + m[capture].length);
    } else {
      const result = Unicode.uUnpack(this.wrappedString);
      let range: Range<number>;
      if (typeof args[0] === "number") {
        if (args[0] >= result.length) throw new IndexError(`index ${args[0]} out of string`);
        const min = args[0];
        const max = args[1] == null ? min : min + (args[1] as number) - 1;
        range = new Range(min, max);
        if (typeof replaceBy === "number") replaceBy = pack([replaceBy], "U");
      } else if (args[0] instanceof Range) {
        if (args[0].min() >= result.length) throw new RangeError(`${args[0].toS()} out of range`);
        range = args[0];
      } else {
        const needle = String(args[0]);
        const index = this.wrappedString.indexOf(needle);
        if (index < 0) throw new NoMethodError("undefined method '+' for nil");
        const min = Array.from(this.wrappedString.slice(0, index)).length;
        const max = min + Unicode.uUnpack(needle).length - 1;
        range = new Range(min, max);
      }
      let beg = range.begin ?? 0;
      let end = range.end ?? result.length;
      if (beg < 0) beg += result.length;
      if (end < 0) end += result.length;
      if (range.end !== null && !range.excludeEnd) end += 1;
      result.splice(beg, Math.max(0, end - beg), ...Unicode.uUnpack(String(replaceBy)));
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
      throw new TypeError(`cannot convert ${rbObjClassname(args[0])} into Integer`);
    } else if (args.length === 2 && typeof args[1] !== "number") {
      throw new TypeError(`cannot convert ${rbObjClassname(args[1])} into Integer`);
    } else if (args[0] instanceof Range) {
      const cps = arySlice(Unicode.uUnpack(this.wrappedString), args[0]) as number[] | null;
      result = cps == null ? null : pack(cps, "U*");
    } else if (args[0] instanceof RegExp) {
      const m = firstMatch(this.wrappedString, args[0]);
      result = m ? (m[args.length > 1 ? (args[1] as number) : 0] ?? null) : null;
    } else if (args.length === 1 && typeof args[0] === "number") {
      const character = arySlice(Unicode.uUnpack(this.wrappedString), args[0]) as number | null;
      result = character != null ? pack([character], "U") : null;
    } else {
      const cps = arySlice(Unicode.uUnpack(this.wrappedString), args[0], args[1]) as
        | number[]
        | null;
      result = cps != null ? pack(cps, "U*") : null;
    }
    return result != null ? this.chars(result) : null;
  }

  get(...args: unknown[]): Chars | null {
    return this.slice(...args);
  }

  limit(limit: number): Chars | null {
    return this.slice(new Range(0, this.translateOffset(limit), true));
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
        (this.slice(new Range(1, -1)) ?? this.chars("")).downcase().toS(),
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

    const bytes = new TextEncoder().encode(this.wrappedString);

    for (;;) {
      try {
        return Unicode.uUnpack(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, byteOffset)),
        ).length;
      } catch (e) {
        if (!(e instanceof globalThis.TypeError)) throw e;
        byteOffset -= 1;
      }
    }
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

function firstMatch(string: string, re: RegExp): RegExpExecArray | null {
  return new RegExp(re.source, re.flags.replace("g", "")).exec(string);
}
