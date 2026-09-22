import { ArgumentError } from "../argument-error.js";
import { IndexError } from "../index-error.js";
import { rbBuiltinClassName } from "../object.js";
import { Range } from "../range.js";
import { regexpEscape } from "../regexp.js";
import { TypeError } from "../type-error.js";

/**
 * The receiver a {@link STRING_METHOD_TABLE} entry runs against. A JS string is
 * immutable, so the destructive entries (`insert`, `[]=`, the bang forms)
 * write the new contents back to `string`, which is what Ruby's in-place
 * `rb_str_update` (`vendor/ruby/string.c:5378`) does to the receiver's bytes.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface StringReceiver {
  string: string;
}

type StringMethod = (self: StringReceiver, ...args: never[]) => unknown;

/**
 * The methods `Init_String` (`vendor/ruby/string.c:12119`) defines on
 * `rb_cString`, keyed by the camelCased Ruby name (`[]=` is `set`, `include?`
 * is `isInclude`, `upcase!` is `upcaseBang`). Every position is a character
 * (code point) offset, as MRI's are for a UTF-8 String. A package that
 * reopens String, as ActiveSupport's `core_ext/string` does, assigns an entry.
 *
 * @noRailsEquivalent PERMANENT
 */
export const STRING_METHOD_TABLE: Record<string, StringMethod> = Object.assign(
  Object.create(null) as Record<string, StringMethod>,
  {
    size: (self: StringReceiver) => strlen(self.string),
    slice: rbStrArefM,
    set: rbStrAsetM,
    insert: rbStrInsert,
    index: rbStrIndexM,
    rindex: rbStrRindexM,
    ljust: (self: StringReceiver, ...args: unknown[]) => rbStrJustify(args, self.string, "l"),
    rjust: (self: StringReceiver, ...args: unknown[]) => rbStrJustify(args, self.string, "r"),
    center: (self: StringReceiver, ...args: unknown[]) => rbStrJustify(args, self.string, "c"),
    lstrip: (self: StringReceiver) => self.string.replace(LSTRIP, ""),
    rstrip: (self: StringReceiver) => self.string.replace(RSTRIP, ""),
    strip: (self: StringReceiver) => self.string.replace(LSTRIP, "").replace(RSTRIP, ""),
    lstripBang: (self: StringReceiver) => bang(self, self.string.replace(LSTRIP, "")),
    rstripBang: (self: StringReceiver) => bang(self, self.string.replace(RSTRIP, "")),
    stripBang: (self: StringReceiver) =>
      bang(self, self.string.replace(LSTRIP, "").replace(RSTRIP, "")),
    ord: rbStrOrd,
    upcase: (self: StringReceiver) => self.string.toUpperCase(),
    downcase: (self: StringReceiver) => self.string.toLowerCase(),
    swapcase: (self: StringReceiver) => swapcase(self.string),
    capitalize: (self: StringReceiver) => capitalize(self.string),
    upcaseBang: (self: StringReceiver) => bang(self, self.string.toUpperCase()),
    downcaseBang: (self: StringReceiver) => bang(self, self.string.toLowerCase()),
    swapcaseBang: (self: StringReceiver) => bang(self, swapcase(self.string)),
    capitalizeBang: (self: StringReceiver) => bang(self, capitalize(self.string)),
    isInclude: (self: StringReceiver, arg: unknown) => self.string.includes(stringValue(arg)),
    matchOperator: (self: StringReceiver, y: unknown) => rbStrMatch(self.string, y),
    gsub: (
      self: StringReceiver,
      pattern: string | RegExp,
      replacement: string | Record<string, string> | ((match: string) => string),
    ) => rbStrGsub(self.string, pattern, replacement),
  },
);

