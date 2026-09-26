import { ArgumentError } from "../argument-error.js";
import { cmp } from "../comparable.js";
import { Encoding } from "../encoding.js";
import { IndexError } from "../index-error.js";
import { format } from "../kernel-format.js";
import { NoMethodError } from "../no-method-error.js";
import { Range } from "../range.js";
import { rbEqual } from "../rb-equal.js";
import { rbHash } from "../rb-hash.js";
import { TypeError } from "../type-error.js";
import { EACH_METHODS, rbStrUpto } from "./each.js";
import {
  rbStrByteindexM,
  rbStrByterindexM,
  rbStrBytesplice,
  rbStrByteslice,
} from "./byte-methods.js";
import { rbStrGetbyte, rbStrSetbyte, rbStrSum } from "./byte-methods.js";
import { bytes } from "./bytes.js";
import { capitalize, casecmp, downcase, isCasecmp, swapcase, upcase } from "./case-mapping.js";
import { chomp } from "./chomp.js";
import { rbStrDump, rbStrHex, rbStrOct, rbStrToF, rbStrToI, strUndump } from "./convert.js";
import { stringInspect } from "./inspect.js";
import { scrub } from "./scrub.js";
import { sliceBang } from "./slice.js";
import { stringSplit } from "./split.js";
import {
  rbStrMatchM,
  rbStrMatchMP,
  rbStrPartition,
  rbStrRpartition,
  rbStrScan,
  rbStrStartWith,
  rbStrEndWith,
  rbStrSub,
  rbStrSubBang,
  strGsub,
} from "./sub.js";
import { succ } from "./succ.js";
import {
  bang,
  blockArg,
  checkArity,
  num2long,
  rbCheckStringType,
  rbErrorArity,
  rbRangeBegLen,
  rbRegBackrefNumber,
  rbRegSearch,
  rbStrCmp,
  rbStrSublen,
  strlen,
  strOffset,
  stringValue,
  type StringReceiver,
} from "./support.js";
import { strCount, strDelete, strSqueeze, trTrans } from "./tr.js";

export type { StringReceiver } from "./support.js";

type StringMethod = (self: StringReceiver, ...args: never[]) => unknown;
type Method = (self: StringReceiver, ...args: unknown[]) => unknown;

/**
 * The public methods `Init_String` (`vendor/ruby/string.c:12119`) defines on
 * `rb_cString`, keyed by the camelCased Ruby name: an operator by the
 * spelling trails gives it elsewhere (`<=>` `compareTo`, `==` `equals`, `===`
 * `caseEquals`, `+` `plus`, `*` `multiply`, `%` `format`, `[]` `get`, `[]=`
 * `set`, `=~` `matchOperator`, `<<` `append`, `+@` `uplus`, `-@` `uminus`), a
 * predicate as `isX`, a bang form as `xBang`. Every position is a character
 * (code point) offset, as MRI's are for a UTF-8 String; a block is a trailing
 * function argument. A package that reopens String, as ActiveSupport's
 * `core_ext/string` does, assigns an entry. `length` counts characters, as
 * `size` does; a proxy forwarding to String reads it as a property, where the
 * JS string's own `length` is.
 *
 * Not in the table, because a JS string cannot carry what they read or
 * write: `force_encoding` and `b` retag the receiver's bytes, and a JS string
 * has no encoding tag (it is always the UTF-8 `encoding` answers); `crypt`
 * is the platform's `crypt(3)`; `initialize` and `initialize_copy` are
 * private.
 *
 * @noRailsEquivalent PERMANENT
 */
