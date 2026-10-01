import { ArgumentError } from "./argument-error.js";
import { Encoding } from "./encoding.js";
import { Hash } from "./hash.js";
import { warn } from "./kernel-warn.js";
import { rbBigNorm, rbDbl2num, rbFloatTypeP, rbIntegerTypeP } from "./numeric.js";
import {
  rbInspect,
  rbModName,
  rbModToS,
  rbObjAsString,
  rbObjClass,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjIvarSet,
  rtest,
} from "./object.js";
import { RuntimeError } from "./runtime-error.js";
import { forceEncoding, isValidEncoding } from "./string/force-encoding.js";
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

const TYPE_OBJECT = 0x6f;
const TYPE_FLOAT = 0x66;
const TYPE_BIGNUM = 0x6c;
const TYPE_STRING = 0x22;
const TYPE_ARRAY = 0x5b;
const TYPE_HASH = 0x7b;
const TYPE_HASH_DEF = 0x7d;

const TYPE_SYMBOL = 0x3a;
const TYPE_SYMLINK = 0x3b;

const TYPE_IVAR = 0x49;
const TYPE_LINK = 0x40;

const FIXNUM_MAX = 2n ** 62n - 1n;
const FIXNUM_MIN = -(2n ** 62n);

const NEGATIVE_ZERO = Symbol("-0.0");

type AnyClass = abstract new (...args: never) => unknown;

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

