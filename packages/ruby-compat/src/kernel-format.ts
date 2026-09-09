import { ArgumentError } from "./argument-error.js";
import { FloatDomainError } from "./float-domain-error.js";
import { Hash } from "./hash.js";
import { KeyError } from "./key-error.js";
import { kernelFloat } from "./kernel-float.js";
import { kernelInteger } from "./kernel-integer.js";
import { rbBuiltinClassName, rbInspect, rbObjAsString } from "./object.js";
import { TypeError as RbTypeError } from "./type-error.js";

const FNONE = 0;
const FSHARP = 1;
const FMINUS = 2;
const FPLUS = 4;
const FZERO = 8;
const FSPACE = 16;
const FWIDTH = 32;
const FPREC = 64;
const FPREC0 = 128;

const DEFAULT_FLOAT_PRECISION = 6;

/**
 * `sign_bits` (`vendor/ruby/sprintf.c:41`) — the digit a negative two's
 * complement conversion pads with.
 */
function signBits(base: number, p: string): string {
  switch (base) {
    case 16:
      return p === "X" ? "F" : "f";
    case 8:
      return "7";
    case 2:
      return "1";
    default:
      return ".";
  }
}

/** `check_next_arg` (`vendor/ruby/sprintf.c:155`). */
function checkNextArg(posarg: number, nextarg: number): void {
  if (posarg === -1) {
    throw new ArgumentError(`unnumbered(${nextarg}) mixed with numbered`);
  }
  if (posarg === -2) {
    throw new ArgumentError(`unnumbered(${nextarg}) mixed with named`);
  }
}

/** `check_pos_arg` (`vendor/ruby/sprintf.c:167`). */
function checkPosArg(posarg: number, n: number): void {
  if (posarg > 0) throw new ArgumentError(`numbered(${n}) after unnumbered(${posarg})`);
  if (posarg === -2) throw new ArgumentError(`numbered(${n}) after named`);
  if (n < 1) throw new ArgumentError(`invalid index - ${n}$`);
}

/** `check_name_arg` (`vendor/ruby/sprintf.c:181`). */
function checkNameArg(posarg: number, name: string): void {
  if (posarg > 0) throw new ArgumentError(`named${name} after unnumbered(${posarg})`);
  if (posarg === -1) throw new ArgumentError(`named${name} after numbered`);
}

/**
 * `rb_str_format` (`vendor/ruby/sprintf.c:212`) — the body of Ruby's
 * `Kernel#format` and its `Kernel#sprintf` alias
 * (`vendor/ruby/sprintf.c:206`).
 *
 * The scanner, its flag/width/precision validation, the integer conversions
 * and the `%f` digit assembly are ported line for line from that file; the
 * `%e` / `%g` / `%a` conversions, which MRI hands to `BSD__dtoa` through
 * `fmt_setup` (`sprintf.c:918`, `vendor/ruby/vsnprintf.c:903`), are rendered
 * from the same exact decimal expansion this file computes for `%f`, so all
 * of them round half to even the way the C library does rather than the way
 * `Number#toFixed` does.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#format`
 * (`vendor/ruby/sprintf.c:206`), which Rails calls without defining, so there
 * is no Ruby file in any gem for the port to mirror.
 */
