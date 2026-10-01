import { ArgumentError } from "./argument-error.js";
import { Hash } from "./hash.js";
import { Module } from "./include.js";
import { rbFloatTypeP, rbIntegerTypeP } from "./numeric.js";
import {
  rbModName,
  rbModSingletonP,
  rbModToS,
  rbObjClass,
  rbObjInstanceVariables,
  rbObjIvarGet,
} from "./object.js";
import { RuntimeError } from "./runtime-error.js";
import { isSymbol, symbolToS } from "./symbol.js";
import { TypeError } from "./type-error.js";

const MARSHAL_MAJOR = 4;
const MARSHAL_MINOR = 8;

const TYPE_NIL = 0x30;
const TYPE_TRUE = 0x54;
const TYPE_FALSE = 0x46;
const TYPE_FIXNUM = 0x69;

const TYPE_UCLASS = 0x43;
const TYPE_OBJECT = 0x6f;
const TYPE_FLOAT = 0x66;
const TYPE_BIGNUM = 0x6c;
const TYPE_STRING = 0x22;
const TYPE_ARRAY = 0x5b;
const TYPE_HASH = 0x7b;
const TYPE_HASH_DEF = 0x7d;
const TYPE_CLASS = 0x63;
const TYPE_MODULE = 0x6d;

const TYPE_SYMBOL = 0x3a;
const TYPE_SYMLINK = 0x3b;

const TYPE_IVAR = 0x49;
const TYPE_LINK = 0x40;

const FIXNUM_MAX = 2n ** 62n - 1n;
const FIXNUM_MIN = -(2n ** 62n);

/** The `arg->data` key of `-0.0`, a heap Float apart from the flonum `0.0` (`vendor/ruby/v3.3.11/marshal.c:896`). */
const NEGATIVE_ZERO = Symbol("-0.0");

type AnyClass = abstract new (...args: never) => unknown;
type Encname = boolean | string | null;

/** `struct dump_arg` (`vendor/ruby/v3.3.11/marshal.c:171`). */
interface DumpArg {
  str: number[];
  symbols: Map<string, number>;
  data: Map<unknown, number>;
  numEntries: number;
}

/** `RB_TYPE_P(obj, T_OBJECT)` (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:96`). */
function tObjectP(obj: unknown): obj is object {
  return Object.prototype.toString.call(obj) === "[object Object]" && rbObjClass(obj) !== "Hash";
}

/** `must_not_be_anonymous` (`vendor/ruby/v3.3.11/marshal.c:256`). */
function mustNotBeAnonymous(type: string, path: string): string {
  if (path[0] === "#") {
    throw new TypeError(`can't dump anonymous ${type} ${path}`);
  }
  return path;
}

/** `class2path` (`vendor/ruby/v3.3.11/marshal.c:273`). */
function class2path(klass: AnyClass | Module): string {
  const path = rbModName(klass as AnyClass) ?? rbModToS(klass as AnyClass);

  mustNotBeAnonymous(typeof klass === "function" ? "class" : "module", path);
  return path;
}

/** `w_nbyte` (`vendor/ruby/v3.3.11/marshal.c:290`). */
function wNbyte(s: ArrayLike<number>, n: number, arg: DumpArg): void {
  for (let i = 0; i < n; i++) arg.str.push(s[i]);
}

/** `w_byte` (`vendor/ruby/v3.3.11/marshal.c:301`). */
function wByte(c: number, arg: DumpArg): void {
  wNbyte([c & 0xff], 1, arg);
}

/** `w_bytes` (`vendor/ruby/v3.3.11/marshal.c:307`). */
function wBytes(s: ArrayLike<number>, n: number, arg: DumpArg): void {
  wLong(n, arg);
  wNbyte(s, n, arg);
}

/** `w_cstr` (`vendor/ruby/v3.3.11/marshal.c:313`). */
function wCstr(s: string, arg: DumpArg): void {
  const bytes = new TextEncoder().encode(s);
  wBytes(bytes, bytes.length, arg);
}