/**
 * `str.__send__(method, *args)` (`vendor/ruby/vm_eval.c:1330` `rb_f_send`) for
 * a JS string: the {@link STRING_METHOD_TABLE} entry when Ruby defines
 * `method`, else the string's own JS member — a method on `String.prototype`
 * is how a JS string is reopened. The receiver's contents after the call come
 * back beside the result, as `sliceBang` returns them.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSend(str: string, method: string, ...args: unknown[]): [unknown, string] {
  const entry = STRING_METHOD_TABLE[method];
  if (entry) {
    const self = { string: str };
    const result = (entry as (self: StringReceiver, ...args: unknown[]) => unknown)(self, ...args);
    return [result, self.string];
  }
  const member = (str as unknown as Record<string, unknown>)[method];
  return [typeof member === "function" ? member.apply(str, args) : member, str];
}

/**
 * `str.respond_to?(method, include_all)` (`vendor/ruby/vm_method.c:2977`
 * `obj_respond_to`) over the names {@link rbStrSend} dispatches. `includeAll`
 * cannot be read; see CLAUDE.md, "Method visibility is not a runtime fact in JS".
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrRespondTo(str: string, method: string, includeAll: boolean = false): boolean {
  void includeAll;
  return method in STRING_METHOD_TABLE || method in Object(str);
}

/**
 * `String#=~` (`vendor/ruby/string.c:4523` `rb_str_match`): the character
 * offset of a Regexp's first match, or nil.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrMatch(x: string, y: unknown): unknown {
  if (typeof y === "string") throw new TypeError("type mismatch: String given");
  if (y instanceof RegExp) {
    const match = rbRegSearch(y, x, 0, false);
    return match ? rbStrSublen(x, match.index) : null;
  }
  return (y as { matchOperator(x: string): unknown }).matchOperator(x);
}

const LSTRIP = /^[\0\t\n\v\f\r ]+/;
const RSTRIP = /[\0\t\n\v\f\r ]+$/;

function strlen(str: string): number {
  return [...str].length;
}

function rbStrSublen(str: string, pos: number): number {
  return strlen(str.slice(0, pos));
}

function strOffset(str: string, pos: number): number {
  return [...str].slice(0, pos).join("").length;
}

function stringValue(val: unknown): string {
  if (typeof val === "string") return val;
  const toStr = (val as { toStr?: unknown } | null)?.toStr;
  if (typeof toStr === "function") return toStr.call(val) as string;
  throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(val)} into String`);
}

function num2long(val: unknown): number {
  if (typeof val === "number") return Math.trunc(val);
  if (val == null) throw new TypeError("no implicit conversion from nil to integer");
  throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(val)} into Integer`);
}

function checkArity(argc: number, min: number, max: number): void {
  if (argc < min || argc > max) {
    throw new ArgumentError(`wrong number of arguments (given ${argc}, expected ${min}..${max})`);
  }
}

function bang(self: StringReceiver, string: string): string | null {
  if (string === self.string) return null;
  self.string = string;
  return string;
}

function rbRegSearch(
  re: RegExp,
  str: string,
  pos: number,
  reverse: boolean,
): RegExpExecArray | null {
  const flags = re.flags.replace(/[gyd]/g, "") + "d";
  if (!reverse) {
    const global = new RegExp(re.source, flags + "g");
    global.lastIndex = strOffset(str, pos);
    return global.exec(str);
  }
  const sticky = new RegExp(re.source, flags + "y");
  for (let start = pos; start >= 0; start--) {
    sticky.lastIndex = strOffset(str, start);
    const match = sticky.exec(str);
    if (match) return match;
  }
  return null;
}

function rbRegBackrefNumber(match: RegExpExecArray, backref: unknown): number {
  if (typeof backref !== "string") return num2long(backref);
  const span = match.indices?.groups?.[backref];
  if (!match.groups || !(backref in match.groups)) {
    throw new IndexError(`undefined group name reference: ${backref}`);
  }
  return match.indices!.findIndex((s) => s === span);
}

/** `rb_range_beg_len` (`vendor/ruby/range.c:1744`), `err` 0 or 2. */
function rbRangeBegLen(range: Range, len: number, err: number): [number, number] | null {
  let beg = range.begin == null ? 0 : num2long(range.begin);
  let end = range.end == null ? -1 : num2long(range.end);
  const excl = range.end == null ? false : range.excludeEnd;
  outOfRange: {
    if (beg < 0) {
      beg += len;
      if (beg < 0) break outOfRange;
    }
    if (end < 0) end += len;
    if (!excl) end++;
    if (beg > len) break outOfRange;
    if (end > len) end = len;
    return [beg, Math.max(end - beg, 0)];
  }
  if (err) throw new RangeError(`${range.toS()} out of range`);
  return null;
}

/** `str_substr` (`vendor/ruby/string.c:2994`) over `rb_str_subpos`. */
function strSubstr(str: string, beg: number, len: number, empty: boolean): string | null {
  const chars = [...str];
  const slen = chars.length;
  if (len < 0) return null;
  if (beg > slen) return null;
  if (beg < 0) {
    beg += slen;
    if (beg < 0) return null;
  }
  if (len > slen - beg) len = slen - beg;
  if (!len && !empty) return null;
  return chars.slice(beg, beg + len).join("");
}

/** `rb_str_subpat` (`vendor/ruby/string.c:5220`). */
function rbStrSubpat(str: string, re: RegExp, backref: unknown): string | null {
  const match = rbRegSearch(re, str, 0, false);
  if (!match) return null;
  return match[rbRegBackrefNumber(match, backref)] ?? null;
}

