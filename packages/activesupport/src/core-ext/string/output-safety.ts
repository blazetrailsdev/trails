import { NoMethodError, Range, rbObjClass } from "@blazetrails/ruby-compat";

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

export class SafeConcatError extends Error {
  constructor() {
    super("Could not concatenate to the buffer because it is not HTML safe.");
    this.name = "SafeConcatError";
  }
}

function escapeHTML(str: string): string {
  return str.replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
}

function toStr(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof SafeBuffer) return arg.toStr();
  const conv = (arg as { toStr?: () => string } | null)?.toStr;
  if (typeof conv === "function") return conv.call(arg);
  throw new NoMethodError(`undefined method 'to_str' for an instance of ${rbObjClass(arg)}`);
}

function concatArgument(arg: unknown): string {
  return typeof arg === "number" ? String.fromCodePoint(arg) : toStr(arg);
}

type ArefArgs =
  | [index: number]
  | [start: number, length: number]
  | [range: Range<number>]
  | [regexp: RegExp, capture?: number]
  | [match: string];

function strAref(str: string, args: ArefArgs): string | null {
  const [first, second] = args;
  if (first instanceof RegExp) {
    const match = new RegExp(first.source, first.flags.replace(/[gy]/g, "")).exec(str);
    if (!match) return null;
    return match[second ?? 0] ?? null;
  }
  if (typeof first === "string") return str.includes(first) ? first : null;
  if (first instanceof Range) {
    const len = str.length;
    let start = first.begin ?? 0;
    let end = first.end ?? len;
    if (start < 0) start += len;
    if (end < 0) end += len;
    if (start < 0 || start > len) return null;
    if (!first.excludeEnd || first.end === null) end += first.end === null ? 0 : 1;
    return str.slice(start, Math.max(start, end));
  }
  let start = first;
  if (start < 0) start += str.length;
  if (second === undefined) {
    if (start < 0 || start >= str.length) return null;
    return str[start];
  }
  if (start < 0 || start > str.length || second < 0) return null;
  return str.slice(start, start + second);
}

function strRange(str: string, args: ArefArgs): [number, number] {
  const [first, second] = args;
  if (first instanceof RegExp) {
    const match = new RegExp(first.source, first.flags.replace(/[gyd]/g, "") + "d").exec(str)!;
    const [start, end] = match.indices![second ?? 0];
    return [start, end - start];
  }
  if (typeof first === "string") return [str.indexOf(first), first.length];
  if (first instanceof Range) {
    const len = str.length;
    let start = first.begin ?? 0;
    let end = first.end ?? len;
    if (start < 0) start += len;
    if (end < 0) end += len;
    if (!first.excludeEnd && first.end !== null) end += 1;
    return [start, Math.max(0, end - start)];
  }
  let start = first;
  if (start < 0) start += str.length;
  return [start, second === undefined ? 1 : second];
}

export class SafeBuffer {
  static readonly UNSAFE_STRING_METHODS = [
    "capitalize",
    "chomp",
    "chop",
    "delete",
    "delete_prefix",
    "delete_suffix",
    "downcase",
    "lstrip",
    "next",
    "reverse",
    "rstrip",
    "scrub",
    "squeeze",
    "strip",
    "succ",
    "swapcase",
    "tr",
    "tr_s",
    "unicode_normalize",
    "upcase",
  ];

  static readonly UNSAFE_STRING_METHODS_WITH_BACKREF = ["gsub", "sub"];

  static readonly SafeConcatError = SafeConcatError;

  private _value: string;
  private _htmlSafe: boolean;

  constructor(str: string = "", htmlSafe: boolean = true) {
    this._htmlSafe = htmlSafe;
    this._value = str;
  }

  get(...args: ArefArgs): SafeBuffer | string | null {
    if (this._htmlSafe) {
      const newString = strAref(this._value, args);
      if (newString == null) return null;
      return this.stringIntoSafeBuffer(newString, true);
    } else {
      return strAref(this.toStr(), args);
    }
  }

  slice(...args: ArefArgs): SafeBuffer | string | null {
    return this.get(...args);
  }

  sliceBang(...args: ArefArgs): SafeBuffer | string | null {
    const newString = strAref(this._value, args);
    if (newString != null) {
      const [start, length] = strRange(this._value, args);
      this._value = this._value.slice(0, start) + this._value.slice(start + length);
    }
    if (!this._htmlSafe || newString == null) return newString;
    return this.stringIntoSafeBuffer(newString, true);
  }

  chr(): SafeBuffer | string {
    const first = Array.from(this._value)[0] ?? "";
    if (!this._htmlSafe) return first;
    return this.stringIntoSafeBuffer(first, true);
  }

  safeConcat(value: unknown): this {
    if (!this._htmlSafe) throw new SafeConcatError();
    this._value += concatArgument(value);
    return this;
  }

  dup(): SafeBuffer {
    return new SafeBuffer(this._value, this._htmlSafe);
  }

