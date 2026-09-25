import { ArgumentError } from "../argument-error.js";
import { IndexError } from "../index-error.js";
import { rbBuiltinClassName } from "../object.js";
import { Range } from "../range.js";
import { TypeError } from "../type-error.js";
import { bytes, isCharBoundary, strNew } from "./bytes.js";
import {
  checkArity,
  num2long,
  rbRangeBegLen,
  rbRegexp,
  stringValue,
  type StringReceiver,
} from "./support.js";

function strEnsureBytePos(b: number[], pos: number): void {
  if (!isCharBoundary(b, pos)) {
    throw new IndexError(`offset ${pos} does not land on character boundary`);
  }
}

/**
 * `String#getbyte` (`vendor/ruby/string.c:6141` `rb_str_getbyte`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrGetbyte(str: string, index: unknown): number | null {
  const b = bytes(str);
  let pos = num2long(index);
  if (pos < 0) pos += b.length;
  if (pos < 0 || b.length <= pos) return null;
  return b[pos];
}

/**
 * `String#setbyte` (`vendor/ruby/string.c:6166` `rb_str_setbyte`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSetbyte(self: StringReceiver, index: unknown, value: unknown): unknown {
  const b = bytes(self.string);
  const pos = num2long(index);
  const len = b.length;
  if (pos < -len || len <= pos) throw new IndexError(`index ${pos} out of string`);
  b[pos < 0 ? pos + len : pos] = num2long(value) & 0xff;
  self.string = strNew(b);
  return value;
}

function strByteSubstr(
  b: ArrayLike<unknown>,
  beg: number,
  len: number,
  empty: boolean,
  newStr: (beg: number, end: number) => string,
): string | null {
  const n = b.length;
  if (beg > n || len < 0) return null;
  if (beg < 0) {
    beg += n;
    if (beg < 0) return null;
  }
  if (len > n - beg) len = n - beg;
  if (len <= 0) {
    if (!empty) return null;
    len = 0;
  }
  return newStr(beg, beg + len);
}

/**
 * `String#byteslice` (`vendor/ruby/string.c:6330` `rb_str_byteslice`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrByteslice(str: string, ...args: unknown[]): string | null {
  const b = bytes(str);
  return strByteslice(b, args, (beg, end) => strNew(b.slice(beg, end)));
}

/**
 * `String#byteslice` (`vendor/ruby/string.c:6330` `rb_str_byteslice`) over an
 * ASCII-8BIT String, spelled as {@link b} spells one: a byte per code unit.
 * {@link rbStrByteslice} reads its receiver's UTF-8 bytes, which would count
 * each code unit from `0x80` up as two.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#byteslice`
 * (`vendor/ruby/string.c:6330`).
 */
export function byteslice(str: string, ...args: unknown[]): string | null {
  return strByteslice(str, args, (beg, end) => str.slice(beg, end));
}

function strByteslice(
  b: ArrayLike<unknown>,
  args: unknown[],
  newStr: (beg: number, end: number) => string,
): string | null {
  if (args.length === 2) {
    return strByteSubstr(b, num2long(args[0]), num2long(args[1]), true, newStr);
  }
  checkArity(args.length, 1, 2);
  const indx = args[0];
  if (indx instanceof Range) {
    const begLen = rbRangeBegLen(indx, b.length, 0);
    if (begLen === null) return null;
    return strByteSubstr(b, begLen[0], begLen[1], true, newStr);
  }
  return strByteSubstr(b, num2long(indx), 1, false, newStr);
}

function strCheckBegLen(b: number[], beg: number, len: number): [number, number] {
  const slen = b.length;
  if (len < 0) throw new IndexError(`negative length ${len}`);
  if (slen < beg || (beg < 0 && beg + slen < 0)) {
    throw new IndexError(`index ${beg} out of string`);
  }
  if (beg < 0) beg += slen;
  if (len > slen - beg) len = slen - beg;
  strEnsureBytePos(b, beg);
  strEnsureBytePos(b, beg + len);
  return [beg, len];
}

function rangeOrRaise(range: unknown, len: number): [number, number] {
  const begLen = range instanceof Range ? rbRangeBegLen(range, len, 2) : null;
  if (!begLen) {
    throw new TypeError(`wrong argument type ${rbBuiltinClassName(range)} (expected Range)`);
  }
  return begLen;
}