/** `rb_str_aref` (`vendor/ruby/string.c:5231`). */
function rbStrAref(str: string, indx: unknown): string | null {
  let idx: number;
  if (typeof indx === "number") {
    idx = Math.trunc(indx);
  } else if (indx instanceof RegExp) {
    return rbStrSubpat(str, indx, 0);
  } else if (typeof indx === "string") {
    if (str.includes(indx)) return indx;
    return null;
  } else {
    if (indx instanceof Range) {
      const begLen = rbRangeBegLen(indx, strlen(str), 0);
      if (begLen === null) return null;
      return strSubstr(str, begLen[0], begLen[1], true);
    }
    idx = num2long(indx);
  }
  return strSubstr(str, idx, 1, false);
}

/** `String#[]` / `String#slice` (`vendor/ruby/string.c:5279` `rb_str_aref_m`). */
function rbStrArefM(self: StringReceiver, ...args: unknown[]): string | null {
  if (args.length === 2) {
    if (args[0] instanceof RegExp) {
      return rbStrSubpat(self.string, args[0], args[1]);
    } else {
      const beg = num2long(args[0]);
      const len = num2long(args[1]);
      return strSubstr(self.string, beg, len, true);
    }
  }
  checkArity(args.length, 1, 2);
  return rbStrAref(self.string, args[0]);
}

/** `rb_str_update` (`vendor/ruby/string.c:5378`), in character offsets. */
function rbStrUpdate(self: StringReceiver, beg: number, len: number, val: unknown): void {
  if (len < 0) throw new IndexError(`negative length ${len}`);
  const str2 = stringValue(val);
  const chars = [...self.string];
  const slen = chars.length;
  if (slen < beg || (beg < 0 && beg + slen < 0)) {
    throw new IndexError(`index ${beg} out of string`);
  }
  if (beg < 0) beg += slen;
  if (len > slen - beg) len = slen - beg;
  chars.splice(beg, len, str2);
  self.string = chars.join("");
}

/** `rb_str_subpat_set` (`vendor/ruby/string.c:5418`). */
function rbStrSubpatSet(self: StringReceiver, re: RegExp, backref: unknown, val: unknown): void {
  const match = rbRegSearch(re, self.string, 0, false);
  if (!match) throw new IndexError("regexp not matched");
  let nth = rbRegBackrefNumber(match, backref);
  const numRegs = match.length;
  if (nth >= numRegs || (nth < 0 && -nth >= numRegs)) {
    throw new IndexError(`index ${nth} out of regexp`);
  }
  if (nth < 0) nth += numRegs;
  const span = match.indices![nth];
  if (span === undefined) throw new IndexError(`regexp group ${nth} not matched`);
  const [start, end] = span;
  const str2 = stringValue(val);
  self.string = self.string.slice(0, start) + str2 + self.string.slice(end);
}

/** `rb_str_aset` (`vendor/ruby/string.c:5443`). */
function rbStrAset(self: StringReceiver, indx: unknown, val: unknown): unknown {
  if (indx instanceof RegExp) {
    rbStrSubpatSet(self, indx, 0, val);
    return val;
  }
  if (typeof indx === "string") {
    const beg = self.string.indexOf(indx);
    if (beg < 0) throw new IndexError("string not matched");
    rbStrUpdate(self, rbStrSublen(self.string, beg), strlen(indx), val);
    return val;
  }
  if (indx instanceof Range) {
    const [beg, len] = rbRangeBegLen(indx, strlen(self.string), 2)!;
    rbStrUpdate(self, beg, len, val);
    return val;
  }
  rbStrUpdate(self, num2long(indx), 1, val);
  return val;
}

/** `String#[]=` (`vendor/ruby/string.c:5516` `rb_str_aset_m`). */
function rbStrAsetM(self: StringReceiver, ...args: unknown[]): unknown {
  if (args.length === 3) {
    if (args[0] instanceof RegExp) {
      rbStrSubpatSet(self, args[0], args[1], args[2]);
    } else {
      rbStrUpdate(self, num2long(args[0]), num2long(args[1]), args[2]);
    }
    return args[2];
  }
  checkArity(args.length, 2, 3);
  return rbStrAset(self, args[0], args[1]);
}

/** `String#insert` (`vendor/ruby/string.c:5550` `rb_str_insert`). */
function rbStrInsert(self: StringReceiver, idx: unknown, str2: unknown): string {
  let pos = num2long(idx);
  if (pos === -1) {
    self.string += stringValue(str2);
    return self.string;
  } else if (pos < 0) {
    pos++;
  }
  rbStrUpdate(self, pos, 0, str2);
  return self.string;
}