export const STRING_METHOD_TABLE: Record<string, StringMethod> = Object.assign(
  Object.create(null),
  {
    compareTo: rbDefineMethod(1, (self, other) => rbStrCmpM(self.string, other)),
    equals: rbDefineMethod(1, (self, other) => rbStrEqual(self.string, other)),
    caseEquals: rbDefineMethod(1, (self, other) => rbStrEqual(self.string, other)),
    eql: rbDefineMethod(1, (self, other) => typeof other === "string" && self.string === other),
    hash: rbDefineMethod(0, (self) => rbHash(self.string)),
    casecmp: rbDefineMethod(1, (self, other) => casecmp(self.string, other)),
    isCasecmp: rbDefineMethod(1, (self, other) => isCasecmp(self.string, other)),
    plus: rbDefineMethod(1, (self, str2) => self.string + stringValue(str2)),
    multiply: rbDefineMethod(1, (self, times) => rbStrTimes(self.string, times)),
    format: rbDefineMethod(1, (self, arg) =>
      Array.isArray(arg) ? format(self.string, ...arg) : format(self.string, arg),
    ),
    get: rbStrArefM,
    set: rbStrAsetM,
    insert: rbDefineMethod(2, rbStrInsert),
    length: rbDefineMethod(0, (self) => strlen(self.string)),
    size: rbDefineMethod(0, (self) => strlen(self.string)),
    bytesize: rbDefineMethod(0, (self) => bytes(self.string).length),
    isEmpty: rbDefineMethod(0, (self) => self.string.length === 0),
    matchOperator: rbDefineMethod(1, (self, y) => rbStrMatch(self.string, y)),
    match: rbStrMatchM,
    isMatch: rbStrMatchMP,
    succ: rbDefineMethod(0, (self) => succ(self.string)),
    succBang: rbDefineMethod(0, (self) => (self.string = succ(self.string))),
    next: rbDefineMethod(0, (self) => succ(self.string)),
    nextBang: rbDefineMethod(0, (self) => (self.string = succ(self.string))),
    upto: rbStrUpto,
    index: rbStrIndexM,
    byteindex: (self, ...args) => rbStrByteindexM(self.string, ...args),
    rindex: rbStrRindexM,
    byterindex: (self, ...args) => rbStrByterindexM(self.string, ...args),
    replace: rbDefineMethod(1, (self, str2) => (self.string = stringValue(str2))),
    clear: rbDefineMethod(0, (self) => (self.string = "")),
    chr: rbDefineMethod(0, (self) => [...self.string].slice(0, 1).join("")),
    getbyte: rbDefineMethod(1, (self, index) => rbStrGetbyte(self.string, index)),
    setbyte: rbDefineMethod(2, rbStrSetbyte),
    byteslice: (self, ...args) => rbStrByteslice(self.string, ...args),
    bytesplice: rbStrBytesplice,
    scrub: (self, ...argv) => strScrub(self.string, argv),
    scrubBang: (self, ...argv) => (self.string = strScrub(self.string, argv)),
    freeze: rbDefineMethod(0, (self) => self.string),
    uplus: rbDefineMethod(0, (self) => self.string),
    uminus: rbDefineMethod(0, (self) => self.string),
    dup: rbDefineMethod(0, (self) => self.string),
    toI: (self, ...args) => rbStrToI(self.string, ...args),
    toF: rbDefineMethod(0, (self) => rbStrToF(self.string)),
    toS: rbDefineMethod(0, (self) => self.string),
    toStr: rbDefineMethod(0, (self) => self.string),
    inspect: rbDefineMethod(0, (self) => stringInspect(self.string)),
    dump: rbDefineMethod(0, (self) => rbStrDump(self.string)),
    undump: rbDefineMethod(0, (self) => strUndump(self.string)),
    upcase: (self, ...args) => upcase(self.string, args),
    downcase: (self, ...args) => downcase(self.string, args),
    capitalize: (self, ...args) => capitalize(self.string, args),
    swapcase: (self, ...args) => swapcase(self.string, args),
    upcaseBang: (self, ...args) => bang(self, upcase(self.string, args)),
    downcaseBang: (self, ...args) => bang(self, downcase(self.string, args)),
    capitalizeBang: (self, ...args) => bang(self, capitalize(self.string, args)),
    swapcaseBang: (self, ...args) => bang(self, swapcase(self.string, args)),
    hex: rbDefineMethod(0, (self) => rbStrHex(self.string)),
    oct: rbDefineMethod(0, (self) => rbStrOct(self.string)),
    split: rbStrSplitM,
    ...EACH_METHODS,
    reverse: rbDefineMethod(0, (self) => [...self.string].reverse().join("")),
    reverseBang: rbDefineMethod(0, (self) => (self.string = [...self.string].reverse().join(""))),
    concat: rbStrConcatMulti,
    append: rbDefineMethod(1, (self, str2) => (self.string = rbStrConcat(self.string, str2))),
    prepend: (self, ...args) => (self.string = args.map(stringValue).join("") + self.string),
    intern: rbDefineMethod(0, (self) => `:${self.string}`),
    toSym: rbDefineMethod(0, (self) => `:${self.string}`),
    ord: rbDefineMethod(0, rbStrOrd),
    isInclude: rbDefineMethod(1, (self, arg) => self.string.includes(stringValue(arg))),
    isStartWith: (self, ...prefixes) => rbStrStartWith(self.string, ...prefixes),
    isEndWith: (self, ...suffixes) => rbStrEndWith(self.string, ...suffixes),
    scan: rbStrScan,
    ljust: (self, ...args) => rbStrJustify(args, self.string, "l"),
    rjust: (self, ...args) => rbStrJustify(args, self.string, "r"),
    center: (self, ...args) => rbStrJustify(args, self.string, "c"),
    sub: rbStrSub,
    gsub: (self, ...argv) => strGsub(self, argv, false),
    chop: rbDefineMethod(0, (self) => rbStrChop(self.string)),
    chomp: (self, ...args) => rbStrChomp(self.string, args),
    strip: rbDefineMethod(0, (self) => self.string.replace(LSTRIP, "").replace(RSTRIP, "")),
    lstrip: rbDefineMethod(0, (self) => self.string.replace(LSTRIP, "")),
    rstrip: rbDefineMethod(0, (self) => self.string.replace(RSTRIP, "")),
    deletePrefix: rbDefineMethod(1, (self, prefix) => deletePrefix(self.string, prefix)),
    deleteSuffix: rbDefineMethod(1, (self, suffix) => deleteSuffix(self.string, suffix)),
    subBang: rbStrSubBang,
    gsubBang: (self, ...argv) => strGsub(self, argv, true),
    chopBang: rbDefineMethod(0, (self) =>
      self.string.length === 0 ? null : (self.string = rbStrChop(self.string)),
    ),
    chompBang: (self, ...args) => bang(self, rbStrChomp(self.string, args)),
    stripBang: rbDefineMethod(0, (self) =>
      bang(self, self.string.replace(LSTRIP, "").replace(RSTRIP, "")),
    ),
    lstripBang: rbDefineMethod(0, (self) => bang(self, self.string.replace(LSTRIP, ""))),
    rstripBang: rbDefineMethod(0, (self) => bang(self, self.string.replace(RSTRIP, ""))),
    deletePrefixBang: rbDefineMethod(1, (self, p) => bang(self, deletePrefix(self.string, p))),
    deleteSuffixBang: rbDefineMethod(1, (self, s) => bang(self, deleteSuffix(self.string, s))),
    tr: rbDefineMethod(2, (self, src, repl) => trTrans(self.string, src, repl, false)),
    trS: rbDefineMethod(2, (self, src, repl) => trTrans(self.string, src, repl, true)),
    delete: (self, ...args) => strDelete(self.string, args),
    squeeze: (self, ...args) => strSqueeze(self.string, args),
    count: (self, ...args) => strCount(self.string, args),
    trBang: rbDefineMethod(2, (self, src, repl) =>
      bang(self, trTrans(self.string, src, repl, false)),
    ),
    trSBang: rbDefineMethod(2, (self, src, repl) =>
      bang(self, trTrans(self.string, src, repl, true)),
    ),
    deleteBang: (self, ...args) => bang(self, strDelete(self.string, args)),
    squeezeBang: (self, ...args) => bang(self, strSqueeze(self.string, args)),
    sum: (self, ...args) => rbStrSum(self.string, ...args),
    slice: rbStrArefM,
    sliceBang: rbStrSliceBang,
    partition: rbDefineMethod(1, (self, sep) => rbStrPartition(self.string, sep)),
    rpartition: rbDefineMethod(1, (self, sep) => rbStrRpartition(self.string, sep)),
    encoding: rbDefineMethod(0, () => Encoding.UTF_8),
    isValidEncoding: rbDefineMethod(0, (self) => !LONE_SURROGATE.test(self.string)),
    // eslint-disable-next-line no-control-regex -- `rb_str_is_ascii_only_p` (string.c:11019)
    isAsciiOnly: rbDefineMethod(0, (self) => /^[\x00-\x7f]*$/.test(self.string)),
    unicodeNormalize: (self, ...args) => unicodeNormalize(self.string, args),
    unicodeNormalizeBang: (self, ...args) => (self.string = unicodeNormalize(self.string, args)),
    isUnicodeNormalized: (self, ...args) => unicodeNormalize(self.string, args) === self.string,
  } satisfies Record<string, Method>,
);