/**
 * `RB_TYPE_P(obj, T_OBJECT)` (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:96`):
 * neither a core value nor a JS built-in holding internal slots.
 */
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
function class2path(klass: AnyClass): string {
  const path = rbModName(klass) ?? rbModToS(klass);

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

/** `w_cstr` (`vendor/ruby/v3.3.11/marshal.c:313`), over the string's UTF-8 bytes. */
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

/**
 * `w_float` (`vendor/ruby/v3.3.11/marshal.c:427`). `ruby_dtoa(d, 0, …)` is the
 * shortest round-tripping digit string, which `toExponential()` also answers.
 */
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

/** `w_encivar` (`vendor/ruby/v3.3.11/marshal.c:480`); `is_ascii_string` is the 7-bit test. */
function wEncivar(str: string, arg: DumpArg): boolean | string | null {
  const encname = encodingName(str);
  if (encname === null || /^[\0-\x7f]*$/.test(str)) {
    return null;
  }
  wByte(TYPE_IVAR, arg);
  return encname;
}

/** `w_encname` (`vendor/ruby/v3.3.11/marshal.c:492`). */
function wEncname(encname: boolean | string | null, arg: DumpArg): void {
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

/**
 * `w_class` (`vendor/ruby/v3.3.11/marshal.c:572`). `rb_class_real(CLASS_OF(obj))`
 * is `obj.constructor`, which a singleton class leaves answering the real
 * class. `w_extended` (`marshal.c:550`) is not ported.
 */
function wClass(type: number, obj: object, arg: DumpArg): void {
  const klass = obj.constructor as AnyClass;
  wByte(type, arg);
  const path = class2path(klass);
  wUnique(path, arg);
}

/**
 * `encoding_name` (`vendor/ruby/v3.3.11/marshal.c:661`). A JS string carries no
 * encoding tag and is UTF-8, `Qtrue`; nothing else is `rb_enc_capable`.
 */
function encodingName(obj: unknown): boolean | string | null {
  if (typeof obj === "string") {
    return true;
  } else {
    return null;
  }
}

/** `w_encoding` (`vendor/ruby/v3.3.11/marshal.c:694`). */
function wEncoding(encname: boolean | string | null, arg: DumpArg, limit: number): number {
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

/**
 * `has_ivars` (`vendor/ruby/v3.3.11/marshal.c:713`). Its generic-ivar count has
 * no seat: a JS string holds no ivars, and an Array's or Hash's own keys are
 * its elements.
 */
function hasIvars(encname: boolean | string | null): number {
  return encname !== null ? 1 : 0;
}

/** `w_ivar_each` (`vendor/ruby/v3.3.11/marshal.c:736`), with `w_obj_each` (`:629`) as its body. */
function wIvarEach(obj: object, num: number, arg: DumpArg, limit: number): void {
  if (!num) return;
  for (const id of rbObjInstanceVariables(obj)) {
    wSymbol(`:${id}`, arg);
    wObject(rbObjIvarGet(obj, id), arg, limit);
  }
}

/** `w_ivar` (`vendor/ruby/v3.3.11/marshal.c:763`). */
function wIvar(num: number, encname: boolean | string | null, arg: DumpArg, limit: number): void {
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

/**
 * `w_object` (`vendor/ruby/v3.3.11/marshal.c:846`). The arms ported are the ones
 * a schema-cache dump holds; `marshal_dump` (`:910`), `_dump` (`:918`),
 * `w_uclass` (`:590`) and the Class, Module, Regexp and Struct arms are not,
 * and every value outside them takes the `T_DATA` arm's `TypeError`.
 *
 * `arg->data` is an identity table. A JS string, Float or Integer has no
 * identity apart from its value, so equal ones are the same entry and the
 * second is a `TYPE_LINK`, as a deduplicated Ruby String's is. `-0.0` is keyed
 * apart from `0.0`, which a `Map` would otherwise read as the same key.
 */
function wObject(obj: unknown, arg: DumpArg, limit: number): void {
  let hasiv = 0;
  let encname: boolean | string | null = null;

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

    if (typeof obj === "bigint") {
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
      const ifnone = obj instanceof Hash ? (obj.default() ?? null) : null;
      const procDefault = obj instanceof Hash && obj.defaultProc() !== undefined;
      if (ifnone === null && !procDefault) {
        wByte(TYPE_HASH, arg);
      } else if (procDefault) {
        throw new TypeError("can't dump hash with default proc");
      } else {
        wByte(TYPE_HASH_DEF, arg);
      }
      const pairs = obj instanceof Map ? [...obj] : Object.entries(obj as object);
      wLong(pairs.length, arg);
      for (const [key, value] of pairs) {
        wObject(key, arg, limit);
        wObject(value, arg, limit);
      }
      if (ifnone !== null) {
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
 * the same value less `256 ** c`.
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
  if (!/^[\0-\x7f]+$/.test(sym)) return null;
  if (sym === "encoding") {
    try {
      return Encoding.find(rbObjAsString(val));
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

/** `r_symreal` (`vendor/ruby/v3.3.11/marshal.c:1592`). */
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
  if (idx !== null) {
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

/** `r_ivar` (`vendor/ruby/v3.3.11/marshal.c:1762`), answering `obj` as {@link rIvarEncoding} left it. */
function rIvar(obj: unknown, arg: LoadArg): unknown {
  let len = rLong(arg);
  if (len > 0) {
    do {
      const sym = rSymbol(arg);
      const val = rObject(arg);
      const str = rIvarEncoding(obj, arg, sym, val);
      if (str !== undefined) {
        obj = str;
      } else if (sym === "K") {
        if (!(obj instanceof Map) && rbObjClass(obj) !== "Hash") {
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

  if (typeof v !== "function") {
    throw new ArgumentError(`${path} does not refer to class`);
  }
  return v as AnyClass;
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

/** `r_object0` (`vendor/ruby/v3.3.11/marshal.c:1861`). */
function rObject0(arg: LoadArg, ivp: { value: boolean } | null): unknown {
  const type = rByte(arg);
  return rObjectFor(arg, ivp, type);
}

/**
 * `r_object_for` (`vendor/ruby/v3.3.11/marshal.c:1868`). `Marshal.load`'s `proc`
 * and `freeze:` are not ported, which leaves `r_leave` (`:1693`) nothing to do.
 * The arms {@link wObject} does not write are not read either, and take the
 * `default:` arm.
 */
function rObjectFor(arg: LoadArg, ivp: { value: boolean } | null, type: number): unknown {
  let v: unknown;

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
        const obj = rIvar(v, arg);
        if (obj !== v) v = rEntry0(obj, idx, arg);
      }
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
      const data = rBytes0(len * 2, arg);
      let num = 0n;

      for (let i = data.length - 1; i >= 0; i--) {
        num = (num << 8n) | BigInt(data.charCodeAt(i));
      }
      if (sign === 0x2d) {
        num = -num;
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
      const hash = new Hash<unknown, unknown>();

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
      rIvar(v, arg);
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

  if (v === undefined) {
    throw new ArgumentError("dump format error (bad link)");
  }

  return v;
}

/** `r_object` (`vendor/ruby/v3.3.11/marshal.c:2349`). */
function rObject(arg: LoadArg): unknown {
  return rObject0(arg, null);
}

/**
 * Ruby's `Marshal` (`vendor/ruby/v3.3.11/marshal.c:2555`), format 4.8, over the
 * types a schema-cache dump holds
 * (`vendor/rails/v8.0.2/activerecord/lib/active_record/connection_adapters/schema_cache.rb:416-418`):
 * `nil`, `true`, `false`, Integer, Float, String, Symbol, Array, Hash and a
 * plain ivar object. The marshalled data is an ASCII-8BIT String, one
 * character per byte.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Marshal`
 * (`vendor/ruby/v3.3.11/marshal.c:2555`), which Rails calls without defining.
 */
export const Marshal = {
  /**
   * `Marshal.dump(obj, limit = -1)` (`marshal_dump`,
   * `vendor/ruby/v3.3.11/marshal.c:1207`, over `rb_marshal_dump_limited`,
   * `marshal.c:1228`). The `anIO` port is not ported.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Marshal.dump` (`vendor/ruby/v3.3.11/marshal.c:1207`).
   */
  dump(obj: unknown, limit: number = -1): string {
    const arg: DumpArg = { str: [], symbols: new Map(), data: new Map(), numEntries: 0 };

    wByte(MARSHAL_MAJOR, arg);
    wByte(MARSHAL_MINOR, arg);

    wObject(obj, arg, limit);

    let port = "";
    for (let i = 0; i < arg.str.length; i += 0x8000) {
      port += String.fromCharCode(...arg.str.slice(i, i + 0x8000));
    }
    return port;
  },

  /**
   * `Marshal.load(source)` (`marshal_load`, `vendor/ruby/v3.3.11/marshal.c:2434`,
   * over `rb_marshal_load_with_proc`, `marshal.c:2378`), for a String source.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Marshal.load` (`vendor/ruby/v3.3.11/marshal.c:2434`).
   */
  load(source: string): unknown {
    if (typeof source !== "string") {
      throw new TypeError("instance of IO needed");
    }
    const arg: LoadArg = { src: source, offset: 0, symbols: [], data: new Map() };

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
  },
};