export function format(fmt: string, ...argv: unknown[]): string {
  let buf = "";
  let flags = FNONE;
  let width: number;
  let prec: number;
  let nextarg = 1;
  let posarg = 0;
  let nextvalue: unknown = UNDEF;
  let hash: Record<string, unknown> | Map<unknown, unknown> | undefined;
  const end = fmt.length;

  const getNthArg = (nth: number): unknown => {
    if (nth >= argv.length + 1) throw new ArgumentError("too few arguments");
    return argv[nth - 1];
  };
  const getNextArg = (): unknown => {
    checkNextArg(posarg, nextarg);
    posarg = nextarg++;
    return getNthArg(posarg);
  };
  const getPosArg = (n: number): unknown => {
    checkPosArg(posarg, n);
    posarg = -1;
    return getNthArg(n);
  };
  const getArg = (): unknown => (nextvalue !== UNDEF ? nextvalue : getNextArg());
  const getHash = (): Record<string, unknown> | Map<unknown, unknown> => {
    if (hash !== undefined) return hash;
    if (argv.length !== 1) throw new ArgumentError("one hash required");
    const tmp = argv[0];
    if (tmp instanceof Map) return (hash = tmp);
    if (typeof tmp !== "object" || tmp === null || Array.isArray(tmp)) {
      throw new ArgumentError("one hash required");
    }
    return (hash = tmp as Record<string, unknown>);
  };
  const checkForWidth = (): void => {
    if (flags & FWIDTH) throw new ArgumentError("width given twice");
    if (flags & FPREC0) throw new ArgumentError("width after precision");
  };
  const checkForFlags = (): void => {
    if (flags & FWIDTH) throw new ArgumentError("flag after width");
    if (flags & FPREC0) throw new ArgumentError("flag after precision");
  };

  let p = 0;
  for (; p < end; p++) {
    let t = p;
    for (; t < end && fmt[t] !== "%"; t++);
    if (t + 1 === end) {
      throw new ArgumentError("incomplete format specifier; use %% (double %) instead");
    }
    buf += fmt.slice(p, t);
    if (t >= end) break;
    p = t + 1;

    width = prec = -1;
    nextvalue = UNDEF;
    let sym: string | undefined;

    retry: for (;;) {
      const c = fmt[p];
      switch (c) {
        case " ":
          checkForFlags();
          flags |= FSPACE;
          p++;
          continue retry;
        case "#":
          checkForFlags();
          flags |= FSHARP;
          p++;
          continue retry;
        case "+":
          checkForFlags();
          flags |= FPLUS;
          p++;
          continue retry;
        case "-":
          checkForFlags();
          flags |= FMINUS;
          p++;
          continue retry;
        case "0":
          checkForFlags();
          flags |= FZERO;
          p++;
          continue retry;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          const [n, after] = getNum(fmt, p, 0, "width");
          p = after;
          if (fmt[p] === "$") {
            if (nextvalue !== UNDEF) throw new ArgumentError(`value given twice - ${n}$`);
            nextvalue = getPosArg(n);
            p++;
            continue retry;
          }
          checkForWidth();
          width = n;
          flags |= FWIDTH;
          continue retry;
        }
        case "<":
        case "{": {
          const start = p;
          const term = c === "<" ? ">" : "}";
          const close = fmt.indexOf(term, p);
          if (close < 0) throw new ArgumentError("malformed name - unmatched parenthesis");
          p = close;
          const name = fmt.slice(start, p + 1);
          if (sym !== undefined) throw new ArgumentError(`named${name} after <${sym}>`);
          checkNameArg(posarg, name);
          posarg = -2;
          sym = fmt.slice(start + 1, p);
          const namedHash = getHash();
          nextvalue = hashLookup(namedHash, sym);
          if (nextvalue === UNDEF) {
            nextvalue = hashDefaultValue(namedHash, sym);
            if (nextvalue == null) throw new KeyError(`key${name} not found`);
          }
          if (term === "}") {
            buf += formatS(getArg(), "s", flags, width, prec);
            break retry;
          }
          p++;
          continue retry;
        }
        case "*": {
          checkForWidth();
          flags |= FWIDTH;
          const [n, after] = getAster(fmt, p, getPosArg, getNextArg);
          p = after;
          width = n;
          if (width < 0) {
            flags |= FMINUS;
            width = -width;
          }
          p++;
          continue retry;
        }
        case ".": {
          if (flags & FPREC0) throw new ArgumentError("precision given twice");
          flags |= FPREC | FPREC0;
          prec = 0;
          p++;
          if (fmt[p] === "*") {
            const [n, after] = getAster(fmt, p, getPosArg, getNextArg);
            p = after;
            prec = n;
            if (prec < 0) flags &= ~FPREC;
            p++;
            continue retry;
          }
          const [n, after] = getNum(fmt, p, prec, "precision");
          prec = n;
          p = after;
          continue retry;
        }
        case "\n":
        case "\0":
        case undefined:
        case "%":
          if (c !== "%") p--;
          if (flags !== FNONE) throw new ArgumentError("invalid format character - %");
          buf += "%";
          break retry;
        case "c":
          buf += formatC(getArg(), flags, width);
          break retry;
        case "s":
        case "p":
          buf += formatS(getArg(), c, flags, width, prec);
          break retry;
        case "d":
        case "i":
        case "o":
        case "x":
        case "X":
        case "b":
        case "B":
        case "u":
          buf += formatInteger(getArg(), c, flags, width, prec);
          break retry;
        case "f":
        case "e":
        case "E":
        case "g":
        case "G":
        case "a":
        case "A":
          buf += formatFloat(getArg(), c, flags, width, prec);
          break retry;
        default:
          if (/[ -~]/.test(c)) throw new ArgumentError(`malformed format string - %${c}`);
          throw new ArgumentError("malformed format string");
      }
    }
    flags = FNONE;
  }
  return buf;
}

