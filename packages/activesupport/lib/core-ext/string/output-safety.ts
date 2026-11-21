import {
  camelized,
  IndexError,
  NoMethodError,
  Range,
  rbBlockGivenP,
  toEnum,
  type Enumerator,
  rbObjClassname,
  rbStrRespondTo,
  rbStrSend,
  rbStrSub,
  rbStrSubBang,
  strGsub,
  stringSuperclass,
} from "@blazetrails/ruby-compat";

class Object {
  static isHtmlSafe(_self: unknown): false {
    return false;
  }
}

class Numeric {
  static isHtmlSafe(_self: number | bigint): true {
    return true;
  }
}

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
  throw new NoMethodError(`undefined method 'to_str' for an instance of ${rbObjClassname(arg)}`);
}

function concatArgument(arg: unknown): string {
  return typeof arg === "number" ? String.fromCodePoint(arg) : toStr(arg);
}

type ArefArgs =
  | [index: number]
  | [start: number, length: number]
  | [range: Range<number>]
  | [regexp: RegExp, capture?: number | string]
  | [match: string];

function strAref(str: string, args: ArefArgs): string | null {
  const [first, second] = args;
  if (first instanceof RegExp) {
    const match = new RegExp(first.source, first.flags.replace(/[gy]/g, "")).exec(str);
    if (!match) return null;
    if (typeof second === "string") return match.groups?.[second] ?? null;
    return match.at(second ?? 0) ?? null;
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
  if (start < 0 || start > str.length || (second as number) < 0) return null;
  return str.slice(start, start + (second as number));
}

function nameToBackrefNumber(re: RegExp, name: string): number {
  const src = re.source;
  let num = 0;
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      i++;
    } else if (inClass) {
      if (c === "]") inClass = false;
    } else if (c === "[") {
      inClass = true;
    } else if (c === "(") {
      if (src[i + 1] !== "?") {
        num++;
      } else if (src[i + 2] === "<" && src[i + 3] !== "=" && src[i + 3] !== "!") {
        num++;
        if (src.startsWith(`${name}>`, i + 3)) return num;
      }
    }
  }
  return 0;
}