/**
 * `String#bytesplice` (`vendor/ruby/string.c:6385` `rb_str_bytesplice`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrBytesplice(self: StringReceiver, ...argv: unknown[]): string {
  checkArity(argv.length, 2, 5);
  if (![2, 3, 5].includes(argv.length)) {
    throw new ArgumentError(
      `wrong number of arguments (given ${argv.length}, expected 2, 3, or 5)`,
    );
  }
  const b = bytes(self.string);
  let beg: number;
  let len: number;
  let vb: number[];
  let vbeg: number;
  let vlen: number;
  if (argv.length === 2 || (argv.length === 3 && typeof argv[0] !== "number")) {
    [beg, len] = rangeOrRaise(argv[0], b.length);
    vb = bytes(stringValue(argv[1]));
    if (argv.length === 2) {
      vbeg = 0;
      vlen = vb.length;
    } else {
      [vbeg, vlen] = rangeOrRaise(argv[2], vb.length);
    }
  } else {
    beg = num2long(argv[0]);
    len = num2long(argv[1]);
    vb = bytes(stringValue(argv[2]));
    if (argv.length === 3) {
      vbeg = 0;
      vlen = vb.length;
    } else {
      vbeg = num2long(argv[3]);
      vlen = num2long(argv[4]);
    }
  }
  [beg, len] = strCheckBegLen(b, beg, len);
  [vbeg, vlen] = strCheckBegLen(vb, vbeg, vlen);
  b.splice(beg, len, ...vb.slice(vbeg, vbeg + vlen));
  self.string = strNew(b);
  return self.string;
}

function byteSearch(b: number[], sub: number[], from: number, reverse: boolean): number {
  const fits = (i: number) => sub.every((x, j) => b[i + j] === x);
  if (!reverse) {
    for (let i = from; i + sub.length <= b.length; i++) if (fits(i)) return i;
    return -1;
  }
  for (let i = Math.min(from, b.length - sub.length); i >= 0; i--) if (fits(i)) return i;
  return -1;
}

function regexpByteSearch(re: RegExp, str: string, pos: number, reverse: boolean): number {
  const sticky = rbRegexp(re, "dy");
  const starts: [number, number][] = [];
  let at = 0;
  for (let i = 0; ; ) {
    starts.push([i, at]);
    if (i >= str.length) break;
    const ch = String.fromCodePoint(str.codePointAt(i)!);
    at += bytes(ch).length;
    i += ch.length;
  }
  for (const [i, byte] of reverse ? starts.reverse() : starts) {
    if (reverse ? byte > pos : byte < pos) continue;
    sticky.lastIndex = i;
    if (sticky.test(str)) return byte;
  }
  return -1;
}

/**
 * `String#byteindex` (`vendor/ruby/string.c:4135` `rb_str_byteindex_m`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrByteindexM(str: string, ...args: unknown[]): number | null {
  checkArity(args.length, 1, 2);
  const b = bytes(str);
  const [sub, initpos] = args;
  let pos = 0;
  if (args.length === 2) {
    pos = num2long(initpos);
    if (pos < 0 ? (pos += b.length) < 0 : pos > b.length) return null;
  }
  strEnsureBytePos(b, pos);
  const found =
    sub instanceof RegExp
      ? regexpByteSearch(sub, str, pos, false)
      : byteSearch(b, bytes(stringValue(sub)), pos, false);
  return found >= 0 ? found : null;
}

/**
 * `String#byterindex` (`vendor/ruby/string.c:4456` `rb_str_byterindex_m`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrByterindexM(str: string, ...args: unknown[]): number | null {
  checkArity(args.length, 1, 2);
  const b = bytes(str);
  const [sub, initpos] = args;
  let pos = b.length;
  if (args.length === 2) {
    pos = num2long(initpos);
    if (pos < 0 && (pos += b.length) < 0) return null;
    if (pos > b.length) pos = b.length;
  }
  strEnsureBytePos(b, pos);
  const found =
    sub instanceof RegExp
      ? regexpByteSearch(sub, str, pos, true)
      : byteSearch(b, bytes(stringValue(sub)), pos, true);
  return found >= 0 ? found : null;
}

/**
 * `String#sum` (`vendor/ruby/string.c:10371` `rb_str_sum`): the byte sum modulo
 * `2**bits`, unmasked for a `bits` of 0 or less.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSum(str: string, ...args: unknown[]): number | bigint {
  checkArity(args.length, 0, 1);
  const bits = args.length ? num2long(args[0]) : 16;
  let sum = 0n;
  for (const byte of bytes(str)) sum += BigInt(byte);
  if (bits > 0) sum &= (1n << BigInt(bits)) - 1n;
  return sum <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sum) : sum;
}