/**
 * `Kernel#sprintf` (`vendor/ruby/sprintf.c:206`), the alias `Kernel#format` is
 * defined from — the same C function under both names.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#sprintf`, which Rails calls
 * without defining.
 */
export const sprintf = format;

const UNDEF = Symbol("Qundef");

/** `get_num` (`vendor/ruby/sprintf.c:138`), under the `GETNUM` (`:130`) that raises for it. */
function getNum(fmt: string, p: number, nextN: number, val: string): [number, number] {
  for (; p < fmt.length && fmt[p] >= "0" && fmt[p] <= "9"; p++) {
    nextN = nextN * 10 + (fmt.charCodeAt(p) - 48);
    if (nextN > 0x7fffffff) throw new ArgumentError(`${val} too big`);
  }
  if (p >= fmt.length) throw new ArgumentError("malformed format string - %*[0-9]");
  return [nextN, p];
}

/** `GETASTER` (`vendor/ruby/sprintf.c:135`). */
function getAster(
  fmt: string,
  p: number,
  getPosArg: (n: number) => unknown,
  getNextArg: () => unknown,
): [number, number] {
  const [n, after] = getNum(fmt, p + 1, 0, "width");
  if (fmt[after] === "$") return [num2int(getPosArg(n)), after];
  return [num2int(getNextArg()), p];
}

/**
 * The `%<name>` / `%{name}` lookup — `rb_hash_lookup2(hash, sym, Qundef)`
 * (`vendor/ruby/sprintf.c:403`). The key is the Symbol `:name`, never the
 * String `"name"`, so a String-keyed hash raises `KeyError` here exactly as it
 * does in Ruby.
 */
function hashLookup(hash: Record<string, unknown> | Map<unknown, unknown>, name: string): unknown {
  const sym = `:${name}`;
  if (hash instanceof Map) return hash.has(sym) ? hash.get(sym) : UNDEF;
  return Object.hasOwn(hash, sym) ? hash[sym] : UNDEF;
}

/**
 * `rb_hash_default_value(hash, sym)` (`vendor/ruby/hash.c:2068`), the arm
 * `%<name>` takes before it raises (`vendor/ruby/sprintf.c:388`): a
 * `Hash.new(0)` answers `0` for a missing key and a `Hash.new { … }` runs its
 * block, so only a `nil` default reaches the `KeyError`. A plain object and a
 * bare `Map` have nowhere to store a default, so they have none.
 */
function hashDefaultValue(
  hash: Record<string, unknown> | Map<unknown, unknown>,
  name: string,
): unknown {
  return hash instanceof Hash ? hash.default(`:${name}`) : undefined;
}

