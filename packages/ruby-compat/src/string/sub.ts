import { MatchData } from "../match-data.js";
import { rbObjAsString } from "../object.js";
import {
  blockArg,
  checkArity,
  getPat,
  getPatQuoted,
  literalRegexp,
  num2long,
  rbErrorArity,
  rbRegexp,
  rbRegSearch,
  strlen,
  strOffset,
  stringValue,
  type StringReceiver,
} from "./support.js";

type Callback = (...args: unknown[]) => unknown;

function asRegexp(pat: RegExp | string): RegExp {
  return typeof pat === "string" ? literalRegexp(pat) : pat;
}

/**
 * `rb_pat_search` (`vendor/ruby/string.c:5723`) from UTF-16 offset `pos`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbPatSearch(pat: RegExp | string, str: string, pos: number): MatchData | null {
  const re = asRegexp(pat);
  const global = rbRegexp(re, "dg");
  global.lastIndex = pos;
  const match = global.exec(str);
  return match ? new MatchData(re, str, match) : null;
}

function spanOf(md: MatchData, n: number): [number, number] {
  const b = md.begin(n)!;
  const e = md.end(n)!;
  return [strOffset(md.string(), b), strOffset(md.string(), e)];
}

/**
 * `rb_reg_regsub` (`vendor/ruby/re.c:4394`): `\0`/`\&`, `\1`..`\9`, `\k<name>`,
 * `` \` ``, `\'`, `\+` and `\\` in `src` expanded against `md`; any other
 * escape is kept.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbRegRegsub(src: string, md: MatchData): string {
  return src.replace(/\\(k<(\w+)>|[0-9&`'+\\]|)/g, (whole, token: string, name?: string) => {
    if (name !== undefined) return (md.get(name) as string | null) ?? "";
    if (token === "") return whole;
    if (token === "&") return md.toS();
    if (token === "`") return md.preMatch();
    if (token === "'") return md.postMatch();
    if (token === "\\") return "\\";
    if (token === "+") {
      for (let n = md.size() - 1; n > 0; n--) if (md.match(n) !== null) return md.match(n)!;
      return "";
    }
    const n = Number(token);
    return n < md.size() ? (md.match(n) ?? "") : "";
  });
}

function substitution(md: MatchData, repl: unknown, hash: unknown, block: Callback | null): string {
  if (block) return rbObjAsString(block(md.toS()));
  if (hash !== null) {
    const key = md.toS();
    const value = hash instanceof Map ? hash.get(key) : (hash as Record<string, unknown>)[key];
    return rbObjAsString(value);
  }
  return rbRegRegsub(repl as string, md);
}

function rbCheckHashType(val: unknown): unknown {
  if (val instanceof Map) return val;
  if (typeof val !== "object" || val === null) return null;
  const proto: unknown = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null ? val : null;
}

/**
 * `String#sub!` (`vendor/ruby/string.c:5759` `rb_str_sub_bang`). The block
 * receives the match; Ruby's frame-local `$~` has no JS counterpart.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSubBang(self: StringReceiver, ...argv: unknown[]): string | null {
  const [args, block] = blockArg(argv);
  let repl: unknown = null;
  let hash: unknown = null;
  if (args.length !== 1 || !block) {
    checkArity(args.length, 2, 2);
    repl = args[1];
    hash = rbCheckHashType(args[1]);
    if (hash === null) repl = stringValue(repl);
  }
  const pat = getPatQuoted(args[0]);
  const md = rbPatSearch(pat, self.string, 0);
  if (!md) return null;
  const [beg, end] = spanOf(md, 0);
  const val = substitution(md, repl, hash, args.length === 1 ? block : null);
  self.string = self.string.slice(0, beg) + val + self.string.slice(end);
  return self.string;
}

/**
 * `String#sub` (`vendor/ruby/string.c:5884` `rb_str_sub`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrSub(self: StringReceiver, ...argv: unknown[]): string {
  const dup = { string: self.string };
  rbStrSubBang(dup, ...argv);
  return dup.string;
}

function* eachMatch(pat: RegExp | string, str: string): Generator<MatchData> {
  let offset = 0;
  for (;;) {
    const md = rbPatSearch(pat, str, offset);
    if (!md) return;
    yield md;
    const [beg0, end0] = spanOf(md, 0);
    if (beg0 === end0) {
      if (str.length <= end0) return;
      offset = end0 + (str.codePointAt(end0)! > 0xffff ? 2 : 1);
    } else {
      offset = end0;
    }
  }
}

/**
 * `str_gsub` (`vendor/ruby/string.c:5892`): every match replaced; with neither
 * replacement nor block, a generator over the matched strings stands for
 * `RETURN_ENUMERATOR` — JS's own external iterator.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strGsub(
  self: StringReceiver,
  argv: unknown[],
  bang: boolean,
): string | null | Generator<string> {
  const [args, block] = blockArg(argv);
  let repl: unknown = null;
  let hash: unknown = null;
  if (args.length === 1) {
    if (!block) {
      const pat = getPatQuoted(args[0]);
      const str = self.string;
      return (function* () {
        for (const md of eachMatch(pat, str)) yield md.toS();
      })();
    }
  } else if (args.length === 2) {
    repl = args[1];
    hash = rbCheckHashType(args[1]);
    if (hash === null) repl = stringValue(repl);
  } else {
    rbErrorArity(args.length, 1, 2);
  }
  const pat = getPatQuoted(args[0]);
  const str = self.string;
  let dest = "";
  let last = 0;
  let matched = false;
  for (const md of eachMatch(pat, str)) {
    matched = true;
    const [beg0, end0] = spanOf(md, 0);
    dest += str.slice(last, beg0) + substitution(md, repl, hash, args.length === 1 ? block : null);
    last = end0;
  }
  if (!matched) return bang ? null : str;
  dest += str.slice(last);
  if (bang) self.string = dest;
  return dest;
}

/**
 * `String#scan` (`vendor/ruby/string.c:10131` `rb_str_scan`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrScan(self: StringReceiver, ...argv: unknown[]): unknown {
  const [args, block] = blockArg(argv);
  checkArity(args.length, 1, 1);
  const pat = getPatQuoted(args[0]);
  const str = self.string;
  const results = Array.from(eachMatch(pat, str), (md) =>
    md.size() === 1 ? md.toS() : md.captures(),
  );
  if (!block) return results;
  for (const result of results) block(result);
  return str;
}

/**
 * `String#match` (`vendor/ruby/string.c:4577` `rb_str_match_m`, over
 * `rb_reg_match_m`): a `MatchData` from character offset `pos`, handed to the
 * block when one is given.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrMatchM(self: StringReceiver, ...argv: unknown[]): unknown {
  const [args, block] = blockArg(argv);
  checkArity(args.length, 1, 2);
  const re = getPat(args[0]);
  const md = regMatchPos(re, self.string, args.length === 2 ? num2long(args[1]) : 0);
  if (md && block) return block(md);
  return md;
}

/**
 * `String#match?` (`vendor/ruby/string.c:4616` `rb_str_match_m_p`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrMatchMP(self: StringReceiver, ...args: unknown[]): boolean {
  checkArity(args.length, 1, 2);
  const re = getPat(args[0]);
  return regMatchPos(re, self.string, args.length === 2 ? num2long(args[1]) : 0) !== null;
}

function regMatchPos(re: RegExp, str: string, pos: number): MatchData | null {
  if (pos < 0) {
    pos += strlen(str);
    if (pos < 0) return null;
  }
  const match = rbRegSearch(re, str, pos, false);
  return match ? new MatchData(re, str, match) : null;
}

/**
 * `String#partition` (`vendor/ruby/string.c:10574` `rb_str_partition`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrPartition(str: string, sep: unknown): [string, string, string] {
  const pat = sep instanceof RegExp ? sep : stringValue(sep);
  const md = rbPatSearch(pat, str, 0);
  if (!md) return [str, "", ""];
  const [beg, end] = spanOf(md, 0);
  return [str.slice(0, beg), str.slice(beg, end), str.slice(end)];
}

/**
 * `String#rpartition` (`vendor/ruby/string.c:10611` `rb_str_rpartition`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrRpartition(str: string, sep: unknown): [string, string, string] {
  let beg: number;
  let end: number;
  if (sep instanceof RegExp) {
    const match = rbRegSearch(sep, str, strlen(str), true);
    if (!match) return ["", "", str];
    beg = match.index;
    end = beg + match[0].length;
  } else {
    const s = stringValue(sep);
    beg = str.lastIndexOf(s);
    if (beg < 0) return ["", "", str];
    end = beg + s.length;
  }
  return [str.slice(0, beg), str.slice(beg, end), str.slice(end)];
}

/**
 * `String#start_with?` (`vendor/ruby/string.c:10651` `rb_str_start_with`); a
 * Regexp prefix must match at the start (`rb_reg_start_with_p`,
 * `vendor/ruby/re.c:1818`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrStartWith(str: string, ...prefixes: unknown[]): boolean {
  for (const prefix of prefixes) {
    if (prefix instanceof RegExp) {
      const sticky = rbRegexp(prefix, "y");
      if (sticky.test(str)) return true;
    } else if (str.startsWith(stringValue(prefix))) {
      return true;
    }
  }
  return false;
}

/**
 * `String#end_with?` (`vendor/ruby/string.c:10691` `rb_str_end_with`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrEndWith(str: string, ...suffixes: unknown[]): boolean {
  return suffixes.some((suffix) => str.endsWith(stringValue(suffix)));
}
