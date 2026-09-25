import { rbEql, rbEqual } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";
import { ArgumentError } from "./argument-error.js";
import { cmp, rbCmpint } from "./comparable.js";
import { rbBuiltinClassName } from "./object.js";
import { Range } from "./range.js";
import { TypeError } from "./type-error.js";

/** `toofew` (`vendor/ruby/pack.c:120`). */
const toofew = "too few arguments";

/** `endstr` (`vendor/ruby/pack.c:42`), the types `<` / `>` may follow. */
const endstr = "sSiIlLqQjJ";

/** `b64_table` (`vendor/ruby/pack.c:789`). */
const b64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** `unknown_directive` (`vendor/ruby/pack.c:160`). */
function unknownDirective(mode: string, type: string, fmt: string): never {
  throw new ArgumentError(`unknown ${mode} directive '${type}' in '${fmt}'`);
}

/**
 * `encodes` (`vendor/ruby/pack.c:791`) for `type == 'm'` — `len` bytes of `s0`
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
 * `pack_pack` (`vendor/ruby/pack.c:197`), narrowed to the `m` directive
 * (`pack.c:663-690`) — Base64, wrapped at `len` input bytes per line, or
 * strict with no line breaks at all when the count is an explicit `0`. `m0` is
 * what `Rack::Test::Session#basic_authorize` packs with
 * (`vendor/rack-test/lib/rack/test.rb:199`) — and to `U` (`pack.c:645-660`),
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
 * (`vendor/ruby/pack.c:197`).
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
      const bigendianP = explicitEndian === ">";
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
 * `String#unpack1` (`vendor/ruby/pack.c:1621` `pack_unpack1`), which is
 * `pack_unpack_internal` (`pack.c:936`) in `UNPACK_1` mode: the first item
 * the format pushes, or nil when none does. Narrowed to the directives
 * {@link pack} answers bytes for — `C` and `l` through `unpack_integer`
 * (`pack.c:1177-1281`), `E` (`pack.c:1306-1315`), and `@` moving to an
 * absolute byte position (`pack.c:1531-1535`) — plus the `<` / `>` modifiers
 * (`pack.c:1014-1023`). Every other directive reaches `unknown_directive`.
 *
 * `str` is read as bytes, one code unit per byte, as {@link pack} writes them.
 * `PACK_LENGTH_ADJUST_SIZE` (`pack.c:904-912`) caps a count at what the rest
 * of the string holds, so an item short of bytes pushes nothing.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `String#unpack1`
 * (`vendor/ruby/pack.c:1621`).
 */
export function unpack1(
  str: string,
  fmt: string,
  { offset = 0 }: { offset?: number } = {},
): number | null {
  if (offset < 0) throw new ArgumentError("offset can't be negative");
  const send = str.length;
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
      const bigendianP = explicitEndian === ">";
      if (len > Math.floor((send - s) / integerSize)) len = Math.floor((send - s) / integerSize);
      if (len > 0) {
        let val = 0n;
        for (let i = 0; i < integerSize; i++) {
          const byte = BigInt(str.charCodeAt(bigendianP ? s + i : s + integerSize - 1 - i) & 0xff);
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
        for (let i = 0; i < 8; i++) tmp.setUint8(i, str.charCodeAt(s + i) & 0xff);
        return tmp.getFloat64(0, true);
      }
      continue;
    }
    if (type === "@") {
      if (len > str.length) throw new ArgumentError("@ outside of string");
      s = len;
      continue;
    }
    unknownDirective("unpack", type, fmt);
  }

  return null;
}

/**
 * Ruby `Array#slice` / `Array#[]` (`vendor/ruby/array.c:1827` `rb_ary_aref`):
 * `(index)` answers the element or nil, `(start, length)` a subarray
 * (`rb_ary_aref2`, `:1837`), and a Range a subarray through
 * `rb_range_beg_len` (`vendor/ruby/range.c:1744`); an out-of-range start is nil.
 * @noRailsEquivalent PERMANENT
 */
export function arySlice<T>(
  ary: readonly T[],
  arg: number | Range<number>,
  length?: number,
): T | T[] | null {
  const argc = arguments.length - 1;
  if (argc < 1 || argc > 2) {
    throw new ArgumentError(`wrong number of arguments (given ${argc}, expected 1..2)`);
  }
  const alen = ary.length;
  if (arg == null || (argc === 2 && length == null)) {
    throw new TypeError("no implicit conversion from nil to integer");
  }
  if (argc === 2) {
    let beg = arg as number;
    if (beg < 0) beg += alen;
    return subseq(ary, beg, length!);
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
  const index = arg < 0 ? arg + alen : arg;
  return index >= 0 && index < alen ? ary[index] : null;
}

function subseq<T>(ary: readonly T[], beg: number, len: number): T[] | null {
  if (beg > ary.length || beg < 0 || len < 0) return null;
  return ary.slice(beg, beg + len);
}

/**
 * Ruby `Array#delete` (`vendor/ruby/array.c:3973` `rb_ary_delete`): removes, in
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
 * Ruby `Array#pop(n)` (`vendor/ruby/array.c:1437` `rb_ary_pop_m`): removes, in
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
 * Ruby `Array#first` with no argument (`vendor/ruby/array.c:1901` `ary_first`):
 * the first element, or `nil` for an empty array.
 *
 * @noRailsEquivalent PERMANENT
 */
export function first<T>(ary: readonly T[]): T | undefined {
  return ary[0];
}

/**
 * Ruby `Array#to_a` (`vendor/ruby/array.c:2952` `rb_ary_to_a`): the receiver
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
 * Ruby `Array#drop` (`vendor/ruby/array.c:7594` `rb_ary_drop`): every element
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
 * Ruby `Array#compact` (`vendor/ruby/array.c:6240` `rb_ary_compact`): a new
 * array with every `nil` element removed.
 * @noRailsEquivalent PERMANENT — Ruby core `Array#compact`
 *   (`vendor/ruby/array.c:6240`).
 */
export function compact<T>(ary: readonly T[]): Array<NonNullable<T>> {
  return ary.filter((element) => element != null);
}

/**
 * Ruby `Array#uniq` (`vendor/ruby/array.c:6177` `rb_ary_uniq`): the elements in
 * order, deduplicated through `ary_make_hash` (`array.c:5342`) — a Hash, so it
 * keys on `hash`/`eql?`, never `==` or identity: `1` and `1n` collapse the way
 * Ruby's `1` and `1` do, a tuple is `eql?` by its elements, and a value whose
 * class defines only `==` stays distinct.
 * @noRailsEquivalent PERMANENT — Ruby core `Array#uniq`
 *   (`vendor/ruby/array.c:6177`).
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
 * Ruby `Array#sort` without a block (`vendor/ruby/array.c:3473` `rb_ary_sort`):
 * a sorted copy, ordered by `sort_2` (`array.c:3301`), which sends `<=>` and
 * hands the answer to `rb_cmpint`, so a `nil` `<=>` raises
 * `ArgumentError: comparison of A with B failed`.
 *
 * @boundary: `ruby_qsort` (`vendor/ruby/util.c:253`) is the platform `qsort_s`,
 *  glibc's merge sort, which always passes the earlier element first. V8's
 *  `Array#sort` does not, and the order names the classes in the message, so
 *  the merge is written out.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Array#sort` (`vendor/ruby/array.c:3473`).
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