/** `NUM2INT` — `rb_num2int` (`vendor/ruby/numeric.c:3241`). */
function num2int(val: unknown): number {
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "number") {
    if (!Number.isFinite(val)) throw new FloatDomainError(String(val));
    return Math.trunc(val);
  }
  throw new RbTypeError(`no implicit conversion from ${rbBuiltinClassName(val)} to integer`);
}

/** The `'c'` conversion (`vendor/ruby/sprintf.c:449`). */
function formatC(val: unknown, flags: number, width: number): string {
  let str: string;
  if (typeof val === "string") {
    str = [...val].slice(0, 1).join("");
  } else {
    const n = num2int(val);
    if (n < 0 || n > 0x10ffff) throw new ArgumentError("invalid character");
    str = String.fromCodePoint(n);
  }
  if (!(flags & FWIDTH)) return str;
  const fill = " ".repeat(Math.max(width - 1, 0));
  return flags & FMINUS ? str + fill : fill + str;
}

/** The `'s'` / `'p'` conversions (`vendor/ruby/sprintf.c:489`). */
function formatS(val: unknown, conv: string, flags: number, width: number, prec: number): string {
  let str = conv === "p" ? rbInspect(val) : rbObjAsString(val);
  if (flags & FPREC) {
    const chars = [...str];
    if (prec < chars.length) str = chars.slice(0, prec).join("");
  }
  if (flags & FWIDTH) {
    const slen = [...str].length;
    if (width > slen) {
      const fill = " ".repeat(width - slen);
      return flags & FMINUS ? str + fill : fill + str;
    }
  }
  return str;
}

/**
 * `bin_retry` (`vendor/ruby/sprintf.c:589`) — the argument of an integer
 * conversion is a Float truncated toward zero, a String read by
 * `rb_str_to_inum` with base 0 and `badcheck` true, or anything else put
 * through `rb_Integer`.
 */
function toInteger(val: unknown): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val === "number" && Number.isInteger(val) && Number.isSafeInteger(val)) {
    return BigInt(val);
  }
  return BigInt(kernelInteger(val));
}

/**
 * The `'d'`/`'i'`/`'u'`/`'o'`/`'x'`/`'X'`/`'b'`/`'B'` conversions
 * (`vendor/ruby/sprintf.c:541`), including the `..` two's complement form a
 * negative value takes in a non-decimal base without a sign flag
 * (`vendor/ruby/sprintf.c:659`).
 */
function formatInteger(
  val: unknown,
  conv: string,
  flags: number,
  width: number,
  prec: number,
): string {
  let sign = 0;
  if ("diu".includes(conv)) sign = 1;
  else if (flags & (FPLUS | FSPACE)) sign = 1;

  let prefix =
    flags & FSHARP
      ? ({ o: "0", x: "0x", X: "0X", b: "0b", B: "0B" }[conv as "o" | "x" | "X" | "b" | "B"] ?? "")
      : "";

  const v = toInteger(val);
  const base = conv === "o" ? 8 : conv === "x" || conv === "X" ? 16 : "bB".includes(conv) ? 2 : 10;

  let s: string;
  let sc = "";
  let dots = false;
  let valsign = 1;
  if (base !== 10 && !sign && v < 0n) {
    const top = (base - 1).toString(base);
    let places = 1;
    for (;;) {
      const modulus = BigInt(base) ** BigInt(places);
      if (v + modulus >= 0n) {
        const digits = (v + modulus).toString(base).padStart(places, "0");
        if (digits[0] === top) {
          s = digits;
          break;
        }
      }
      places++;
    }
    valsign = -1;
    dots = true;
  } else {
    if (v < 0n) {
      sc = "-";
      width--;
      valsign = -1;
    } else if (flags & FPLUS) {
      sc = "+";
      width--;
    } else if (flags & FSPACE) {
      sc = " ";
      width--;
    }
    s = (v < 0n ? -v : v).toString(base);
  }
  let len = s.length;

  if (dots) {
    prec -= 2;
    width -= 2;
  }
  if (conv === "X") s = s.toUpperCase();

  if (prefix.length === 1) {
    if (dots) prefix = "";
    else if (len === 1 && s === "0") {
      len = 0;
      if (flags & FPREC) prec--;
    } else if (flags & FPREC && prec > len) prefix = "";
  } else if (len === 1 && s === "0") {
    prefix = "";
  }
  if (prefix) width -= prefix.length;

  if ((flags & (FZERO | FMINUS | FPREC)) === FZERO) {
    prec = width;
    width = 0;
  } else {
    if (prec < len) {
      if (!prefix && prec === 0 && len === 1 && s === "0") len = 0;
      prec = len;
    }
    width -= prec;
  }
  let out = "";
  if (!(flags & FMINUS)) {
    out += " ".repeat(Math.max(width, 0));
    width = 0;
  }
  out += sc;
  out += prefix;
  if (dots) out += "..";
  if (prec > len) {
    if (!sign && valsign < 0) out += signBits(base, conv).repeat(prec - len);
    else if ((flags & (FMINUS | FPREC)) !== FMINUS) out += "0".repeat(prec - len);
  }
  out += s.slice(0, len);
  return out + " ".repeat(Math.max(width, 0));
}

