import { rbEql, rbEqual } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";
import { ArgumentError } from "./argument-error.js";
import { cmp, rbCmpint } from "./comparable.js";
import { Hash, rbBlockGivenP } from "./hash.js";
import { IndexError } from "./index-error.js";
import { warn } from "./kernel-warn.js";
import { conversionMismatch, rbBuiltinClassName } from "./object.js";
import { Range } from "./range.js";
import { checkArity, num2long } from "./string/support.js";
import { TypeError } from "./type-error.js";

/** `toofew` (`vendor/ruby/v3.3.11/pack.c:120`). */
const toofew = "too few arguments";

/** `endstr` (`vendor/ruby/v3.3.11/pack.c:42`), the types `<` / `>` may follow. */
const endstr = "sSiIlLqQjJ";

/** `BIGENDIAN_P()` (`vendor/ruby/v3.3.11/pack.c:58-75`): the host byte order. */
const BIGENDIAN_P = new Uint8Array(new Uint16Array([1]).buffer)[0] === 0;

/** `b64_table` (`vendor/ruby/v3.3.11/pack.c:789`). */
const b64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** `unknown_directive` (`vendor/ruby/v3.3.11/pack.c:160`). */
function unknownDirective(mode: string, type: string, fmt: string): never {
  throw new ArgumentError(`unknown ${mode} directive '${type}' in '${fmt}'`);
}

/**
 * `encodes` (`vendor/ruby/v3.3.11/pack.c:791`) for `type == 'm'` — `len` bytes of `s0`
 * as Base64, plus the trailing newline `tailLf` asks for. MRI's `buff_size`
 * flush has no analogue: a JS array grows.
 */
function encodes(str: string[], s0: Uint8Array, len: number, tailLf: number): void {
  const buff: string[] = [];
  const trans = b64Table;
  const padding = "=";
  const s = s0;
  let i = 0;

  while (len >= 3) {
    buff.push(trans[0o77 & (s[i] >> 2)]);
    buff.push(trans[0o77 & (((s[i] << 4) & 0o60) | ((s[i + 1] >> 4) & 0o17))]);
    buff.push(trans[0o77 & (((s[i + 1] << 2) & 0o74) | ((s[i + 2] >> 6) & 0o3))]);
    buff.push(trans[0o77 & s[i + 2]]);
    i += 3;
    len -= 3;
  }

  if (len === 2) {
    buff.push(trans[0o77 & (s[i] >> 2)]);
    buff.push(trans[0o77 & (((s[i] << 4) & 0o60) | ((s[i + 1] >> 4) & 0o17))]);
    buff.push(trans[0o77 & (((s[i + 1] << 2) & 0o74) | ((0 >> 6) & 0o3))]);
    buff.push(padding);
  } else if (len === 1) {
    buff.push(trans[0o77 & (s[i] >> 2)]);
    buff.push(trans[0o77 & (((s[i] << 4) & 0o60) | ((0 >> 4) & 0o17))]);
    buff.push(padding);
    buff.push(padding);
  }
  if (tailLf) buff.push("\n");
  str.push(buff.join(""));
}

/**
 * `pack_pack` (`vendor/ruby/v3.3.11/pack.c:197`), narrowed to the `m` directive
 * (`pack.c:663-690`) — Base64, wrapped at `len` input bytes per line, or
 * strict with no line breaks at all when the count is an explicit `0`. `m0` is
 * what `Rack::Test::Session#basic_authorize` packs with
 * (`vendor/rack-test/v2.2.0/lib/rack/test.rb:199`) — and to `U` (`pack.c:645-660`),
 * one UTF-8 character per Integer, which `ActiveSupport::Multibyte::Chars`
 * packs codepoints with (`multibyte/chars.rb:136,144`) — and to the `C`, `E`,
 * `l<` and `@` directives `ActiveSupport::Cache::Coder` packs its header with
 * (`cache/coder.rb:44,77-82`): `C` and `l` through `pack_integer`
 * (`pack.c:477-551`), `E` (`pack.c:575-583`), and `@` growing or shrinking to
 * an absolute byte position (`pack.c:617-639`). Every other directive is a
 * separate port, so each reaches `unknown_directive` (`pack.c:761`) here, and
 * of the modifiers only `<` / `>` (`pack.c:268-277`) are ported.
 *
 * `C`, `E`, `l` and `@` answer bytes, one code unit per byte, as `m` does.
 *
 * A `U` result is a UTF-8 String (`pack.c:299-302`), so it is a JS string of
 * those characters rather than of bytes; `String.fromCodePoint` is
 * `rb_uv_to_utf8`, and raises past U+10FFFF, which JS strings cannot hold.
 *
 * The argument is read as bytes, one code unit per byte — ruby-compat's
 * ASCII-8BIT convention — as `pack.c:663-690` reads `RSTRING_PTR` with no
 * re-encoding. A caller holding a UTF-8 String passes its `String#b`.
 *
 * `*` is `0` for the `@Xxu` types, `1` for the `PMm` types and the array
 * remainder otherwise (`pack.c:281-284`), so `m*` is `m` and `U*` takes every
 * element. The
 * `u`-only `len > 63` clamp (`pack.c:676`) is not reachable without that
 * directive.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Array#pack`
 * (`vendor/ruby/v3.3.11/pack.c:197`).
 */