/** `w_short` (`vendor/ruby/v3.3.11/marshal.c:316`). */
function wShort(x: number, arg: DumpArg): void {
  wByte((x >> 0) & 0xff, arg);
  wByte((x >> 8) & 0xff, arg);
}

/** `w_long` (`vendor/ruby/v3.3.11/marshal.c:323`). */
function wLong(x: number, arg: DumpArg): void {
  const buf: number[] = [];
  const i = rubyMarshalWriteLong(x, buf);
  if (i < 0) {
    throw new TypeError("long too big to dump");
  }
  wNbyte(buf, i, arg);
}

/** `ruby_marshal_write_long` (`vendor/ruby/v3.3.11/marshal.c:334`). */
function rubyMarshalWriteLong(x: number, buf: number[]): number {
  let i: number;

  if (x < -0x80000000 || x > 0x7fffffff) {
    return -1;
  }

  if (x === 0) {
    buf[0] = 0;
    return 1;
  }
  if (0 < x && x < 123) {
    buf[0] = x + 5;
    return 1;
  }
  if (-124 < x && x < 0) {
    buf[0] = (x - 5) & 0xff;
    return 1;
  }
  for (i = 1; i < 5; i++) {
    buf[i] = x & 0xff;
    x = x >> 8;
    if (x === 0) {
      buf[0] = i;
      break;
    }
    if (x === -1) {
      buf[0] = -i & 0xff;
      break;
    }
  }
  return i + 1;
}

/** `w_float` (`vendor/ruby/v3.3.11/marshal.c:427`). */
function wFloat(d: number, arg: DumpArg): void {
  if (d === Infinity || d === -Infinity) {
    if (d < 0) wCstr("-inf", arg);
    else wCstr("inf", arg);
  } else if (Number.isNaN(d)) {
    wCstr("nan", arg);
  } else if (d === 0.0) {
    if (Object.is(d, -0)) wCstr("-0", arg);
    else wCstr("0", arg);
  } else {
    let buf = "";
    const [mant, exp] = Math.abs(d).toExponential().split("e");
    const p = mant.replace(".", "");
    const decpt = Number(exp) + 1;
    const digs = p.length;
    if (d < 0) buf += "-";
    if (decpt < -3 || decpt > digs) {
      buf += p[0];
      if (digs - 1 > 0) buf += ".";
      buf += p.slice(1);
      buf += `e${decpt - 1}`;
    } else if (decpt > 0) {
      buf += p.slice(0, decpt);
      if (digs - decpt > 0) {
        buf += ".";
        buf += p.slice(decpt);
      }
    } else {
      buf += "0";
      buf += ".";
      if (decpt) {
        buf += "0".repeat(-decpt);
      }
      buf += p;
    }
    wCstr(buf, arg);
  }
}