function strRange(str: string, args: ArefArgs): [number, number] {
  const [first, second] = args;
  if (first instanceof RegExp) {
    const match = new RegExp(first.source, first.flags.replace(/[gyd]/g, "") + "d").exec(str);
    if (match === null) throw new IndexError("regexp not matched");
    const regs = match.indices!;
    let nth: number;
    if (typeof second === "string") {
      if (regs.groups === undefined || !globalThis.Object.hasOwn(regs.groups, second)) {
        throw new IndexError(`undefined group name reference: ${second}`);
      }
      nth = nameToBackrefNumber(first, second);
    } else {
      nth = second ?? 0;
    }
    if (nth >= regs.length || (nth < 0 && -nth >= regs.length)) {
      throw new IndexError(`index ${nth} out of regexp`);
    }
    if (nth < 0) {
      nth += regs.length;
    }

    const range = regs[nth];
    if (range === undefined) throw new IndexError(`regexp group ${nth} not matched`);
    const [start, end] = range;
    const len = end - start;
    return [start, len];
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
  return [start, second === undefined ? 1 : (second as number)];
}

type BlockFn = (...params: unknown[]) => unknown;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SafeBuffer extends stringSuperclass("eql", "hash", "isBlank", "asJson") {
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
    super(str);
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

  /** @internal */
  private originalConcat(value: unknown): this {
    this._value += concatArgument(value);
    return this;
  }

  safeConcat(value: unknown): this {
    if (!this._htmlSafe) throw new SafeConcatError();
    return this.originalConcat(value);
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
    let value = args.pop();
    value = toStr(this.implicitHtmlEscapeInterpolatedArgument(value));
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

  set(arg1: number | Range<number> | RegExp | string, arg2: unknown, arg3?: unknown): unknown {
    if (arg3 !== undefined) {
      const [start, length] = strRange(this._value, [arg1, arg2] as ArefArgs);
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
        if (!globalThis.Object.hasOwn(escapedArgs, key)) throw new Error(`key{${key}} not found`);
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

  encodeWith(coder: { representObject(tag: string | null, obj: unknown): void }): void {
    coder.representObject(null, this.toStr());
  }

  /** @missingRailsArgs set_block_back_references — PERMANENT */
  gsub(...args: [...unknown[], BlockFn] | unknown[]): string | Generator<string> {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as BlockFn) : null;
    if (block) {
      return strGsub(
        { string: this.toStr() },
        [
          ...args,
          (...params: unknown[]) => {
            this.setBlockBackReferences(block, null);
            return block(...params);
          },
        ],
        false,
      )!;
    } else {
      return strGsub({ string: this.toStr() }, args, false)!;
    }
  }

  gsubBang(pattern: unknown): Enumerator<string>;
  gsubBang(pattern: unknown, replacement: unknown): this | null;
  /** @missingRailsArgs set_block_back_references — PERMANENT */
  gsubBang(...args: [...unknown[], BlockFn] | unknown[]): this | null | Enumerator<string> {
    this._htmlSafe = false;
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as BlockFn) : null;
    if (!block && args.length === 1) return toEnum(this, "gsubBang", ...args);
    const self = { string: this._value };
    const result = block
      ? strGsub(
          self,
          [
            ...args,
            (...params: unknown[]) => {
              this.setBlockBackReferences(block, null);
              return block(...params);
            },
          ],
          true,
        )
      : strGsub(self, args, true);
    this._value = self.string;
    return result == null ? null : this;
  }

  /** @missingRailsArgs set_block_back_references — PERMANENT */
  sub(...args: [...unknown[], BlockFn] | unknown[]): string {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as BlockFn) : null;
    if (block) {
      return rbStrSub({ string: this.toStr() }, ...args, (...params: unknown[]) => {
        this.setBlockBackReferences(block, null);
        return block(...params);
      });
    } else {
      return rbStrSub({ string: this.toStr() }, ...args);
    }
  }

  /** @missingRailsArgs set_block_back_references — PERMANENT */
  subBang(...args: [...unknown[], BlockFn] | unknown[]): this | null {
    this._htmlSafe = false;
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as BlockFn) : null;
    const self = { string: this._value };
    const result = block
      ? rbStrSubBang(self, ...args, (...params: unknown[]) => {
          this.setBlockBackReferences(block, null);
          return block(...params);
        })
      : rbStrSubBang(self, ...args);
    this._value = self.string;
    return result == null ? null : this;
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

  /**
   * @internal
   * @missingRailsCall eval — PERMANENT
   */
  private setBlockBackReferences(_block: BlockFn, _matchData: unknown): void {}

  private stringIntoSafeBuffer(newString: string, isHtmlSafe: boolean): SafeBuffer {
    return new SafeBuffer(newString, isHtmlSafe);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SafeBuffer {
  capitalize(...args: unknown[]): string;
  capitalizeBang(...args: unknown[]): this | null;
  chomp(...args: unknown[]): string;
  chompBang(...args: unknown[]): this | null;
  chop(...args: unknown[]): string;
  chopBang(...args: unknown[]): this | null;
  delete(...args: unknown[]): string;
  deleteBang(...args: unknown[]): this | null;
  deletePrefix(...args: unknown[]): string;
  deletePrefixBang(...args: unknown[]): this | null;
  deleteSuffix(...args: unknown[]): string;
  deleteSuffixBang(...args: unknown[]): this | null;
  downcase(...args: unknown[]): string;
  downcaseBang(...args: unknown[]): this | null;
  lstrip(...args: unknown[]): string;
  lstripBang(...args: unknown[]): this | null;
  next(...args: unknown[]): string;
  nextBang(...args: unknown[]): this | null;
  reverse(...args: unknown[]): string;
  reverseBang(...args: unknown[]): this | null;
  rstrip(...args: unknown[]): string;
  rstripBang(...args: unknown[]): this | null;
  scrub(...args: unknown[]): string;
  scrubBang(...args: unknown[]): this | null;
  squeeze(...args: unknown[]): string;
  squeezeBang(...args: unknown[]): this | null;
  strip(...args: unknown[]): string;
  stripBang(...args: unknown[]): this | null;
  succ(...args: unknown[]): string;
  succBang(...args: unknown[]): this | null;
  swapcase(...args: unknown[]): string;
  swapcaseBang(...args: unknown[]): this | null;
  tr(...args: unknown[]): string;
  trBang(...args: unknown[]): this | null;
  trS(...args: unknown[]): string;
  trSBang(...args: unknown[]): this | null;
  unicodeNormalize(...args: unknown[]): string;
  unicodeNormalizeBang(...args: unknown[]): this | null;
  upcase(...args: unknown[]): string;
  upcaseBang(...args: unknown[]): this | null;
}

for (const unsafeMethod of SafeBuffer.UNSAFE_STRING_METHODS) {
  const name = camelized(unsafeMethod);
  if (rbStrRespondTo(unsafeMethod, name)) {
    globalThis.Object.defineProperties(SafeBuffer.prototype, {
      [name]: {
        value(this: SafeBuffer, ...args: unknown[]): unknown {
          return rbStrSend(this.toStr(), name, ...args)[0];
        },
        writable: true,
        configurable: true,
      },
      [`${name}Bang`]: {
        value(this: { _htmlSafe: boolean; _value: string }, ...args: unknown[]): unknown {
          this._htmlSafe = false;
          const [result, string] = rbStrSend(this._value, `${name}Bang`, ...args);
          this._value = string;
          return result == null ? null : this;
        },
        writable: true,
        configurable: true,
      },
    });
  }
}

export function htmlSafe(str: string): SafeBuffer {
  return new SafeBuffer(str, true);
}

export function isHtmlSafe(self: unknown): boolean {
  if (self instanceof SafeBuffer) return self.htmlSafe;
  if (typeof self === "number" || typeof self === "bigint") return Numeric.isHtmlSafe(self);
  if (self !== null && typeof self === "object" && "htmlSafe" in self) {
    return (self as { htmlSafe: unknown }).htmlSafe === true;
  }
  return Object.isHtmlSafe(self);
}