export function pack(ary: ReadonlyArray<string | number | bigint>, fmt: string): string {
  const res: string[] = [];
  let p = 0;
  const pend = fmt.length;
  let idx = 0;

  const nextfrom = (): string | number | bigint => {
    if (idx >= ary.length) throw new ArgumentError(toofew);
    return ary[idx++];
  };

  while (p < pend) {
    const type = fmt[p++];

    if (/\s/.test(type)) continue;
    if (type === "#") {
      while (p < pend && fmt[p] !== "\n") {
        p++;
      }
      continue;
    }

    let explicitEndian = "";
    while (fmt[p] === "<" || fmt[p] === ">") {
      if (!endstr.includes(type)) {
        throw new ArgumentError(`'${fmt[p]}' allowed only after types ${endstr}`);
      }
      if (explicitEndian) throw new RangeError("Can't use both '<' and '>'");
      explicitEndian = fmt[p++];
    }

    let len: number;
    if (fmt[p] === "*") {
      len = "@Xxu".includes(type) ? 0 : "PMm".includes(type) ? 1 : ary.length - idx;
      p++;
    } else if (fmt[p] >= "0" && fmt[p] <= "9") {
      let digits = "";
      while (fmt[p] >= "0" && fmt[p] <= "9") digits += fmt[p++];
      len = Number(digits);
    } else {
      len = 1;
    }

    if (type === "U") {
      while (len-- > 0) {
        const from = nextfrom();
        if (typeof from !== "number") {
          throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(from)} into Integer`);
        }
        const l = Math.trunc(from);
        if (l < 0) {
          throw new RangeError("pack(U): value out of range");
        }
        res.push(String.fromCodePoint(l));
      }
      continue;
    }
    if (type === "C" || type === "l") {
      const integerSize = type === "C" ? 1 : 4;
      const bigendianP = explicitEndian ? explicitEndian === ">" : BIGENDIAN_P;
      while (len-- > 0) {
        const from = nextfrom();
        if (typeof from !== "number" && typeof from !== "bigint") {
          throw new TypeError(`no implicit conversion of ${rbBuiltinClassName(from)} into Integer`);
        }
        let v = BigInt.asUintN(
          integerSize * 8,
          BigInt(typeof from === "number" ? Math.trunc(from) : from),
        );
        const intbuf: string[] = [];
        for (let i = 0; i < integerSize; i++, v >>= 8n)
          intbuf.push(String.fromCharCode(Number(v & 0xffn)));
        res.push((bigendianP ? intbuf.reverse() : intbuf).join(""));
      }
      continue;
    }
    if (type === "E") {
      while (len-- > 0) {
        const from = nextfrom();
        if (typeof from !== "number" && typeof from !== "bigint") {
          throw new TypeError(`can't convert ${rbBuiltinClassName(from)} into Float`);
        }
        const tmp = new DataView(new ArrayBuffer(8));
        tmp.setFloat64(0, Number(from), true);
        for (let i = 0; i < 8; i++) res.push(String.fromCharCode(tmp.getUint8(i)));
      }
      continue;
    }
    if (type === "@") {
      const str = res.join("");
      len -= str.length;
      res.length = 0;
      res.push(len > 0 ? str + "\0".repeat(len) : str.slice(0, str.length + len));
      continue;
    }
    if (type !== "m") unknownDirective("pack", type, fmt);

    const from = nextfrom() as string;
    const s = new Uint8Array(from.length);
    for (let i = 0; i < from.length; i++) s[i] = from.charCodeAt(i) & 0xff;
    let ptr = 0;
    let plen = s.length;

    if (len === 0) {
      encodes(res, s.subarray(ptr), plen, 0);
      continue;
    }
    if (len <= 2) len = 45;
    else len = Math.floor(len / 3) * 3;
    while (plen > 0) {
      const todo = plen > len ? len : plen;
      encodes(res, s.subarray(ptr), todo, 1);
      plen -= todo;
      ptr += todo;
    }
  }

  return res.join("");
}