/** `String#index` (`vendor/ruby/string.c:4034` `rb_str_index_m`). */
function rbStrIndexM(self: StringReceiver, ...args: unknown[]): number | null {
  checkArity(args.length, 1, 2);
  const str = self.string;
  const [sub, initpos] = args;
  let pos: number;
  if (args.length === 2) {
    const slen = strlen(str);
    pos = num2long(initpos);
    if (pos < 0 ? (pos += slen) < 0 : pos > slen) return null;
  } else {
    pos = 0;
  }
  if (sub instanceof RegExp) {
    const match = rbRegSearch(sub, str, pos, false);
    if (match) return rbStrSublen(str, match.index);
  } else {
    const found = str.indexOf(stringValue(sub), strOffset(str, pos));
    if (found >= 0) return rbStrSublen(str, found);
  }
  return null;
}

/** `String#rindex` (`vendor/ruby/string.c:4320` `rb_str_rindex_m`). */
function rbStrRindexM(self: StringReceiver, ...args: unknown[]): number | null {
  checkArity(args.length, 1, 2);
  const str = self.string;
  const [sub, initpos] = args;
  const len = strlen(str);
  let pos: number;
  if (args.length === 2) {
    pos = num2long(initpos);
    if (pos < 0 && (pos += len) < 0) return null;
    if (pos > len) pos = len;
  } else {
    pos = len;
  }
  if (sub instanceof RegExp) {
    const match = rbRegSearch(sub, str, pos, true);
    if (match) return rbStrSublen(str, match.index);
  } else {
    const found = str.lastIndexOf(stringValue(sub), strOffset(str, pos));
    if (found >= 0) return rbStrSublen(str, found);
  }
  return null;
}

/** `ljust` / `rjust` / `center` (`vendor/ruby/string.c:10424` `rb_str_justify`). */
function rbStrJustify(argv: unknown[], str: string, jflag: "l" | "r" | "c"): string {
  checkArity(argv.length, 1, 2);
  const width = num2long(argv[0]);
  let f = [" "];
  if (argv.length === 2) {
    f = [...stringValue(argv[1])];
    if (f.length === 0) throw new ArgumentError("zero width padding");
  }
  const len = strlen(str);
  if (width < 0 || len >= width) return str;
  const n = width - len;
  const llen = jflag === "l" ? 0 : jflag === "r" ? n : Math.floor(n / 2);
  const rlen = n - llen;
  const fill = (count: number) => Array.from({ length: count }, (_, i) => f[i % f.length]).join("");
  return fill(llen) + str + fill(rlen);
}

/** `String#ord` (`vendor/ruby/string.c:10355` `rb_str_ord`). */
function rbStrOrd(self: StringReceiver): number {
  if (self.string.length === 0) throw new ArgumentError("empty string");
  return self.string.codePointAt(0)!;
}

/** `rb_str_swapcase` (`vendor/ruby/string.c:7838`), per character. */
function swapcase(str: string): string {
  return Array.from(str, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(
    "",
  );
}

/**
 * `rb_str_capitalize` (`vendor/ruby/string.c:7760`). MRI titlecases the first
 * character; JS has no titlecase mapping, so a digraph such as `ǆ` upcases to
 * `Ǆ` where MRI answers `ǅ`.
 */
function capitalize(str: string): string {
  const [first = "", ...rest] = str;
  return first.toUpperCase() + rest.join("").toLowerCase();
}

function rbStrGsub(
  str: string,
  pattern: string | RegExp,
  replacement: string | Record<string, string> | ((match: string) => string),
): string {
  const re =
    typeof pattern === "string"
      ? new RegExp(regexpEscape(pattern), "g")
      : new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, "") + "g");
  return str.replace(re, (...m: unknown[]) => {
    const hasGroups = typeof m[m.length - 1] === "object";
    const groups = (hasGroups ? m[m.length - 1] : undefined) as Record<string, string> | undefined;
    const offset = m[m.length - (hasGroups ? 3 : 2)] as number;
    const captures = m.slice(0, m.length - (hasGroups ? 3 : 2)) as (string | undefined)[];
    const matched = captures[0]!;
    if (typeof replacement === "function") return replacement(matched);
    if (typeof replacement !== "string") return String(replacement[matched] ?? "");
    return replacement.replace(/\\(\d|&|`|'|\\|k<(\w+)>)/g, (_, token: string, name?: string) => {
      if (name !== undefined) return groups?.[name] ?? "";
      if (token === "&") return matched;
      if (token === "`") return str.slice(0, offset);
      if (token === "'") return str.slice(offset + matched.length);
      if (token === "\\") return "\\";
      return captures[Number(token)] ?? "";
    });
  });
}