const JS_STRING_METHODS = new Set(Object.getOwnPropertyNames(String.prototype));

/**
 * `str.__send__(method, *args)` (`vendor/ruby/vm_eval.c:1330` `rb_f_send`): the
 * {@link STRING_METHOD_TABLE} entry, else a member String is reopened with, else
 * `NoMethodError`. The receiver's contents after the call come back beside the
 * result.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSend(str: string, method: string, ...args: unknown[]): [unknown, string] {
  const entry = STRING_METHOD_TABLE[method];
  if (entry) {
    const self = { string: str };
    const result = (entry as Method)(self, ...args);
    return [result, self.string];
  }
  if (!rbStrRespondTo(str, method)) {
    throw new NoMethodError(`undefined method '${method}' for an instance of String`);
  }
  const member = (str as unknown as Record<string, unknown>)[method];
  return [typeof member === "function" ? member.apply(str, args) : member, str];
}

/**
 * `str.respond_to?` (`vendor/ruby/vm_method.c:2977` `obj_respond_to`) over
 * {@link rbStrSend}'s names: JS's own `String.prototype` members are not
 * Ruby's. See CLAUDE.md, "Method visibility is a side table".
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrRespondTo(str: string, method: string, includeAll: boolean = false): boolean {
  void includeAll;
  if (method in STRING_METHOD_TABLE) return true;
  return (
    Object.hasOwn(Object.getPrototypeOf(Object(str)), method) && !JS_STRING_METHODS.has(method)
  );
}

/**
 * `String#=~` (`vendor/ruby/string.c:4523` `rb_str_match`): a match's character
 * offset. This is Ruby core's String method, which Rails' `Chars#=~` delegates
 * to (`activesupport/lib/active_support/multibyte/chars.rb:53`, ported as
 * `Chars#matchOperator`); ruby-compat's package contract receipts every export,
 * since no Rails file defines a Ruby core method.
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

/**
 * `rb_define_method` (`vendor/ruby/class.c:2134`) with a fixed `argc`, which MRI
 * checks.
 */