/**
 * @noRailsEquivalent PERMANENT — Ruby core `String#unpack1`, the `h` and `H`
 * directives (`vendor/ruby/v3.3.11/pack.c:1125,1145`).
 */
export function unpack1(
  str: string | Uint8Array,
  fmt: `h${string}` | `H${string}`,
  options?: { offset?: number },
): string | null;
/**
 * `String#unpack1` (`vendor/ruby/v3.3.11/pack.c:1621` `pack_unpack1`), which is
 * `pack_unpack_internal` (`pack.c:936`) in `UNPACK_1` mode: the first item
 * the format pushes, or nil when none does. Narrowed to the directives
 * {@link pack} answers bytes for — `C` and `l` through `unpack_integer`
 * (`pack.c:1177-1281`), `E` (`pack.c:1306-1315`), and `@` moving to an
 * absolute byte position (`pack.c:1531-1535`) — plus the `<` / `>` modifiers
 * (`pack.c:1014-1023`). Every other directive reaches `unknown_directive`.
 *
 * `str` is read as bytes, one code unit per byte, as {@link pack} writes them,
 * or as the bytes of a `Uint8Array`, the binary String seat.
 * `PACK_LENGTH_ADJUST_SIZE` (`pack.c:904-912`) caps a count at what the rest
 * of the string holds, so an item short of bytes pushes nothing.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#unpack1`
 * (`vendor/ruby/v3.3.11/pack.c:1621`).
 */
export function unpack1(
  str: string | Uint8Array,
  fmt: string,
  options?: { offset?: number },
): number | null;
/**
 * @noRailsEquivalent PERMANENT — Ruby core `String#unpack1`
 * (`vendor/ruby/v3.3.11/pack.c:1621`).
 */
export function unpack1(
  str: string | Uint8Array,
  fmt: string,
  { offset = 0 }: { offset?: number } = {},
): number | string | null {
  if (offset < 0) throw new ArgumentError("offset can't be negative");
  const ptr = typeof str === "string" ? Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff) : str;
  const send = ptr.length;
  if (offset > send) throw new ArgumentError("offset outside of string");
  let s = offset;
  let p = 0;
  const pend = fmt.length;

  while (p < pend) {
    let explicitEndian = "";
    const type = fmt[p++];

    if (/\s/.test(type)) continue;
    if (type === "#") {
      while (p < pend && fmt[p] !== "\n") {
        p++;
      }
      continue;
    }

    while (fmt[p] === "<" || fmt[p] === ">") {
      if (!endstr.includes(type)) {
        throw new ArgumentError(`'${fmt[p]}' allowed only after types ${endstr}`);
      }
      if (explicitEndian) throw new RangeError("Can't use both '<' and '>'");
      explicitEndian = fmt[p++];
    }

    let len: number;
    if (p >= pend) {
      len = 1;
    } else if (fmt[p] === "*") {
      len = send - s;
      p++;
    } else if (fmt[p] >= "0" && fmt[p] <= "9") {
      let digits = "";
      while (fmt[p] >= "0" && fmt[p] <= "9") digits += fmt[p++];
      len = Number(digits);
    } else {
      len = type !== "@" ? 1 : 0;
    }

    if (type === "C" || type === "l") {
      const signedP = type === "l";
      const integerSize = type === "C" ? 1 : 4;
      const bigendianP = explicitEndian ? explicitEndian === ">" : BIGENDIAN_P;
      if (len > Math.floor((send - s) / integerSize)) len = Math.floor((send - s) / integerSize);
      if (len > 0) {
        let val = 0n;
        for (let i = 0; i < integerSize; i++) {
          const byte = BigInt(ptr[bigendianP ? s + i : s + integerSize - 1 - i]);
          val = (val << 8n) | byte;
        }
        return Number(signedP ? BigInt.asIntN(integerSize * 8, val) : val);
      }
      continue;
    }
    if (type === "E") {
      if (len > Math.floor((send - s) / 8)) len = Math.floor((send - s) / 8);
      if (len > 0) {
        const tmp = new DataView(new ArrayBuffer(8));
        for (let i = 0; i < 8; i++) tmp.setUint8(i, ptr[s + i]);
        return tmp.getFloat64(0, true);
      }
      continue;
    }
    if (type === "h") {
      if (fmt[p - 1] === "*" || len > (send - s) * 2) len = (send - s) * 2;
      let bits = 0;
      let bitstr = "";
      for (let i = 0; i < len; i++) {
        if (i & 1) bits >>= 4;
        else bits = ptr[s++];
        bitstr += "0123456789abcdef"[bits & 15];
      }
      return bitstr;
    }
    if (type === "H") {
      if (fmt[p - 1] === "*" || len > (send - s) * 2) len = (send - s) * 2;
      let bits = 0;
      let bitstr = "";
      for (let i = 0; i < len; i++) {
        if (i & 1) bits <<= 4;
        else bits = ptr[s++];
        bitstr += "0123456789abcdef"[(bits >> 4) & 15];
      }
      return bitstr;
    }
    if (type === "@") {
      if (len > send) throw new ArgumentError("@ outside of string");
      s = len;
      continue;
    }
    unknownDirective("unpack", type, fmt);
  }

  return null;
}