  concat(value: unknown): this {
    if (value != null) {
      this._value += concatArgument(this.implicitHtmlEscapeInterpolatedArgument(value));
    }
    return this;
  }

  bytesplice(...args: [...(number | Range<number>)[], unknown]): this {
    const value = toStr(this.implicitHtmlEscapeInterpolatedArgument(args.pop()));
    const bytes = new TextEncoder().encode(this._value);
    const [start, length] =
      args[0] instanceof Range
        ? strRange(String.fromCharCode(...bytes), [args[0]])
        : [args[0] as number, args[1] as number];
    const decoder = new TextDecoder();
    this._value =
      decoder.decode(bytes.slice(0, start)) + value + decoder.decode(bytes.slice(start + length));
    return this;
  }

  insert(index: number, value: unknown): this {
    const str = toStr(this.implicitHtmlEscapeInterpolatedArgument(value));
    const at = index < 0 ? this._value.length + index + 1 : index;
    this._value = this._value.slice(0, at) + str + this._value.slice(at);
    return this;
  }

  prepend(value: unknown): this {
    this._value = toStr(this.implicitHtmlEscapeInterpolatedArgument(value)) + this._value;
    return this;
  }

  replace(value: unknown): this {
    this._value = toStr(this.implicitHtmlEscapeInterpolatedArgument(value));
    return this;
  }

  set(arg1: number | Range<number>, arg2: unknown, arg3?: unknown): unknown {
    if (arg3 !== undefined) {
      const [start, length] = strRange(this._value, [arg1 as number, arg2 as number]);
      const str = toStr(this.implicitHtmlEscapeInterpolatedArgument(arg3));
      this._value = this._value.slice(0, start) + str + this._value.slice(start + length);
      return arg3;
    } else {
      const [start, length] = strRange(this._value, [arg1] as ArefArgs);
      const str = toStr(this.implicitHtmlEscapeInterpolatedArgument(arg2));
      this._value = this._value.slice(0, start) + str + this._value.slice(start + length);
      return arg2;
    }
  }

  plus(other: unknown): SafeBuffer {
    return this.dup().concat(other);
  }

  repeat(count: number): SafeBuffer {
    return new SafeBuffer(this._value.repeat(count), this._htmlSafe);
  }

  format(args: Record<string, unknown> | unknown): SafeBuffer {
    let result: string;
    if (
      args !== null &&
      typeof args === "object" &&
      !Array.isArray(args) &&
      !(args instanceof SafeBuffer)
    ) {
      const escapedArgs = args as Record<string, unknown>;
      result = this._value.replace(/%\{(\w+)\}/g, (_, key) => {
        if (!Object.hasOwn(escapedArgs, key)) throw new Error(`key{${key}} not found`);
        return String(this.explicitHtmlEscapeInterpolatedArgument(escapedArgs[key]));
      });
    } else {
      const escapedArgs = (Array.isArray(args) ? args : [args]).map((arg) =>
        this.explicitHtmlEscapeInterpolatedArgument(arg),
      );
      let i = 0;
      result = this._value.replace(/%s/g, () => {
        if (i >= escapedArgs.length) throw new Error("too few arguments");
        return String(escapedArgs[i++]);
      });
    }
    return new SafeBuffer(result);
  }

  get htmlSafe(): boolean {
    return this._htmlSafe;
  }

  toS(): this {
    return this;
  }

  toParam(): string {
    return this.toStr();
  }

  toString(): string {
    return this._value;
  }

  toStr(): string {
    return this._value;
  }

  get length(): number {
    return this._value.length;
  }

  /** @noRailsEquivalent PERMANENT */
  valueOf(): string {
    return this._value;
  }

  htmlSafeBuffer(): SafeBuffer {
    return new SafeBuffer(this._value, true);
  }

  /** @missingRailsArgs html_safe? — PERMANENT */
  private explicitHtmlEscapeInterpolatedArgument(arg: unknown): unknown {
    return !this._htmlSafe || isHtmlSafe(arg) ? arg : escapeHTML(String(arg));
  }

  /** @missingRailsArgs html_safe? — PERMANENT */
  private implicitHtmlEscapeInterpolatedArgument(arg: unknown): unknown {
    if (!this._htmlSafe || isHtmlSafe(arg)) {
      return arg;
    } else {
      return escapeHTML(toStr(arg));
    }
  }

  private stringIntoSafeBuffer(newString: string, isHtmlSafe: boolean): SafeBuffer {
    return new SafeBuffer(newString, isHtmlSafe);
  }
}

export function htmlSafe(str: string): SafeBuffer {
  return new SafeBuffer(str, true);
}

export function isHtmlSafe(value: unknown): boolean {
  if (value instanceof SafeBuffer) return value.htmlSafe;
  if (typeof value === "number") return true;
  if (value !== null && typeof value === "object" && "htmlSafe" in value) {
    return (value as { htmlSafe: unknown }).htmlSafe === true;
  }
  return false;
}