/**
 * The exact decimal expansion of a finite double: `|x| = 0.digits * 10 ** exp`.
 *
 * A double is a binary rational, so its decimal expansion terminates and can
 * be written down exactly — which is what `BSD__dtoa`
 * (`vendor/ruby/util.c:1108`) does for the C library conversions this file
 * stands in for. `Number#toFixed` and `Number#toExponential` cannot be used
 * for them: they round half away from zero and fall back to exponent notation
 * above 1e21.
 */
function exactDecimal(x: number): { digits: string; exp: number } {
  if (x === 0) return { digits: "", exp: 0 };
  const { m, exp2 } = decompose(x);
  if (exp2 >= 0) {
    const digits = (m << BigInt(exp2)).toString();
    return { digits, exp: digits.length };
  }
  const digits = (m * 5n ** BigInt(-exp2)).toString();
  return { digits, exp: digits.length + exp2 };
}

/**
 * `|x| = m * 2 ** exp2` — the IEEE 754 fields `word0` / `word1`
 * (`vendor/ruby/missing/dtoa.c:2740`) read for a finite, non-zero double.
 */
function decompose(x: number): { m: bigint; exp2: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const hi = view.getUint32(0);
  const biased = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(view.getUint32(4));
  return {
    m: biased === 0 ? frac : frac | (1n << 52n),
    exp2: (biased === 0 ? 1 : biased) - 1075,
  };
}

/**
 * Round an {@link exactDecimal} to `keep` leading digits, half to even — the
 * rounding mode `BSD__dtoa` uses (`vendor/ruby/util.c:1379`), and the reason
 * `%.0f` of `2.5` is `2` where `(2.5).toFixed(0)` is `3`.
 */
function roundAt(digits: string, exp: number, keep: number): { digits: string; exp: number } {
  if (keep >= digits.length) return { digits: digits.padEnd(Math.max(keep, 0), "0"), exp };
  if (keep < 0) return { digits: "", exp: 0 };
  const head = digits.slice(0, keep);
  const next = digits.charCodeAt(keep) - 48;
  const rest = /[1-9]/.test(digits.slice(keep + 1));
  const odd = keep > 0 && (digits.charCodeAt(keep - 1) - 48) % 2 === 1;
  if (!(next > 5 || (next === 5 && (rest || odd)))) {
    return { digits: head === "" ? "" : head, exp: head === "" ? 0 : exp };
  }
  const raised = (BigInt(`0${head}`) + 1n).toString().padStart(keep, "0");
  if (raised.length > keep) {
    return { digits: `1${"0".repeat(Math.max(keep - 1, 0))}`, exp: exp + 1 };
  }
  return { digits: raised, exp };
}