/**
 * Ruby `Array#slice` / `Array#[]` (`vendor/ruby/v3.3.11/array.c:1827` `rb_ary_aref`):
 * `(index)` answers the element or nil, `(start, length)` a subarray
 * (`rb_ary_aref2`, `:1837`), and a Range a subarray through
 * `rb_range_beg_len` (`vendor/ruby/v3.3.11/range.c:1744`); an out-of-range start is nil.
 * @noRailsEquivalent PERMANENT
 */
export function arySlice<T>(ary: readonly T[], arg: unknown, length?: unknown): T | T[] | null {
  const argc = arguments.length - 1;
  if (argc < 1 || argc > 2) {
    throw new ArgumentError(`wrong number of arguments (given ${argc}, expected 1..2)`);
  }
  const alen = ary.length;
  if (argc === 2) {
    let beg = num2long(arg);
    const len = num2long(length);
    if (beg < 0) beg += alen;
    return subseq(ary, beg, len);
  }
  if (arg instanceof Range) {
    let beg = arg.begin ?? 0;
    let end = arg.end ?? alen;
    if (beg < 0) {
      beg += alen;
      if (beg < 0) return null;
    }
    if (end < 0) end += alen;
    if (arg.end !== null && !arg.excludeEnd) end += 1;
    return subseq(ary, beg, Math.max(0, end - beg));
  }
  const offset = num2long(arg);
  const index = offset < 0 ? offset + alen : offset;
  return index >= 0 && index < alen ? ary[index] : null;
}

function subseq<T>(ary: readonly T[], beg: number, len: number): T[] | null {
  if (beg > ary.length || beg < 0 || len < 0) return null;
  return ary.slice(beg, beg + len);
}

/**
 * Ruby `Array#delete_if` (`vendor/ruby/v3.3.11/array.c:4330` `rb_ary_delete_if`):
 * removes, in place, every element the block answers truthily for
 * (`reject_bang_i`, `array.c:4225`) and answers the receiver. When the block
 * raises, the elements not yet visited are kept after the ones already
 * retained (`select_bang_ensure`, `array.c:3841`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function aryDeleteIf<T>(ary: T[], block: (item: T) => unknown): T[] {
  let i1 = 0;
  let i2 = 0;
  try {
    for (; i1 < ary.length; i1++) {
      const v = ary[i1];
      const result = block(v);
      if (result != null && result !== false) continue;
      if (i1 !== i2) {
        ary[i2] = v;
      }
      i2++;
    }
  } finally {
    const len = ary.length;
    if (i2 < len && i2 < i1) {
      let tail = 0;
      if (i1 < len) {
        tail = len - i1;
        ary.copyWithin(i2, i1, len);
      }
      ary.length = i2 + tail;
    }
  }
  return ary;
}

/**
 * Ruby `Array#fetch` (`vendor/ruby/v3.3.11/array.c:1962` `rb_ary_fetch`): the element at
 * `pos`, or out of range the block's value, else the default, else an `IndexError`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function aryFetch(ary: readonly unknown[], ...argv: unknown[]): unknown {
  const blockGiven = rbBlockGivenP(argv[argv.length - 1]);
  const block = blockGiven ? (argv.pop() as (pos: unknown) => unknown) : undefined;
  const argc = argv.length;
  checkArity(argc, 1, 2);
  const [pos, ifnone] = argv;
  if (blockGiven && argc === 2) {
    warn("warning: block supersedes default value argument");
  }
  let idx = num2long(pos);

  if (idx < 0) {
    idx += ary.length;
  }
  if (idx < 0 || ary.length <= idx) {
    if (blockGiven) return block!(pos);
    if (argc === 1) {
      throw new IndexError(
        `index ${idx - (idx < 0 ? ary.length : 0)} outside of array bounds: ${-ary.length}...${ary.length}`,
      );
    }
    return ifnone;
  }
  return ary[idx];
}

/**
 * Ruby `Array#delete` (`vendor/ruby/v3.3.11/array.c:3973` `rb_ary_delete`): removes, in
 * place, every element `==` to `item` (`rb_equal`, so a record matches by
 * `ActiveRecord::Core#==`, not identity) and answers the last one removed.
 * When nothing matched it answers the block's value for `item`, or nil.
 *
 * @noRailsEquivalent PERMANENT
 */
