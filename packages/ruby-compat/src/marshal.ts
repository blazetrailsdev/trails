import { ArgumentError } from "./argument-error.js";
import { Encoding } from "./encoding.js";
import { Hash } from "./hash.js";
import { Module } from "./include.js";
import { warn } from "./kernel-warn.js";
import { rbBigNorm, rbDbl2num, rbFloatTypeP, rbIntegerTypeP } from "./numeric.js";
import {
  rbInspect,
  rbModName,
  rbModSingletonP,
  rbModToS,
  rbObjAsString,
  rbObjClass,
  rbObjClassname,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjIvarSet,
  rtest,
} from "./object.js";
import { RuntimeError } from "./runtime-error.js";
import { forceEncoding, isValidEncoding } from "./string/force-encoding.js";
import { rbCheckStringType, stringValue } from "./string/support.js";
import { isSymbol, symbolToS } from "./symbol.js";
import { TypeError } from "./type-error.js";
import { rbPathToClass } from "./variable.js";
import { verbose } from "./verbose.js";

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

/** `struct load_arg` (`vendor/ruby/v3.3.11/marshal.c:1267`). */
interface LoadArg {
  src: string;
  offset: number;
  symbols: string[];
  data: Map<number, unknown>;
}

/** `RB_TYPE_P(obj, T_OBJECT)` (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:96`). */
function tObjectP(obj: unknown): obj is object {
  return (
    Object.prototype.toString.call(obj) === "[object Object]" && rbObjClassname(obj) !== "Hash"
  );
}

/** `must_not_be_anonymous` (`vendor/ruby/v3.3.11/marshal.c:256`). */
function mustNotBeAnonymous(type: string, path: string): string {
  if (path[0] === "#") {
    throw new TypeError(`can't dump anonymous ${type} ${path}`);
  }
  return path;
}

/**
 * `class2path` (`vendor/ruby/v3.3.11/marshal.c:273`). Every caller hands it
 * a class that is not a singleton, which `rb_class_real` answers unchanged.
 */
