import { bytes } from "./bytes.js";
import { succ } from "./succ.js";
import { blockArg, checkArity, rbStrCmp, stringValue, type StringReceiver } from "./support.js";

type Callback = (...args: unknown[]) => unknown;

function isKwargs(val: unknown): val is Record<string, unknown> {
  if (typeof val !== "object" || val === null) return false;
  const proto: unknown = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function chompNewline(str: string, p: number, e: number): number {
  if (e > p && str[e - 1] === "\n") {
    e--;
    if (e > p && str[e - 1] === "\r") e--;
  }
  return e;
}

/**
 * `rb_str_enumerate_lines` (`vendor/ruby/v3.3.11/string.c:9037`): the lines of `str`
 * split after each `rs` (`$/`, `"\n"`, by default), in paragraph mode for an
 * empty `rs`, whole for a nil one; `chomp: true` drops each separator.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrEnumerateLines(str: string, argv: unknown[]): string[] {
  let args = argv;
  let chomp = false;
  if (isKwargs(args[args.length - 1])) {
    const opts = args[args.length - 1] as { chomp?: unknown };
    chomp = opts.chomp != null && opts.chomp !== false;
    args = args.slice(0, -1);
  }
  checkArity(args.length, 0, 1);
  const rs = args.length === 0 ? "\n" : args[0];
  if (rs == null) return [str];
  const lines: string[] = [];
  if (str.length === 0) return lines;
  const sep = stringValue(rs);
  const pend = str.length;
  if (sep.length === 0) {
    let subptr: number | null = 0;
    let subend = 0;
    let eol: number | null = null;
    while (subend < pend) {
      let chompRslen = 0;
      let rslen: number;
      do {
        const n = str[subend] === "\r" ? 1 : 0;
        const at = subend + n;
        rslen = n + (at < pend && str.codePointAt(at)! > 0xffff ? 2 : 1);
        if (str[at] === "\n") {
          if (eol === subend) break;
          subend += rslen;
          if (subptr !== null) {
            eol = subend;
            chompRslen = -rslen;
          }
        } else {
          if (subptr === null) subptr = subend;
          subend += rslen;
        }
        rslen = 0;
      } while (subend < pend);
      if (subptr === null) break;
      if (rslen === 0) chompRslen = 0;
      lines.push(str.slice(subptr, subend + (chomp ? chompRslen : rslen)));
      subptr = eol = null;
    }
    return lines;
  }
  const rsnewline = sep === "\n";
  let subptr = 0;
  while (subptr < pend) {
    const pos = str.indexOf(sep, subptr);
    if (pos < 0) break;
    const hit = pos + sep.length;
    let subend = hit;
    if (chomp) subend = rsnewline ? chompNewline(str, subptr, subend) : subend - sep.length;
    lines.push(str.slice(subptr, subend));
    subptr = hit;
  }
  if (subptr !== pend) {
    let end = pend;
    if (chomp) {
      if (rsnewline) end = chompNewline(str, subptr, end);
      else if (str.endsWith(sep) && end - subptr >= sep.length) end -= sep.length;
    }
    lines.push(str.slice(subptr, end));
  }
  return lines;
}

function* enumerate<T>(items: Iterable<T>): Generator<T> {
  yield* items;
}

/**
 * The `each_*` iteration shape (`vendor/ruby/v3.3.11/string.c:9186` `rb_str_each_line`):
 * each item yielded to the block and the receiver returned, or — with no
 * block — a generator standing for `RETURN_SIZED_ENUMERATOR`, JS's own
 * external iterator.
 *
 * @noRailsEquivalent PERMANENT
 */
export function eachOrEnumerator<T>(
  self: StringReceiver,
  block: Callback | null,
  items: Iterable<T>,
): string | Generator<T> {
  if (!block) return enumerate(items);
  for (const item of items) block(item);
  return self.string;
}

/**
 * `String#each_line` (`vendor/ruby/v3.3.11/string.c:9186` `rb_str_each_line`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrEachLine(self: StringReceiver, ...argv: unknown[]): unknown {
  const [args, block] = blockArg(argv);
  return eachOrEnumerator(self, block, rbStrEnumerateLines(self.string, args));
}

/**
 * `String#grapheme_clusters` (`vendor/ruby/v3.3.11/string.c:9552`), through
 * `Intl.Segmenter`'s extended grapheme clusters.
 *
 * @noRailsEquivalent PERMANENT
 */
export function graphemeClusters(str: string): string[] {
  return Array.from(new Intl.Segmenter().segment(str), (s) => s.segment);
}

/**
 * `String#codepoints` (`vendor/ruby/v3.3.11/string.c:9382` `rb_str_codepoints`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function codepoints(str: string): number[] {
  return Array.from(str, (c) => c.codePointAt(0)!);
}

/**
 * The iteration table entries: `lines`/`each_line`, `chars`/`each_char`,
 * `bytes`/`each_byte`, `codepoints`/`each_codepoint`,
 * `grapheme_clusters`/`each_grapheme_cluster` (`vendor/ruby/v3.3.11/string.c:9202`,
 * `:9307`, `:9322`, `:9238`, `:9367`, `:9537`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const EACH_METHODS = {
  lines: (self: StringReceiver, ...argv: unknown[]) => {
    const [args, block] = blockArg(argv);
    const lines = rbStrEnumerateLines(self.string, args);
    if (!block) return lines;
    lines.forEach((line) => block(line));
    return self.string;
  },
  eachLine: rbStrEachLine,
  chars: (self: StringReceiver, ...argv: unknown[]) => listing(self, argv, [...self.string]),
  eachChar: (self: StringReceiver, ...argv: unknown[]) => each(self, argv, [...self.string]),
  bytes: (self: StringReceiver, ...argv: unknown[]) => listing(self, argv, bytes(self.string)),
  eachByte: (self: StringReceiver, ...argv: unknown[]) => each(self, argv, bytes(self.string)),
  codepoints: (self: StringReceiver, ...argv: unknown[]) =>
    listing(self, argv, codepoints(self.string)),
  eachCodepoint: (self: StringReceiver, ...argv: unknown[]) =>
    each(self, argv, codepoints(self.string)),
  graphemeClusters: (self: StringReceiver, ...argv: unknown[]) =>
    listing(self, argv, graphemeClusters(self.string)),
  eachGraphemeCluster: (self: StringReceiver, ...argv: unknown[]) =>
    each(self, argv, graphemeClusters(self.string)),
};

function listing<T>(self: StringReceiver, argv: unknown[], items: T[]): T[] | string {
  const [args, block] = blockArg(argv);
  checkArity(args.length, 0, 0);
  if (!block) return items;
  items.forEach((item) => block(item));
  return self.string;
}

function each<T>(self: StringReceiver, argv: unknown[], items: T[]): string | Generator<T> {
  const [args, block] = blockArg(argv);
  checkArity(args.length, 0, 0);
  return eachOrEnumerator(self, block, items);
}

/**
 * `rb_str_upto_each` (`vendor/ruby/v3.3.11/string.c:5042`): single ASCII characters
 * by code, all-digit edges numerically at the first edge's width, anything
 * else by `succ`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function* rbStrUptoEach(beg: string, endArg: unknown, excl: boolean): Generator<string> {
  const end = stringValue(endArg);
  // eslint-disable-next-line no-control-regex -- `is_ascii_string` (string.c:5053)
  const ascii = /^[\x00-\x7f]*$/.test(beg) && /^[\x00-\x7f]*$/.test(end);
  if (beg.length === 1 && end.length === 1 && ascii) {
    let c = beg.charCodeAt(0);
    const e = end.charCodeAt(0);
    if (c > e || (excl && c === e)) return;
    for (;;) {
      yield String.fromCharCode(c);
      if (!excl && c === e) break;
      c++;
      if (excl && c === e) break;
    }
    return;
  }
  if (ascii && /^\d+$/.test(beg) && /^\d+$/.test(end)) {
    const width = beg.length;
    let bi = BigInt(beg);
    const ei = BigInt(end);
    while (bi <= ei) {
      if (excl && bi === ei) break;
      yield bi.toString().padStart(width, "0");
      bi++;
    }
    return;
  }
  const n = rbStrCmp(beg, end);
  if (n > 0 || (excl && n === 0)) return;
  const afterEnd = succ(end);
  let current = beg;
  while (current !== afterEnd) {
    let next: string | null = null;
    if (excl || current !== end) next = succ(current);
    yield current;
    if (next === null) break;
    current = next;
    if (excl && current === end) break;
    if (current.length > end.length || current.length === 0) break;
  }
}

/**
 * `String#upto` (`vendor/ruby/v3.3.11/string.c:5032` `rb_str_upto`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrUpto(self: StringReceiver, ...argv: unknown[]): unknown {
  const [args, block] = blockArg(argv);
  checkArity(args.length, 1, 2);
  const excl = args[1] != null && args[1] !== false;
  return eachOrEnumerator(self, block, rbStrUptoEach(self.string, args[0], excl));
}