export function aryDelete<T, U = undefined>(ary: T[], item: T, block?: (item: T) => U): T | U {
  let v = item;
  let i2 = 0;
  for (let i1 = 0; i1 < ary.length; i1++) {
    const e = ary[i1];

    if (rbEqual(e, item)) {
      v = e;
      continue;
    }
    if (i1 !== i2) {
      ary[i2] = e;
    }
    i2++;
  }
  if (ary.length === i2) {
    if (block) {
      return block(item);
    }
    return undefined as U;
  }

  ary.length = i2;

  return v;
}

/**
 * Ruby `Array#delete_at` (`vendor/ruby/v3.3.11/array.c:4072` `rb_ary_delete_at_m`,
 * over `rb_ary_delete_at`, `array.c:4027`): removes, in place, the element at
 * `pos` and answers it. A negative `pos` counts back from the end, and one out
 * of range either way answers `nil` and leaves the array alone.
 *
 * @noRailsEquivalent PERMANENT
 */
export function deleteAt<T>(ary: T[], pos: number): T | null {
  pos = num2long(pos);
  const len = ary.length;

  if (pos >= len) return null;
  if (pos < 0) {
    pos += len;
    if (pos < 0) return null;
  }

  const del = ary[pos];
  ary.splice(pos, 1);
  return del;
}

/**
 * Ruby `Array#pop(n)` (`vendor/ruby/v3.3.11/array.c:1437` `rb_ary_pop_m`): removes, in
 * place, the last `n` elements and answers them in order. `n` past the length
 * takes them all, and a negative `n` raises (`ary_take_first_or_last_n`,
 * `array.c:1292-1307`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function aryPop<T>(ary: T[], n: number): T[] {
  const len = ary.length;
  if (n > len) {
    n = len;
  } else if (n < 0) {
    throw new ArgumentError("negative array size");
  }
  return ary.splice(len - n, n);
}

/**
 * Ruby `Array#first` with no argument (`vendor/ruby/v3.3.11/array.c:1901` `ary_first`):
 * the first element, or `nil` for an empty array.
 *
 * @noRailsEquivalent PERMANENT
 */
export function first<T>(ary: readonly T[]): T | undefined {
  return ary[0];
}

/**
 * Ruby `Array#last` (`vendor/ruby/v3.3.11/array.c:1914` `rb_ary_last`): the last
 * element, or `nil` for an empty array (`ary_last`, `array.c:1907`); with `n`,
 * the last `n` elements in order. `n` past the length takes them all, and a
 * negative `n` raises (`ary_take_first_or_last_n`, `array.c:1292-1307`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function last<T>(ary: readonly T[]): T | undefined;
/** @noRailsEquivalent PERMANENT — Ruby core `Array#last` (`vendor/ruby/v3.3.11/array.c:1914`). */
export function last<T>(ary: readonly T[], n: number): T[];
/** @noRailsEquivalent PERMANENT — Ruby core `Array#last` (`vendor/ruby/v3.3.11/array.c:1914`). */
export function last<T>(ary: readonly T[], n?: number): T | undefined | T[] {
  const len = ary.length;
  if (n === undefined) return len === 0 ? undefined : ary[len - 1];
  n = num2long(n);
  if (n > len) {
    n = len;
  } else if (n < 0) {
    throw new ArgumentError("negative array size");
  }
  return ary.slice(len - n);
}