/**
 * The `'f'` conversion (`vendor/ruby/sprintf.c:790`) and the `'e'`/`'E'`/
 * `'g'`/`'G'`/`'a'`/`'A'` ones MRI hands to `BSD_vfprintf`
 * (`vendor/ruby/sprintf.c:884`).
 *
 * A non-finite value is `Inf`, never `Infinity`, and is space-filled whatever
 * the `0` flag says (`vendor/ruby/sprintf.c:886`). `%a`'s `0x` prefix stands
 * where an integer conversion's does, so a `0` flag fills BETWEEN it and the
 * digits (`vendor/ruby/vsnprintf.c:1183`).
 */
function formatFloat(
  val: unknown,
  conv: string,
  flags: number,
  width: number,
  prec: number,
): string {
  const fval = typeof val === "bigint" ? Number(val) : kernelFloat(val);
  let sc = "";
  if (fval < 0 || Object.is(fval, -0)) sc = "-";
  else if (flags & FPLUS) sc = "+";
  else if (flags & FSPACE) sc = " ";

  if (!Number.isFinite(fval)) {
    return pad(Number.isNaN(fval) ? "NaN" : "Inf", flags & ~FZERO, width, sc);
  }
  if (!(flags & FPREC)) prec = DEFAULT_FLOAT_PRECISION;

  if (conv === "a" || conv === "A") {
    const hex = hexFloat(Math.abs(fval), flags, prec);
    const body = conv === "A" ? hex.toUpperCase() : hex;
    return pad(body.slice(2), flags, width, sc + body.slice(0, 2));
  }
  let body: string;
  if (conv === "f") body = fixed(Math.abs(fval), flags, prec);
  else if (conv === "e" || conv === "E") body = exponential(Math.abs(fval), flags, prec);
  else body = general(Math.abs(fval), flags, prec);
  if (conv === "E" || conv === "G") body = body.toUpperCase();
  return pad(body, flags, width, sc);
}

/** The width fill shared by the float conversions (`vendor/ruby/vsnprintf.c:1148`). */
function pad(body: string, flags: number, width: number, sc: string): string {
  const fill = Math.max(width - body.length - sc.length, 0);
  if (flags & FMINUS) return sc + body + " ".repeat(fill);
  if (flags & FZERO) return sc + "0".repeat(fill) + body;
  return " ".repeat(fill) + sc + body;
}

const TENS = [
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17,
  1e18, 1e19, 1e20, 1e21, 1e22,
];
const BIGTENS = [1e16, 1e32, 1e64, 1e128, 1e256];
const TEN_PMAX = 22;
const BLETCH = 0x10;
const QUICK_MAX = 14;

/**
 * `BSD__dtoa` (`vendor/ruby/missing/dtoa.c:2670`) restricted to the two modes
 * the float conversions ask for: mode 3 (`ndigits` after the decimal point,
 * for `%f`) and mode 2 (`ndigits` significant, for `%e` and `%g`). The result
 * is `|x| = 0.digits * 10 ** exp`.
 *
 * The floating-point fast path (`vendor/ruby/missing/dtoa.c:2895`) is ported rather than skipped
 * because it is observable: its rounding decision is taken on the SCALED
 * DOUBLE within a tolerance `eps`, so a value whose exact expansion is a hair
 * under a tie — `0.35`, whose double is `0.34999999999999997…` — still reads
 * as a tie there and rounds half to even on the last generated digit, giving
 * `format("%.1f", 0.35) == "0.4"` where rounding the exact expansion gives
 * `"0.3"`. Where the fast path cannot decide within `eps` it gives up
 * (`fast_failed`, `vendor/ruby/missing/dtoa.c:2994`) and the exact expansion answers, which is why
 * `format("%.1f", 0.05)` is `"0.1"`.
 */