/** `is_ascii_string` (`vendor/ruby/v3.3.11/marshal.c:484`, `rb_enc_str_asciionly_p`). */
function isAsciiString(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/** `w_encivar` (`vendor/ruby/v3.3.11/marshal.c:480`). */
function wEncivar(str: string, arg: DumpArg): Encname {
  const encname = encodingName(str);
  if (encname === null || isAsciiString(str)) {
    return null;
  }
  wByte(TYPE_IVAR, arg);
  return encname;
}

/** `w_encname` (`vendor/ruby/v3.3.11/marshal.c:492`). */
function wEncname(encname: Encname, arg: DumpArg): void {
  if (encname !== null) {
    wLong(1, arg);
    wEncoding(encname, arg, 1);
  }
}

/** `w_symbol` (`vendor/ruby/v3.3.11/marshal.c:504`). */
function wSymbol(sym: string, arg: DumpArg): void {
  const num = arg.symbols.get(sym);

  if (num !== undefined) {
    wByte(TYPE_SYMLINK, arg);
    wLong(num, arg);
  } else {
    const origSym = sym;
    sym = symbolToS(sym);
    const encname = wEncivar(sym, arg);
    wByte(TYPE_SYMBOL, arg);
    wCstr(sym, arg);
    arg.symbols.set(origSym, arg.symbols.size);
    wEncname(encname, arg);
  }
}

/** `w_unique` (`vendor/ruby/v3.3.11/marshal.c:528`). */
function wUnique(s: string, arg: DumpArg): void {
  mustNotBeAnonymous("class", s);
  wSymbol(`:${s}`, arg);
}

/** `hash_each` (`vendor/ruby/v3.3.11/marshal.c:537`). */
function hashEach(key: unknown, value: unknown, arg: DumpArg, limit: number): void {
  wObject(key, arg, limit);
  wObject(value, arg, limit);
}

/** `w_class` (`vendor/ruby/v3.3.11/marshal.c:572`). */
function wClass(type: number, obj: object, arg: DumpArg): void {
  const klass = obj.constructor as AnyClass;
  wByte(type, arg);
  const path = class2path(klass);
  wUnique(path, arg);
}

/** `w_uclass` (`vendor/ruby/v3.3.11/marshal.c:590`). */
function wUclass(obj: object, sup: AnyClass, arg: DumpArg): void {
  const klass = obj.constructor as AnyClass | undefined;

  if (klass !== undefined && klass !== sup) {
    wByte(TYPE_UCLASS, arg);
    wUnique(class2path(klass), arg);
  }
}

/** `encoding_name` (`vendor/ruby/v3.3.11/marshal.c:661`). */
function encodingName(obj: unknown): Encname {
  if (typeof obj === "string") {
    return true;
  } else {
    return null;
  }
}

/** `w_encoding` (`vendor/ruby/v3.3.11/marshal.c:694`). */
function wEncoding(encname: Encname, arg: DumpArg, limit: number): number {
  if (limit >= 0) ++limit;
  switch (encname) {
    case false:
    case true:
      wSymbol(":E", arg);
      wObject(encname, arg, limit);
      return 1;
    case null:
      return 0;
  }
  wSymbol(":encoding", arg);
  wObject(encname, arg, limit);
  return 1;
}

/** `has_ivars` (`vendor/ruby/v3.3.11/marshal.c:713`). */
function hasIvars(encname: Encname): number {
  return encname !== null ? 1 : 0;
}

/** `w_ivar_each` (`vendor/ruby/v3.3.11/marshal.c:736`) over `w_obj_each` (`marshal.c:629`). */
function wIvarEach(obj: object, num: number, arg: DumpArg, limit: number): void {
  if (!num) return;
  for (const id of rbObjInstanceVariables(obj)) {
    wSymbol(`:${id}`, arg);
    wObject(rbObjIvarGet(obj, id), arg, limit);
  }
}

/** `w_ivar` (`vendor/ruby/v3.3.11/marshal.c:763`). */
function wIvar(num: number, encname: Encname, arg: DumpArg, limit: number): void {
  wLong(num, arg);
  wEncoding(encname, arg, limit);
}

/** `w_objivar` (`vendor/ruby/v3.3.11/marshal.c:780`). */
function wObjivar(obj: object, arg: DumpArg, limit: number): void {
  const num = rbObjInstanceVariables(obj).length;

  wLong(num, arg);
  wIvarEach(obj, num, arg, limit);
}

/** `w_bigfixnum` (`vendor/ruby/v3.3.11/marshal.c:792`). */
function wBigfixnum(obj: bigint, arg: DumpArg): void {
  wByte(TYPE_BIGNUM, arg);

  let num = obj;

  const sign = num < 0n ? 0x2d : 0x2b;
  wByte(sign, arg);

  if (num < 0n) num = -num;

  let slen = 0;
  {
    let slenNum = num;
    while (slenNum) {
      slen++;
      slenNum = slenNum >> 16n;
    }
  }

  wLong(slen, arg);

  for (let i = 0; i < slen; i++) {
    wShort(Number(num & 0xffffn), arg);
    num = num >> 16n;
  }

  arg.numEntries++;
}

/** `w_remember` (`vendor/ruby/v3.3.11/marshal.c:840`). */
function wRemember(obj: unknown, arg: DumpArg): void {
  arg.data.set(obj, arg.numEntries++);
}

/** `w_object` (`vendor/ruby/v3.3.11/marshal.c:846`). */
function wObject(obj: unknown, arg: DumpArg, limit: number): void {
  let hasiv = 0;
  let encname: Encname = null;

  if (limit === 0) {
    throw new ArgumentError("exceed depth limit");
  }

  if (obj === null || obj === undefined) {
    wByte(TYPE_NIL, arg);
  } else if (obj === true) {
    wByte(TYPE_TRUE, arg);
  } else if (obj === false) {
    wByte(TYPE_FALSE, arg);
  } else if (rbIntegerTypeP(obj) && FIXNUM_MIN <= BigInt(obj) && BigInt(obj) <= FIXNUM_MAX) {
    if (-0x40000000 <= obj && obj <= 0x3fffffff) {
      wByte(TYPE_FIXNUM, arg);
      wLong(Number(obj), arg);
    } else {
      wBigfixnum(BigInt(obj), arg);
    }
  } else if (isSymbol(obj)) {
    wSymbol(obj, arg);
  } else {
    if (rbFloatTypeP(obj)) obj = obj.valueOf();
    else if (rbIntegerTypeP(obj)) obj = BigInt(obj);

    const key = Object.is(obj, -0) ? NEGATIVE_ZERO : obj;
    const num = arg.data.get(key);
    if (num !== undefined) {
      wByte(TYPE_LINK, arg);
      wLong(num, arg);
      return;
    }

    if (limit > 0) limit--;

    if (typeof obj === "number") {
      wRemember(key, arg);
      wByte(TYPE_FLOAT, arg);
      wFloat(obj, arg);
      return;
    }

    wRemember(key, arg);

    hasiv = hasIvars((encname = encodingName(obj)));
    if (hasiv) wByte(TYPE_IVAR, arg);

    if (typeof obj === "function" && rbObjClass(obj) === "Class") {
      if (rbModSingletonP(obj)) {
        throw new TypeError("singleton class can't be dumped");
      }
      {
        const path = class2path(obj as AnyClass);
        const encname = wEncivar(path, arg);
        wByte(TYPE_CLASS, arg);
        wCstr(path, arg);
        wEncname(encname, arg);
      }
    } else if (obj instanceof Module) {
      const path = class2path(obj);
      const encname = wEncivar(path, arg);
      wByte(TYPE_MODULE, arg);
      wCstr(path, arg);
      wEncname(encname, arg);
    } else if (typeof obj === "bigint") {
      wByte(TYPE_BIGNUM, arg);
      {
        const sign = obj >= 0n ? 0x2b : 0x2d;
        const d: number[] = [];

        for (let num = obj < 0n ? -obj : obj; num; num = num >> 16n) {
          d.push(Number(num & 0xffffn));
        }

        wByte(sign, arg);
        wLong(d.length, arg);
        for (let j = 0; j < d.length; j++) {
          wShort(d[j], arg);
        }
      }
    } else if (typeof obj === "string") {
      wByte(TYPE_STRING, arg);
      wCstr(obj, arg);
    } else if (Array.isArray(obj)) {
      wUclass(obj, Array, arg);
      wByte(TYPE_ARRAY, arg);
      {
        const len = obj.length;

        wLong(len, arg);
        for (let i = 0; i < obj.length; i++) {
          wObject(obj[i], arg, limit);
          if (len !== obj.length) {
            throw new RuntimeError("array modified during dump");
          }
        }
      }
    } else if (obj instanceof Map || rbObjClass(obj) === "Hash") {
      wUclass(obj as object, obj instanceof Hash ? Hash : obj instanceof Map ? Map : Object, arg);
      if (obj instanceof Hash && obj.isCompareByIdentity()) {
        wByte(TYPE_UCLASS, arg);
        wSymbol(":Hash", arg);
      }
      const ifnone = obj instanceof Hash ? (obj.defaultProc() ?? obj.default()) : undefined;
      if (ifnone == null) {
        wByte(TYPE_HASH, arg);
      } else if (obj instanceof Hash && obj.defaultProc() !== undefined) {
        throw new TypeError("can't dump hash with default proc");
      } else {
        wByte(TYPE_HASH_DEF, arg);
      }
      const pairs = obj instanceof Map ? [...obj] : Object.entries(obj as object);
      wLong(pairs.length, arg);
      for (const [key, value] of pairs) hashEach(key, value, arg, limit);
      if (ifnone != null) {
        wObject(ifnone, arg, limit);
      }
    } else if (tObjectP(obj)) {
      wClass(TYPE_OBJECT, obj, arg);
      wObjivar(obj, arg, limit);
    } else {
      throw new TypeError(`no _dump_data is defined for class ${rbObjClass(obj)}`);
    }
  }
  if (hasiv) {
    wIvar(hasiv, encname, arg, limit);
  }
}

/** `rb_marshal_dump_limited` (`vendor/ruby/v3.3.11/marshal.c:1228`). */
function rbMarshalDumpLimited(obj: unknown, limit: number): string {
  const arg: DumpArg = { str: [], symbols: new Map(), data: new Map(), numEntries: 0 };

  wByte(MARSHAL_MAJOR, arg);
  wByte(MARSHAL_MINOR, arg);

  wObject(obj, arg, limit);

  let port = "";
  for (let i = 0; i < arg.str.length; i += 0x8000) {
    port += String.fromCharCode(...arg.str.slice(i, i + 0x8000));
  }
  return port;
}

/**
 * Ruby's `Marshal` (`vendor/ruby/v3.3.11/marshal.c:2555`), format 4.8. The
 * marshalled data is an ASCII-8BIT String, one character per byte.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Marshal`
 * (`vendor/ruby/v3.3.11/marshal.c:2555`), which Rails calls without defining.
 */
export const Marshal = {
  /**
   * `Marshal.dump(obj, limit = -1)` (`marshal_dump`,
   * `vendor/ruby/v3.3.11/marshal.c:1207`, over `w_object`, `marshal.c:846`), for the types a
   * schema-cache dump holds
   * (`vendor/rails/v8.0.2/activerecord/lib/active_record/connection_adapters/schema_cache.rb:416-418`):
   * `nil`, `true`, `false`, Integer, Float, String, Symbol, Array, Hash and a
   * plain ivar object, plus Class and Module. Any other value takes the
   * `T_DATA` arm's `TypeError`.
   *
   * @boundary: a JS string carries no encoding tag, so `encoding_name`
   *  (`marshal.c:661`) answers UTF-8 for every String and `has_ivars`
   *  (`marshal.c:713`) finds no ivars on a String, Array or Hash. `arg->data`
   *  is an identity table, and a JS string, Float or Integer has no identity
   *  apart from its value, so equal ones are one entry and the second is a
   *  `TYPE_LINK`, as a deduplicated Ruby String's is; `-0.0` is keyed apart
   *  from `0.0`, which a `Map` reads as one key. `ruby_dtoa(d, 0, …)`
   *  (`marshal.c:444`) is the shortest round-tripping digit string, which
   *  `toExponential()` also answers. A whole-valued `number` is an Integer
   *  (`rbObjClass`), so a Float `1.0` dumps as a Float only when boxed
   *  (`rbDbl2num`). A JS string is UTF-16, and `TextEncoder` writes a lone
   *  surrogate as U+FFFD where a Ruby String's bytes are written as they are.
   *  `T_OBJECT` is a value `Object.prototype.toString` answers
   *  `[object Object]` for that is not a plain hash, so a JS built-in with
   *  internal slots, a Temporal value, or an instance of a class carrying
   *  `Symbol.toStringTag` is `T_DATA` and takes its `TypeError`.
   *
   * Not ported: the `anIO` argument; `w_extended` (`marshal.c:550`) and the
   * `marshal_dump` arm (`marshal.c:910`), which are
   * `ruby-compat-has-no-marshal-for-schema-cache-and-debug`; `class2path`'s
   * `rb_path_to_class` check (`marshal.c:279`), which is
   * `ruby-compat-marshal-load-core-types`; and the `_dump`, Regexp and Struct
   * arms, which nothing calls.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Marshal.dump` (`vendor/ruby/v3.3.11/marshal.c:1207`).
   */
  dump(obj: unknown, limit: number = -1): string {
    return rbMarshalDumpLimited(obj, limit);
  },
};