/**
 * Ruby `Array#count` (`vendor/ruby/v3.3.11/array.c:6275` `rb_ary_count`): the number
 * of elements the block answers truthily for (`RTEST`), or the length with no
 * block. The `count(obj)` arm is not ported: nothing calls it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function aryCount<T>(ary: readonly T[], block?: (item: T) => unknown): number {
  if (!block) return ary.length;
  let n = 0;
  for (const v of ary) {
    const result = block(v);
    if (result != null && result !== false) n++;
  }
  return n;
}

/**
 * Ruby `Enumerable#partition` (`vendor/ruby/v3.3.11/enum.c:1102` `enum_partition`):
 * two arrays, the elements the block answers truthily for (`RTEST`,
 * `partition_i`, `:1057`) and all the others.
 *
 * @noRailsEquivalent PERMANENT
 */
export function partition<T>(ary: readonly T[], block: (item: T) => unknown): [T[], T[]] {
  const v1: T[] = [];
  const v2: T[] = [];
  for (const i of ary) {
    const result = block(i);
    (result != null && result !== false ? v1 : v2).push(i);
  }
  return [v1, v2];
}

/**
 * Ruby `Array#each` (`vendor/ruby/v3.3.11/array.c:2532` `rb_ary_each`): yields each
 * element and returns the receiver. With no block it is
 * `RETURN_SIZED_ENUMERATOR` (`:2535`), whose elements are the receiver's.
 *
 * @noRailsEquivalent PERMANENT
 */
export function each<T>(ary: T[], block?: (item: T) => unknown): T[] {
  if (!block) return ary;
  for (const i of ary) {
    block(i);
  }
  return ary;
}

/**
 * Ruby `Enumerable#group_by` (`vendor/ruby/v3.3.11/enum.c:1157` `enum_group_by`): a
 * Hash keyed by the block's result, each value the Array of the elements that
 * produced it, in the receiver's order (`group_by_i`, `:1115`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function groupBy<T, K>(ary: readonly T[], block: (item: T) => K): Hash<K, T[]> {
  const hash = new Hash<K, T[]>();
  for (const i of ary) {
    const group = block(i);
    const values = hash.get(group);
    if (values === undefined) {
      hash.set(group, [i]);
    } else {
      values.push(i);
    }
  }
  return hash;
}

/**
 * Ruby `Array#to_h` with no block (`vendor/ruby/v3.3.11/array.c:2988` `rb_ary_to_h`):
 * a Hash of the receiver's `[key, value]` pairs. The block arm is not ported:
 * nothing calls it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toH<K = unknown, V = unknown>(ary: readonly unknown[]): Hash<K, V> {
  const hash = new Hash<K, V>();
  for (let i = 0; i < ary.length; i++) {
    const keyValuePair = ary[i];
    if (!Array.isArray(keyValuePair)) {
      throw new TypeError(
        `wrong element type ${rbBuiltinClassName(keyValuePair)} at ${i} (expected array)`,
      );
    }
    if (keyValuePair.length !== 2) {
      throw new ArgumentError(
        `wrong array length at ${i} (expected 2, was ${keyValuePair.length})`,
      );
    }
    hash.set(keyValuePair[0], keyValuePair[1]);
  }
  return hash;
}

/**
 * Ruby `Array#zip` with no block (`vendor/ruby/v3.3.11/array.c:4422` `rb_ary_zip`):
 * one array per receiver element, holding it and the element at the same
 * index of each argument, `nil` past an argument's end. The arguments are
 * Arrays: `take_items`' `to_ary` / `each` conversion (`:4349`) and the block
 * arm are not ported, as nothing calls them.
 *
 * @noRailsEquivalent PERMANENT
 */
export function zip<T, U>(ary: readonly T[], ...argv: (readonly U[])[]): (T | U | undefined)[][] {
  const result: (T | U | undefined)[][] = [];
  for (let i = 0; i < ary.length; i++) {
    const tmp: (T | U | undefined)[] = [ary[i]];
    for (let j = 0; j < argv.length; j++) {
      tmp.push(argv[j][i]);
    }
    result.push(tmp);
  }
  return result;
}

/**
 * Ruby `Array#to_a` (`vendor/ruby/v3.3.11/array.c:2952` `rb_ary_to_a`): the receiver
 * itself, or a plain-Array copy of an instance of an Array subclass.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toA<T>(ary: T[]): T[] {
  if (ary.constructor !== Array) {
    const dup: T[] = [];
    dup.push(...ary);
    return dup;
  }
  return ary;
}

/**
 * Ruby `Array#take` (`vendor/ruby/v3.3.11/array.c:7532` `rb_ary_take`): the first `n` elements.
 * @noRailsEquivalent PERMANENT
 */
export function take<T>(ary: readonly T[], n: number): T[] {
  const len = num2long(n);
  if (len < 0) throw new ArgumentError("attempt to take negative size");
  return ary.slice(0, len);
}