function dtoa(x: number, mode: 2 | 3, ndigits: number): { digits: string; exp: number } {
  const exact = exactDecimal(x);
  const k = exact.exp - 1;
  const kCheck = !(k >= 0 && k <= TEN_PMAX);
  let ilim: number;
  let ilim1: number;
  if (mode === 2) {
    if (ndigits <= 0) ndigits = 1;
    ilim = ilim1 = ndigits;
  } else {
    ilim = ndigits + k + 1;
    ilim1 = ilim - 1;
  }
  if (ilim >= 0 && ilim <= QUICK_MAX) {
    const quick = dtoaQuick(x, k, ilim, ilim1, kCheck);
    if (quick) return quick;
  }
  return roundAt(exact.digits, exact.exp, ilim);
}

/** The fast path of {@link dtoa} (`vendor/ruby/missing/dtoa.c:2895`), `leftright` 0. */
function dtoaQuick(
  x: number,
  k: number,
  ilim: number,
  ilim1: number,
  kCheck: boolean,
): { digits: string; exp: number } | null {
  let d = x;
  let ieps = 2;
  let i = 0;
  if (k > 0) {
    let ds = TENS[k & 0xf];
    let j = k >> 4;
    if (j & BLETCH) {
      j &= BLETCH - 1;
      d /= BIGTENS[BIGTENS.length - 1];
      ieps++;
    }
    for (; j; j >>= 1, i++) {
      if (j & 1) {
        ieps++;
        ds *= BIGTENS[i];
      }
    }
    d /= ds;
  } else if (k < 0) {
    const j1 = -k;
    d *= TENS[j1 & 0xf];
    for (let j = j1 >> 4; j; j >>= 1, i++) {
      if (j & 1) {
        ieps++;
        d *= BIGTENS[i];
      }
    }
  }
  if (kCheck && d < 1 && ilim > 0) {
    if (ilim1 <= 0) return null;
    ilim = ilim1;
    k--;
    d *= 10;
    ieps++;
  }
  let eps = (ieps * d + 7) * 2 ** -52;
  if (ilim === 0) {
    d -= 5;
    if (d > eps) return { digits: "1", exp: k + 2 };
    if (d < -eps) return { digits: "", exp: 1 };
    return null;
  }
  eps *= TENS[ilim - 1];
  let s = "";
  for (let n = 1; ; n++, d *= 10) {
    const L = Math.trunc(d);
    d -= L;
    if (d === 0) ilim = n;
    s += String(L);
    if (n === ilim) {
      if (d > 0.5 + eps) return bumpUp(s, k);
      if (d < 0.5 - eps) return { digits: s.replace(/0+$/, ""), exp: k + 1 };
      if (L & 1) return bumpUp(s, k);
      return { digits: s, exp: k + 1 };
    }
  }
}

/** `bump_up` (`vendor/ruby/missing/dtoa.c:3060`). */
function bumpUp(s: string, k: number): { digits: string; exp: number } {
  let i = s.length - 1;
  for (; s[i] === "9"; i--) {
    if (i === 0) return { digits: "1", exp: k + 2 };
  }
  return { digits: s.slice(0, i) + String(Number(s[i]) + 1), exp: k + 1 };
}

/** `%f` (`vendor/ruby/sprintf.c:790`). */
function fixed(x: number, flags: number, prec: number): string {
  const { digits, exp } = x === 0 ? { digits: "", exp: 1 } : dtoa(x, 3, prec);
  return renderFixed(digits, exp, prec, flags);
}

/** The `%f` digit assembly (`vendor/ruby/sprintf.c:833-869`). */
function renderFixed(digits: string, exp: number, prec: number, flags: number): string {
  const int = exp > 0 ? digits.slice(0, exp).padEnd(exp, "0") : "0";
  const tail = exp > 0 ? digits.slice(exp) : "0".repeat(Math.min(-exp, prec)) + digits;
  if (prec === 0) return flags & FSHARP ? `${int}.` : int;
  return `${int}.${tail.padEnd(prec, "0").slice(0, prec)}`;
}