function rbDefineMethod<A extends unknown[]>(
  argc: number,
  func: (self: StringReceiver, ...args: A) => unknown,
): Method {
  return (self, ...args) => {
    if (args.length !== argc) rbErrorArity(args.length, argc, argc);
    return func(self, ...(args as A));
  };
}

const LSTRIP = /^[\0\t\n\v\f\r ]+/;
const RSTRIP = /[\0\t\n\v\f\r ]+$/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** `String#<=>` (`vendor/ruby/string.c:3803` `rb_str_cmp_m`, `rb_invcmp` at `vendor/ruby/compar.c:50`). */
function rbStrCmpM(str1: string, str2: unknown): number | null {
  const s = rbCheckStringType(str2);
  if (s === null) {
    const invcmp = cmp(str2, str1);
    return invcmp === null ? null : -Math.sign(invcmp);
  }
  return rbStrCmp(str1, s);
}

/** `String#==` (`vendor/ruby/string.c:3742` `rb_str_equal`). */
function rbStrEqual(str1: string, str2: unknown): boolean {
  if (typeof str2 !== "string") {
    if (typeof (str2 as { toStr?: unknown } | null)?.toStr !== "function") return false;
    return rbEqual(str2, str1);
  }
  return str1 === str2;
}

/** `String#*` (`vendor/ruby/string.c:2331` `rb_str_times`). */
function rbStrTimes(str: string, times: unknown): string {
  const len = num2long(times);
  if (len < 0) throw new ArgumentError("negative argument");
  if (str.length * len > 2 ** 29) throw new ArgumentError("argument too big");
  return str.repeat(len);
}

/** `String#chomp` (`vendor/ruby/string.c:9786` `rb_str_chomp`, `chomp_rs` at `:9728`). */
function rbStrChomp(str: string, argv: unknown[]): string {
  if (argv.length === 0) return chomp(str);
  checkArity(argv.length, 0, 1);
  if (argv[0] == null) return str;
  return chomp(str, stringValue(argv[0]));
}

