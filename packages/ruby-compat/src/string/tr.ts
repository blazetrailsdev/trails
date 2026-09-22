import { ArgumentError } from "../argument-error.js";
import { rbErrorArity, stringValue } from "./support.js";

/**
 * `trnext` (`vendor/ruby/string.c:7866`): the code points a `tr` / `count` /
 * `delete` / `squeeze` character set names, with `a-z` ranges expanded and a
 * backslash quoting the next character.
 *
 * @noRailsEquivalent PERMANENT
 */
export function* trnext(cps: number[]): Generator<number> {
  let i = 0;
  while (i < cps.length) {
    if (cps[i] === 0x5c && i + 1 < cps.length) i++;
    const now = cps[i++];
    if (cps[i] === 0x2d && i + 1 < cps.length) {
      const c = cps[i + 1];
      i += 2;
      if (now > c) {
        if (now < 0x80 && c < 0x80) {
          const range = `${String.fromCodePoint(now)}-${String.fromCodePoint(c)}`;
          throw new ArgumentError(`invalid range "${range}" in string transliteration`);
        }
        throw new ArgumentError("invalid range in string transliteration");
      }
      for (let cp = now; cp <= c; cp++) yield cp;
      continue;
    }
    yield now;
  }
}

/**
 * `tr_setup_table` (`vendor/ruby/string.c:8236`) over every set, with
 * `tr_find`'s lookup: a character is selected when each set selects it; a set
 * led by `^` (and longer than one character) selects its complement.
 *
 * @noRailsEquivalent PERMANENT
 */
export function trSetupTable(sets: unknown[]): (cp: number) => boolean {
  const tables = sets.map((set) => {
    const cps = Array.from(stringValue(set), (c) => c.codePointAt(0)!);
    const cflag = cps.length > 1 && cps[0] === 0x5e;
    const members = new Set(trnext(cflag ? cps.slice(1) : cps));
    return (cp: number) => members.has(cp) !== cflag;
  });
  return (cp) => tables.every((t) => t(cp));
}

/**
 * `tr_trans` (`vendor/ruby/string.c:7924`), for `tr` and — with `sflag` —
 * `tr_s`, which squeezes each run of one translated character.
 *
 * @noRailsEquivalent PERMANENT
 */
export function trTrans(str: string, src: unknown, repl: unknown, sflag: boolean): string {
  const srcCps = Array.from(stringValue(src), (c) => c.codePointAt(0)!);
  const replStr = stringValue(repl);
  if (replStr.length === 0) return strDelete(str, [src]);
  const cflag = srcCps.length > 1 && srcCps[0] === 0x5e;
  const replCps = [...trnext(Array.from(replStr, (c) => c.codePointAt(0)!))];
  const last = replCps[replCps.length - 1];
  const trans = new Map<number, number>();
  const from = [...trnext(cflag ? srcCps.slice(1) : srcCps)];
  if (!cflag) from.forEach((c, i) => trans.set(c, i < replCps.length ? replCps[i] : last));
  const members = new Set(from);
  let out = "";
  let save = -1;
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    const r = cflag ? (members.has(c) ? -1 : last) : (trans.get(c) ?? -1);
    if (r === -1) {
      save = -1;
      out += ch;
      continue;
    }
    if (sflag && save === r) continue;
    save = r;
    out += String.fromCodePoint(r);
  }
  return out;
}

/**
 * `rb_str_delete_bang` (`vendor/ruby/string.c:8331`): the characters every set
 * selects, removed.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strDelete(str: string, sets: unknown[]): string {
  if (sets.length < 1) rbErrorArity(sets.length, 1, Infinity);
  const selected = trSetupTable(sets);
  return Array.from(str)
    .filter((c) => !selected(c.codePointAt(0)!))
    .join("");
}

/**
 * `rb_str_squeeze_bang` (`vendor/ruby/string.c:8424`): each run of one
 * selected character (every character, with no sets) cut to one.
 *
 * @noRailsEquivalent PERMANENT
 */
export function strSqueeze(str: string, sets: unknown[]): string {
  const selected = sets.length === 0 ? () => true : trSetupTable(sets);
  let out = "";
  let save = -1;
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (c === save && selected(c)) continue;
    save = c;
    out += ch;
  }
  return out;
}

/**
 * `String#count` (`vendor/ruby/string.c:8590` `rb_str_count`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function strCount(str: string, sets: unknown[]): number {
  if (sets.length < 1) rbErrorArity(sets.length, 1, Infinity);
  const selected = trSetupTable(sets);
  let n = 0;
  for (const ch of str) if (selected(ch.codePointAt(0)!)) n++;
  return n;
}