/** `%e` (`vendor/ruby/vsnprintf.c:930`). */
function exponential(x: number, flags: number, prec: number): string {
  const { digits, exp } = x === 0 ? { digits: "", exp: 1 } : dtoa(x, 2, prec + 1);
  return renderExp(digits, exp, prec, flags);
}

/** The `%e` digit assembly (`vendor/ruby/vsnprintf.c:1215`). */
function renderExp(digits: string, exp: number, prec: number, flags: number): string {
  const mantissa = (digits === "" ? "0" : digits).padEnd(prec + 1, "0");
  const point = prec > 0 ? `.${mantissa.slice(1, prec + 1)}` : (flags & FSHARP) !== 0 ? "." : "";
  const e = digits === "" ? 0 : exp - 1;
  return `${mantissa[0]}${point}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
}

/** `%g` (`vendor/ruby/vsnprintf.c:903`) — the style is chosen after rounding. */
function general(x: number, flags: number, prec: number): string {
  const P = prec === 0 ? 1 : prec;
  const { digits, exp } = x === 0 ? { digits: "", exp: 1 } : dtoa(x, 2, P);
  const X = exp - 1;
  let body =
    X >= -4 && X < P
      ? renderFixed(digits, exp, Math.max(P - 1 - X, 0), flags)
      : renderExp(digits, exp, Math.max(P - 1, 0), flags);
  if (!(flags & FSHARP) && body.includes(".")) {
    const [mantissa = "", suffix] = body.split("e");
    body = mantissa.replace(/\.?0+$/, "") + (suffix === undefined ? "" : `e${suffix}`);
  }
  return body;
}

/**
 * `%a` (`vendor/ruby/vsnprintf.c:816` through `__hdtoa`) — the hexadecimal
 * float literal. MRI normalizes it, so a subnormal is `0x1p-1074` rather than
 * `0x0.0000000000001p-1022`, and a carry out of the rounded digits is
 * renormalized to `0x1` at the next exponent.
 */
function hexFloat(x: number, flags: number, prec: number): string {
  if (x === 0) {
    const zeros = flags & FPREC && prec > 0 ? `.${"0".repeat(prec)}` : flags & FSHARP ? "." : "";
    return `0x0${zeros}p+0`;
  }
  const { m, exp2 } = decompose(x);
  const bits = m.toString(2);
  let e = exp2 + bits.length - 1;
  const fracBits = bits.slice(1);
  const hexDigits = Math.ceil(fracBits.length / 4);
  let frac =
    hexDigits === 0
      ? ""
      : BigInt(`0b${fracBits.padEnd(hexDigits * 4, "0")}`)
          .toString(16)
          .padStart(hexDigits, "0");
  let lead = "1";
  if (flags & FPREC) {
    if (prec < frac.length) {
      const keep = frac.slice(0, prec);
      const next = Number.parseInt(frac[prec], 16);
      const rest = /[1-9a-f]/.test(frac.slice(prec + 1));
      const odd = prec > 0 ? Number.parseInt(frac[prec - 1], 16) % 2 === 1 : true;
      const hex =
        next > 8 || (next === 8 && (rest || odd))
          ? (BigInt(`0x1${keep}`) + 1n).toString(16).padStart(prec + 1, "0")
          : `1${keep}`;
      if (hex[0] === "2") {
        e++;
        frac = "0".repeat(prec);
      } else {
        lead = hex[0]!;
        frac = hex.slice(1);
      }
    } else {
      frac = frac.padEnd(prec, "0");
    }
  } else {
    frac = frac.replace(/0+$/, "");
  }
  const point = frac.length > 0 ? `.${frac}` : flags & FSHARP ? "." : "";
  return `0x${lead}${point}p${e < 0 ? "-" : "+"}${Math.abs(e)}`;
}
