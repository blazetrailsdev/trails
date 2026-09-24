import { rbEql, rbEqual } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";
import { ArgumentError } from "./argument-error.js";
import { Range } from "./range.js";
import { TypeError } from "./type-error.js";

/** `toofew` (`vendor/ruby/pack.c:120`). */
const toofew = "too few arguments";

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
 * (`vendor/rack-test/lib/rack/test.rb:199`). Every other directive is a
 * separate port, so each reaches `unknown_directive` (`pack.c:761`) here.
 *
 * The argument is read as bytes, one code unit per byte — ruby-compat's
 * ASCII-8BIT convention — as `pack.c:663-690` reads `RSTRING_PTR` with no
 * re-encoding. A caller holding a UTF-8 String passes its `String#b`.
 *
 * `*` is `1` for the `PMm` types rather than the array remainder
 * (`pack.c:281-284`), so `m*` is `m`. The `u`-only `len > 63` clamp
 * (`pack.c:676`) is not reachable without that directive.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Array#pack`
 * (`vendor/ruby/pack.c:197`).
 */
export function pack(ary: ReadonlyArray<string>, fmt: string): string {
  const res: string[] = [];
  let p = 0;
  const pend = fmt.length;
  let idx = 0;

  const nextfrom = (): string => {
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

    let len: number;
    if (fmt[p] === "*") {
      len = 1;
      p++;
    } else if (fmt[p] >= "0" && fmt[p] <= "9") {
      let digits = "";
      while (fmt[p] >= "0" && fmt[p] <= "9") digits += fmt[p++];
      len = Number(digits);
    } else {
      len = 1;
    }

    if (type !== "m") unknownDirective("pack", type, fmt);

    const from = nextfrom();
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
 * Ruby `Array#first` with no argument (`vendor/ruby/array.c:1901` `ary_first`):
 * the first element, or `nil` for an empty array.
 *
 * @noRailsEquivalent PERMANENT
 */
export function first<T>(ary: readonly T[]): T | undefined {
  return ary[0];
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