/**
 * Ruby `Array#drop` (`vendor/ruby/v3.3.11/array.c:7594` `rb_ary_drop`): every element
 * after the first `n`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function drop<T>(ary: readonly T[], n: number): T[] {
  const pos = n;
  if (pos < 0) {
    throw new ArgumentError("attempt to drop negative size");
  }
  return ary.slice(pos);
}

/**
 * Ruby `Array#compact` (`vendor/ruby/v3.3.11/array.c:6240` `rb_ary_compact`): a new
 * array with every `nil` element removed.
 * @noRailsEquivalent PERMANENT — Ruby core `Array#compact`
 *   (`vendor/ruby/v3.3.11/array.c:6240`).
 */
export function compact<T>(ary: readonly T[]): Array<NonNullable<T>> {
  return ary.filter((element) => element != null);
}

/**
 * Ruby `Array#compact!` (`vendor/ruby/v3.3.11/array.c:6207` `rb_ary_compact_bang`):
 * removes every `nil` element in place, answering the array, or `nil` when
 * none was removed.
 *
 * @noRailsEquivalent PERMANENT
 */
export function compactBang<T>(ary: T[]): T[] | null {
  let p = 0;
  for (let t = 0; t < ary.length; t++) {
    if (ary[t] != null) ary[p++] = ary[t];
  }
  if (ary.length === p) return null;
  ary.length = p;
  return ary;
}

/**
 * `rb_check_array_type` (`vendor/ruby/v3.3.11/array.c:975`, over
 * `rb_check_convert_type_with_id`, `vendor/ruby/v3.3.11/object.c:3184`): an
 * Array, its `to_ary`, or nil. A `to_ary` answering anything else raises.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbCheckArrayType(ary: unknown): unknown[] | null {
  if (Array.isArray(ary)) return ary;
  const toAry = (ary as { toAry?: unknown } | null)?.toAry;
  if (typeof toAry !== "function") return null;
  const v: unknown = toAry.call(ary);
  if (v == null) return null;
  if (!Array.isArray(v)) conversionMismatch(ary, "Array", "to_ary", v);
  return v;
}

/** `rb_check_to_array` (`vendor/ruby/v3.3.11/array.c:981`): the receiver's `to_a`, or nil. */
function rbCheckToArray(ary: unknown): unknown[] | null {
  if (ary == null) return [];
  if (ary instanceof Map) return [...ary.entries()];
  if (ary instanceof Set) return [...ary.values()];
  if (typeof ary !== "object") return null;
  const toA = (ary as { toA?: unknown }).toA;
  if (typeof toA === "function") {
    const v: unknown = toA.call(ary);
    if (v == null) return null;
    if (!Array.isArray(v)) conversionMismatch(ary, "Array", "to_a", v);
    return v;
  }
  const proto: unknown = Object.getPrototypeOf(ary);
  if (proto === Object.prototype || proto === null) return Object.entries(ary);
  return null;
}

/**
 * `Kernel#Array` (`rb_f_array`, `vendor/ruby/v3.3.11/object.c:3825`, over
 * `rb_Array`, `vendor/ruby/v3.3.11/object.c:3791`): the
 * argument's `to_ary`, else its `to_a`, else the argument in a one-element
 * Array.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbFArray(val: unknown): unknown[] {
  let tmp = rbCheckArrayType(val);

  if (tmp === null) {
    tmp = rbCheckToArray(val);
    if (tmp === null) {
      return [val];
    }
  }
  return tmp;
}

/**
 * Ruby `Array#flatten` with no level (`vendor/ruby/v3.3.11/array.c:6476`
 * `rb_ary_flatten`, over `flatten`, `array.c:6305`): every element that
 * answers {@link rbCheckArrayType} is replaced by its own flattened elements,
 * and an array reached again on its own path raises.
 *
 * @noRailsEquivalent PERMANENT
 */
export function flatten(ary: readonly unknown[]): unknown[] {
  const result: unknown[] = [];
  const memo = new Set<unknown>([ary]);
  const walk = (level: readonly unknown[]): void => {
    for (const elt of level) {
      const tmp = rbCheckArrayType(elt);
      if (tmp === null) {
        result.push(elt);
        continue;
      }
      if (memo.has(tmp)) throw new ArgumentError("tried to flatten recursive array");
      memo.add(tmp);
      walk(tmp);
      memo.delete(tmp);
    }
  };
  walk(ary);
  return result;
}