function class2path(klass: AnyClass | Module): string {
  const path = rbModName(klass as AnyClass) ?? rbModToS(klass as AnyClass);

  mustNotBeAnonymous(typeof klass === "function" ? "class" : "module", path);
  if (rbPathToClass(path) !== klass) {
    throw new TypeError(`${path} can't be referred to`);
  }
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

    if (typeof obj === "function" && rbObjClassname(obj) === "Class") {
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
    } else if (obj instanceof Map || rbObjClassname(obj) === "Hash") {
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
      throw new TypeError(`no _dump_data is defined for class ${rbObjClassname(obj)}`);
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

/** `too_short` (`vendor/ruby/v3.3.11/marshal.c:1337`). */
function tooShort(): never {
  throw new ArgumentError("marshal data too short");
}

/** `r_prepare` (`vendor/ruby/v3.3.11/marshal.c:1343`); `undefined` is `Qundef`. */
function rPrepare(arg: LoadArg): number {
  const idx = arg.data.size;

  arg.data.set(idx, undefined);
  return idx;
}

/** `r_byte` (`vendor/ruby/v3.3.11/marshal.c:1370`), the String-source arm. */
function rByte(arg: LoadArg): number {
  let c: number;

  if (arg.src.length > arg.offset) {
    c = arg.src.charCodeAt(arg.offset++) & 0xff;
  } else {
    tooShort();
  }
  return c;
}

/** `long_toobig` (`vendor/ruby/v3.3.11/marshal.c:1398`). */
function longToobig(size: number): never {
  throw new TypeError(`long too big for this architecture (size 8, given ${size})`);
}

/**
 * `r_long` (`vendor/ruby/v3.3.11/marshal.c:1405`). JS's bitwise operators are
 * 32-bit, so the bytes are summed; the negative arm's mask-and-or over `-1` is
 * the same value less `256 ** c`. `w_long` writes four bytes at most; a wider
 * payload is exact up to `2 ** 53`, where a C `long` is to `2 ** 63`.
 */
function rLong(arg: LoadArg): number {
  let x: number;
  let c = (rByte(arg) << 24) >> 24;

  if (c === 0) return 0;
  if (c > 0) {
    if (4 < c && c < 128) {
      return c - 5;
    }
    if (c > 8) longToobig(c);
    x = 0;
    for (let i = 0; i < c; i++) {
      x += rByte(arg) * 256 ** i;
    }
  } else {
    if (-129 < c && c < -4) {
      return c + 5;
    }
    c = -c;
    if (c > 8) longToobig(c);
    x = -(256 ** c);
    for (let i = 0; i < c; i++) {
      x += rByte(arg) * 256 ** i;
    }
  }
  return x;
}

/** `r_bytes` (`vendor/ruby/v3.3.11/marshal.c:1507`). */
function rBytes(arg: LoadArg): string {
  return rBytes0(rLong(arg), arg);
}

/** `r_bytes0` (`vendor/ruby/v3.3.11/marshal.c:1510`), the String-source arm: an ASCII-8BIT String. */
function rBytes0(len: number, arg: LoadArg): string {
  let str: string;

  if (len === 0) return "";
  if (arg.src.length - arg.offset >= len) {
    str = arg.src.slice(arg.offset, arg.offset + len);
    arg.offset += len;
  } else {
    tooShort();
  }
  return str;
}

/**
 * `sym2encidx` (`vendor/ruby/v3.3.11/marshal.c:1543`); `null` is its `-1`, which
 * `rb_enc_find_index` also answers for a name that is not registered.
 */
function sym2encidx(sym: string, val: unknown): Encoding | null {
  if (!isAsciiString(sym)) return null;
  if (sym.length <= 0) return null;
  if (sym === "encoding") {
    const name = stringValue(val);
    if (name.includes("\0")) throw new ArgumentError("string contains null byte");
    try {
      return Encoding.find(name);
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      return null;
    }
  }
  if (sym === "E") {
    if (val === false) return Encoding.US_ASCII;
    else if (val === true) return Encoding.UTF_8;
  }
  return null;
}

/** `r_symlink` (`vendor/ruby/v3.3.11/marshal.c:1580`). */
function rSymlink(arg: LoadArg): string {
  const num = rLong(arg);
  const sym = arg.symbols[num];

  if (sym === undefined) {
    throw new ArgumentError("bad symbol");
  }
  return sym;
}

/**
 * `r_symreal` (`vendor/ruby/v3.3.11/marshal.c:1592`). Its US-ASCII tag for an
 * ascii-only symbol (`marshal.c:1598`) has no JS string to sit on.
 */
function rSymreal(arg: LoadArg, ivar: boolean): string {
  let s = rBytes(arg);
  let idx: Encoding | null = null;
  const n = arg.symbols.length;

  arg.symbols[n] = s;
  if (ivar) {
    let num = rLong(arg);
    while (num-- > 0) {
      const sym = rSymbol(arg);
      idx = sym2encidx(sym, rObject(arg));
    }
  }
  if (idx !== null && idx !== Encoding.ASCII_8BIT) {
    if (!isValidEncoding(s, idx)) {
      throw new ArgumentError(`invalid byte sequence in ${idx.name}: ${rbInspect(s)}`);
    }
    arg.symbols[n] = s = forceEncoding(s, idx);
  }

  return s;
}

/** `r_symbol` (`vendor/ruby/v3.3.11/marshal.c:1620`). */
function rSymbol(arg: LoadArg): string {
  let type: number;
  let ivar = false;

  for (;;) {
    switch ((type = rByte(arg))) {
      default:
        throw new ArgumentError(`dump format error for symbol(0x${type.toString(16)})`);
      case TYPE_IVAR:
        ivar = true;
        continue;
      case TYPE_SYMBOL:
        return rSymreal(arg, ivar);
      case TYPE_SYMLINK:
        if (ivar) {
          throw new ArgumentError("dump format error (symlink with encoding)");
        }
        return rSymlink(arg);
    }
  }
}

/** `r_unique` (`vendor/ruby/v3.3.11/marshal.c:1642`). */
function rUnique(arg: LoadArg): string {
  return rSymbol(arg);
}

/** `r_string` (`vendor/ruby/v3.3.11/marshal.c:1648`). */
function rString(arg: LoadArg): string {
  return rBytes(arg);
}

/** `r_entry0` (`vendor/ruby/v3.3.11/marshal.c:1654`). */
function rEntry0<T>(v: T, num: number, arg: LoadArg): T {
  arg.data.set(num, v);
  return v;
}

/** `r_entry` (`vendor/ruby/v3.3.11/marshal.c:1331`). */
function rEntry<T>(v: T, arg: LoadArg): T {
  return rEntry0(v, arg.data.size, arg);
}

/**
 * `r_ivar_encoding` (`vendor/ruby/v3.3.11/marshal.c:1734`). `rb_enc_associate_index`
 * retags a Ruby String in place; a JS string is immutable, so the re-read
 * string is answered, and `undefined` is the C `FALSE`.
 */
function rIvarEncoding(obj: unknown, arg: LoadArg, sym: string, val: unknown): string | undefined {
  const idx = sym2encidx(sym, val);
  if (idx !== null) {
    if (typeof obj === "string") {
      return forceEncoding(obj, idx);
    } else {
      throw new ArgumentError(`${rbObjAsString(obj)} is not enc_capable`);
    }
  }
  return undefined;
}

/**
 * `r_encname` (`vendor/ruby/v3.3.11/marshal.c:1750`). `obj` holds the String
 * `rb_enc_associate_index` retags in place, and is left holding the re-read one.
 */
function rEncname(obj: { value: string }, arg: LoadArg): number {
  let len = rLong(arg);
  if (len > 0) {
    const sym = rSymbol(arg);
    const val = rObject(arg);
    const str = rIvarEncoding(obj.value, arg, sym, val);
    if (str !== undefined) obj.value = str;
    len -= str !== undefined ? 1 : 0;
  }
  return len;
}

/**
 * `r_ivar` (`vendor/ruby/v3.3.11/marshal.c:1762`), answering `obj` as
 * {@link rIvarEncoding} left it. `rb_hash_ruby2_keywords` flags a Hash as
 * keyword arguments, which a JS call has no slot for.
 */
function rIvar(obj: unknown, hasEncoding: { value: boolean } | null, arg: LoadArg): unknown {
  let len = rLong(arg);
  if (len > 0) {
    do {
      const sym = rSymbol(arg);
      const val = rObject(arg);
      const str = rIvarEncoding(obj, arg, sym, val);
      if (str !== undefined) {
        if (hasEncoding) hasEncoding.value = true;
        obj = str;
      } else if (sym === "K") {
        if (!(obj instanceof Map)) {
          throw new ArgumentError(
            `ruby2_keywords flag is given but ${rbObjAsString(obj)} is not a Hash`,
          );
        }
      } else {
        rbObjIvarSet(obj as object, sym, val);
      }
    } while (--len > 0);
  }
  return obj;
}

/** `path2class` (`vendor/ruby/v3.3.11/marshal.c:1790`). */
function path2class(path: string): AnyClass {
  const v = rbPathToClass(path);

  if (!(typeof v === "function" && rbObjClassname(v) === "Class")) {
    throw new ArgumentError(`${path} does not refer to class`);
  }
  return v as AnyClass;
}

/** `must_be_module` (`vendor/ruby/v3.3.11/marshal.c:1803`), under `path2module` (`marshal.c:1800`). */
function mustBeModule(v: unknown, path: string): Module {
  if (!(v instanceof Module)) {
    throw new ArgumentError(`${path} does not refer to module`);
  }
  return v;
}

/**
 * `obj_alloc_by_klass` (`vendor/ruby/v3.3.11/marshal.c:1812`). `rb_obj_alloc`
 * runs the class's allocator and never `initialize`.
 */
function objAllocByKlass(klass: AnyClass): object {
  return Object.create(klass.prototype as object) as object;
}

/** `obj_alloc_by_path` (`vendor/ruby/v3.3.11/marshal.c:1835`). */
function objAllocByPath(path: string): object {
  return objAllocByKlass(path2class(path));
}

/** `prohibit_ivar` (`vendor/ruby/v3.3.11/marshal.c:1852`). */
function prohibitIvar(type: string, str: string, ivp: { value: boolean } | null): void {
  if (!ivp || !ivp.value) return;
  throw new TypeError(`can't override instance variable of ${type} \`${str}'`);
}

/** `r_object0` (`vendor/ruby/v3.3.11/marshal.c:1861`). */
function rObject0(arg: LoadArg, ivp: { value: boolean } | null): unknown {
  const type = rByte(arg);
  return rObjectFor(arg, ivp, type);
}

/**
 * `r_object_for` (`vendor/ruby/v3.3.11/marshal.c:1868`). The loop stands in
 * for `goto type_hash`. `Marshal.load`'s `proc` and `freeze:` are not ported,
 * which leaves `r_leave` (`marshal.c:1693`) nothing to do. `load_mantissa`
 * (`marshal.c:386`) reads the mantissa bytes format 4.8 no longer writes, and
 * `rb_integer_unpack` and `ULONG2NUM` are the BigInt shifts. `TYPE_IVAR`
 * re-enters at its `arg->data` index the String `r_ivar` re-read, where
 * `rb_enc_associate_index` retags a Ruby String in place; a linked String has
 * no entry of its own to re-enter. `TYPE_UCLASS` reaches a String, an Array,
 * a Hash or a Module, and `TYPE(v) != TYPE(tmp)` compares those. The arms
 * {@link wObject} does not write are not read either, and take the `default:`
 * arm.
 *
 * @inventedArm rEntry0 — PERMANENT
 */
function rObjectFor(arg: LoadArg, ivp: { value: boolean } | null, type: number): unknown {
  let v: unknown;
  let hashNewWithSize = (): Hash<unknown, unknown> => new Hash();

  for (;;) {
    switch (type) {
      case TYPE_LINK: {
        const id = rLong(arg);
        if (!arg.data.has(id)) {
          throw new ArgumentError("dump format error (unlinked)");
        }
        v = arg.data.get(id);
        break;
      }

      case TYPE_IVAR: {
        const ivar = { value: true };
        const idx = arg.data.size;
        v = rObject0(arg, ivar);
        if (ivar.value) {
          const obj = rIvar(v, null, arg);
          if (obj !== v && arg.data.get(idx) === v) v = rEntry0(obj, idx, arg);
        }
        break;
      }

      case TYPE_UCLASS: {
        const c = path2class(rUnique(arg));

        if (rbModSingletonP(c)) {
          throw new TypeError("singleton can't be loaded");
        }
        type = rByte(arg);
        if (c === Hash && (type === TYPE_HASH || type === TYPE_HASH_DEF)) {
          hashNewWithSize = () => new Hash().compareByIdentity();
          continue;
        }
        v = rObjectFor(arg, null, type);
        if (v === null || typeof v !== "object" || rbFloatTypeP(v) || tObjectP(v as unknown)) {
          throw new ArgumentError("dump format error (user class)");
        }
        const klass = rbObjClass(v) as AnyClass;
        const proto = c.prototype as object;
        if (v instanceof Module || !(c === klass || proto instanceof klass)) {
          const tmp = objAllocByKlass(c);

          if (
            v instanceof Module ||
            Array.isArray(v) !== tmp instanceof Array ||
            v instanceof Map !== tmp instanceof Map
          ) {
            throw new ArgumentError("dump format error (user class)");
          }
        }
        Object.setPrototypeOf(v, proto);
        break;
      }

      case TYPE_NIL:
        v = null;
        break;

      case TYPE_TRUE:
        v = true;
        break;

      case TYPE_FALSE:
        v = false;
        break;

      case TYPE_FIXNUM: {
        const i = rLong(arg);
        v = i;
        break;
      }

      case TYPE_FLOAT: {
        let d: number;
        const ptr = rBytes(arg);

        if (ptr === "nan") {
          d = NaN;
        } else if (ptr === "inf") {
          d = Infinity;
        } else if (ptr === "-inf") {
          d = -Infinity;
        } else {
          d = Number.parseFloat(ptr);
        }
        v = rbDbl2num(d);
        v = rEntry(v, arg);
        break;
      }

      case TYPE_BIGNUM: {
        const sign = rByte(arg);
        const len = rLong(arg);
        let num = 0n;

        if (len <= 4) {
          for (let i = 0; i < len; i++) {
            num |= BigInt(rByte(arg)) << BigInt(i * 16);
            num |= BigInt(rByte(arg)) << BigInt(i * 16 + 8);
          }
          if (sign === 0x2d) {
            num = -num;
          }
        } else {
          const data = rBytes0(len * 2, arg);
          for (let i = data.length - 1; i >= 0; i--) {
            num = (num << 8n) | BigInt(data.charCodeAt(i));
          }
          if (sign === 0x2d) num = -num;
        }
        v = rbBigNorm(num);
        v = rEntry(v, arg);
        break;
      }

      case TYPE_STRING:
        v = rEntry(rString(arg), arg);
        break;

      case TYPE_ARRAY: {
        let len = rLong(arg);
        const ary: unknown[] = [];

        v = rEntry(ary, arg);
        while (len--) {
          ary.push(rObject(arg));
        }
        break;
      }

      case TYPE_HASH:
      case TYPE_HASH_DEF: {
        let len = rLong(arg);
        const hash = hashNewWithSize();

        v = rEntry(hash, arg);
        while (len--) {
          const key = rObject(arg);
          const value = rObject(arg);
          hash.set(key, value);
        }
        if (type === TYPE_HASH_DEF) {
          hash.setDefault(rObject(arg));
        }
        break;
      }

      case TYPE_OBJECT: {
        const idx = rPrepare(arg);
        v = objAllocByPath(rUnique(arg));
        if (!tObjectP(v)) {
          throw new ArgumentError("dump format error");
        }
        v = rEntry0(v, idx, arg);
        rIvar(v, null, arg);
        break;
      }

      case TYPE_CLASS: {
        const str = { value: rBytes(arg) };

        if (ivp && ivp.value) ivp.value = rEncname(str, arg) > 0;
        v = path2class(str.value);
        prohibitIvar("class", str.value, ivp);
        v = rEntry(v, arg);
        break;
      }

      case TYPE_MODULE: {
        const str = { value: rBytes(arg) };

        if (ivp && ivp.value) ivp.value = rEncname(str, arg) > 0;
        v = mustBeModule(rbPathToClass(str.value), str.value);
        prohibitIvar("module", str.value, ivp);
        v = rEntry(v, arg);
        break;
      }

      case TYPE_SYMBOL:
        if (ivp) {
          v = rSymreal(arg, ivp.value);
          ivp.value = false;
        } else {
          v = rSymreal(arg, false);
        }
        v = `:${v as string}`;
        break;

      case TYPE_SYMLINK:
        v = `:${rSymlink(arg)}`;
        break;

      default:
        throw new ArgumentError(`dump format error(0x${type.toString(16)})`);
    }
    break;
  }

  if (v === undefined) {
    throw new ArgumentError("dump format error (bad link)");
  }

  return v;
}

/** `r_object` (`vendor/ruby/v3.3.11/marshal.c:2349`). */
function rObject(arg: LoadArg): unknown {
  return rObject0(arg, null);
}

/** `rb_marshal_load_with_proc` (`vendor/ruby/v3.3.11/marshal.c:2378`), for a String `port`. */
function rbMarshalLoadWithProc(port: unknown): unknown {
  const v = rbCheckStringType(port);
  if (v === null) {
    throw new TypeError("instance of IO needed");
  }
  const arg: LoadArg = { src: v, offset: 0, symbols: [], data: new Map() };

  const major = rByte(arg);
  const minor = rByte(arg);
  if (major !== MARSHAL_MAJOR || minor > MARSHAL_MINOR) {
    throw new TypeError(
      `incompatible marshal file format (can't be read)\n\tformat version ${MARSHAL_MAJOR}.${MARSHAL_MINOR} required; ${major}.${minor} given`,
    );
  }
  if (rtest(verbose()) && minor !== MARSHAL_MINOR) {
    warn(
      `incompatible marshal file format (can be read)\n\tformat version ${MARSHAL_MAJOR}.${MARSHAL_MINOR} required; ${major}.${minor} given`,
    );
  }

  return rObject(arg);
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
   *  (`rbObjClassname`), so a Float `1.0` dumps as a Float only when boxed
   *  (`rbDbl2num`). A JS string is UTF-16, and `TextEncoder` writes a lone
   *  surrogate as U+FFFD where a Ruby String's bytes are written as they are.
   *  `T_OBJECT` is a value `Object.prototype.toString` answers
   *  `[object Object]` for that is not a plain hash, so a JS built-in with
   *  internal slots, a Temporal value, or an instance of a class carrying
   *  `Symbol.toStringTag` is `T_DATA` and takes its `TypeError`.
   *
   * Not ported: the `anIO` argument; `w_extended` (`marshal.c:550`) and the
   * `marshal_dump` arm (`marshal.c:910`), which are
   * `ruby-compat-has-no-marshal-for-schema-cache-and-debug`; and the `_dump`,
   * Regexp and Struct arms, which nothing calls.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Marshal.dump` (`vendor/ruby/v3.3.11/marshal.c:1207`).
   */
  dump(obj: unknown, limit: number = -1): string {
    return rbMarshalDumpLimited(obj, limit);
  },

  /**
   * `Marshal.load(source)` (`marshal_load`, `vendor/ruby/v3.3.11/marshal.c:2434`,
   * over `r_object_for`, `marshal.c:1868`), for a String source holding what
   * {@link Marshal.dump} writes.
   *
   * @boundary: a String with no `E` / `encoding` ivar loads as its bytes, one
   *  character per byte, and one with the ivar is re-read through
   *  `forceEncoding`. A Hash loads as ruby-compat's `Hash`, a whole-valued
   *  Float loads boxed (`rbDbl2num`), and a Bignum goes through `rbBigNorm`.
   *  `rb_obj_alloc` is `Object.create(klass.prototype)`, so no constructor
   *  runs. `TYPE_UCLASS` re-classes an Array or Hash with `Object.setPrototypeOf`;
   *  a JS string has no class to set, so a String subclass is a format error.
   *  A class path resolves through `rbPathToClass`, whose table holds no core
   *  class, so a `compare_by_identity` Hash loads only once `Hash` is seated.
   *
   * Not ported: the `proc` and `freeze:` arguments and an IO source; and the
   * `TYPE_USRMARSHAL` arm, which is
   * `ruby-compat-has-no-marshal-for-schema-cache-and-debug`, with
   * `TYPE_USERDEF`, `TYPE_DATA`, `TYPE_EXTENDED`, Regexp and Struct, which
   * nothing calls.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Marshal.load` (`vendor/ruby/v3.3.11/marshal.c:2434`).
   */
  load(source: string): unknown {
    return rbMarshalLoadWithProc(source);
  },
};