/** `String#chop` (`vendor/ruby/string.c:9613` `rb_str_chop`): a trailing `"\r\n"` as one. */
function rbStrChop(str: string): string {
  if (str.endsWith("\r\n")) return str.slice(0, -2);
  return [...str].slice(0, -1).join("");
}

/** `String#delete_prefix` (`vendor/ruby/string.c:10795` `rb_str_delete_prefix`). */
function deletePrefix(str: string, prefix: unknown): string {
  const p = stringValue(prefix);
  return str.startsWith(p) ? str.slice(p.length) : str;
}

/** `String#delete_suffix` (`vendor/ruby/string.c:10878` `rb_str_delete_suffix`). */
function deleteSuffix(str: string, suffix: unknown): string {
  const s = stringValue(suffix);
  return s.length && str.endsWith(s) ? str.slice(0, -s.length) : str;
}

/** `String#<<` (`vendor/ruby/string.c:3511` `rb_str_concat`): an Integer is a code point. */
function rbStrConcat(str1: string, str2: unknown): string {
  if (typeof str2 === "number" || typeof str2 === "bigint") {
    const code = Number(str2);
    if (code < 0 || code > 0xffffffff) throw new RangeError(`${str2} out of char range`);
    if (code > 0x10ffff) throw new RangeError(`${code} out of char range`);
    if (code >= 0xd800 && code <= 0xdfff) {
      throw new RangeError(`invalid codepoint 0x${code.toString(16).toUpperCase()} in UTF-8`);
    }
    return str1 + String.fromCodePoint(code);
  }
  return str1 + stringValue(str2);
}

/** `String#concat` (`vendor/ruby/string.c:3472` `rb_str_concat_multi`). */
function rbStrConcatMulti(self: StringReceiver, ...args: unknown[]): string {
  self.string += args.reduce<string>((arg, value) => rbStrConcat(arg, value), "");
  return self.string;
}

/** `String#split` (`vendor/ruby/string.c:8757` `rb_str_split_m`): with a block, each field yielded. */
function rbStrSplitM(self: StringReceiver, ...argv: unknown[]): unknown {
  const [args, block] = blockArg(argv);
  checkArity(args.length, 0, 2);
  const fields = stringSplit(self.string, ...(args as [string | RegExp | null, number]));
  if (!block) return fields;
  fields.forEach((field) => block(field));
  return self.string;
}

/** `String#slice!` (`vendor/ruby/string.c:5588` `rb_str_slice_bang`). */
function rbStrSliceBang(self: StringReceiver, ...args: unknown[]): string | null {
  checkArity(args.length, 1, 2);
  const [sliced, rest] = sliceBang(
    self.string,
    ...(args as Parameters<typeof sliceBang> extends [string, ...infer A] ? A : never),
  );
  self.string = rest;
  return sliced;
}

/** `String#scrub` (`vendor/ruby/string.c:11354` `str_scrub`). */
function strScrub(str: string, argv: unknown[]): string {
  const [args, block] = blockArg(argv);
  checkArity(args.length, 0, 1);
  const repl = args.length && args[0] != null ? stringValue(args[0]) : null;
  return scrub(str, repl, block ? (bad) => stringValue(block(bad)) : undefined);
}

const NORMALIZATION_FORMS: Record<string, "NFC" | "NFD" | "NFKC" | "NFKD"> = {
  ":nfc": "NFC",
  ":nfd": "NFD",
  ":nfkc": "NFKC",
  ":nfkd": "NFKD",
};

/**
 * `String#unicode_normalize` (`vendor/ruby/string.c:11432`, raising from
 * `vendor/ruby/lib/unicode_normalize/normalize.rb:140`).
 */
function unicodeNormalize(str: string, argv: unknown[]): string {
  checkArity(argv.length, 0, 1);
  const form = argv.length ? argv[0] : ":nfc";
  const js = NORMALIZATION_FORMS[form as string];
  if (!js) {
    const name = typeof form === "string" && form.startsWith(":") ? form.slice(1) : String(form);
    throw new ArgumentError(`Invalid normalization form ${name}.`);
  }
  return str.normalize(js);
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