/**
 * Ruby `Array#uniq` (`vendor/ruby/v3.3.11/array.c:6177` `rb_ary_uniq`): the elements in
 * order, deduplicated through `ary_make_hash` (`array.c:5342`) — a Hash, so it
 * keys on `hash`/`eql?`, never `==` or identity: `1` and `1n` collapse the way
 * Ruby's `1` and `1` do, a tuple is `eql?` by its elements, and a value whose
 * class defines only `==` stays distinct.
 * @noRailsEquivalent PERMANENT — Ruby core `Array#uniq`
 *   (`vendor/ruby/v3.3.11/array.c:6177`).
 */
export function uniq<T>(ary: readonly T[]): T[] {
  const hash = new Map<number, T[]>();
  const result: T[] = [];
  for (const element of ary) {
    const key = rbHash(element);
    const bucket = hash.get(key) ?? [];
    if (bucket.some((seen) => rbEql(seen, element))) continue;
    bucket.push(element);
    hash.set(key, bucket);
    result.push(element);
  }
  return result;
}

/**
 * Ruby `Array#include?` (`vendor/ruby/v3.3.11/array.c:5222` `rb_ary_includes`):
 * whether an element is `==` to `item`. Each element is the receiver of the
 * `rb_equal` send, so a class's own `==` answers where a JS `includes`
 * compares identity.
 *
 * @noRailsEquivalent PERMANENT
 */
export function aryIncludes<T>(ary: readonly T[], item: unknown): boolean {
  for (let i = 0; i < ary.length; i++) {
    const e = ary[i];
    if (rbEqual(e, item)) {
      return true;
    }
  }
  return false;
}

/**
 * Ruby `Array#|` (`vendor/ruby/v3.3.11/array.c:5600` `rb_ary_or`): `ary1`'s
 * elements then `ary2`'s, deduplicated across both the way `uniq` is — by
 * `hash`/`eql?` (`rb_ary_union`, `array.c:5562`), so two separately built
 * `eql?` tuples or Hashes collapse where a JS `includes` would keep both.
 * @noRailsEquivalent PERMANENT — Ruby core `Array#|`
 *   (`vendor/ruby/v3.3.11/array.c:5600`).
 */
export function union<T>(ary1: readonly T[], ary2: readonly T[]): T[] {
  return uniq([...ary1, ...ary2]);
}

/**
 * Ruby `Array#intersect?` (`vendor/ruby/v3.3.11/array.c:5680` `rb_ary_intersect_p`):
 * whether the two arrays share an element, compared by `eql?` as
 * `rb_ary_includes_by_eql` does. An empty array on either side answers false.
 * @noRailsEquivalent PERMANENT — Ruby core `Array#intersect?`
 *   (`vendor/ruby/v3.3.11/array.c:5680`).
 */
export function isIntersect<T>(ary1: readonly T[], ary2: readonly T[]): boolean {
  if (ary1.length === 0 || ary2.length === 0) return false;
  for (const v of ary1) {
    if (ary2.some((e) => rbEql(e, v))) return true;
  }
  return false;
}

/**
 * Ruby `Array#sort` without a block (`vendor/ruby/v3.3.11/array.c:3473` `rb_ary_sort`):
 * a sorted copy, ordered by `sort_2` (`array.c:3301`), which sends `<=>` and
 * hands the answer to `rb_cmpint`, so a `nil` `<=>` raises
 * `ArgumentError: comparison of A with B failed`.
 *
 * @boundary: `ruby_qsort` (`vendor/ruby/v3.3.11/util.c:253`) is the platform `qsort_s`,
 *  glibc's merge sort, which always passes the earlier element first. V8's
 *  `Array#sort` does not, and the order names the classes in the message, so
 *  the merge is written out.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Array#sort` (`vendor/ruby/v3.3.11/array.c:3473`).
 */
export function sort<T>(ary: readonly T[]): T[] {
  const sort2 = (a: T, b: T): number => rbCmpint(cmp(a, b), a, b);
  const msort = (b: T[]): T[] => {
    if (b.length <= 1) return b;
    const n1 = b.length >> 1;
    const b1 = msort(b.slice(0, n1));
    const b2 = msort(b.slice(n1));
    const tmp: T[] = [];
    let i = 0;
    let j = 0;
    while (i < b1.length && j < b2.length) {
      tmp.push(sort2(b1[i], b2[j]) <= 0 ? b1[i++] : b2[j++]);
    }
    return tmp.concat(b1.slice(i), b2.slice(j));
  };
  return msort([...ary]);
}
