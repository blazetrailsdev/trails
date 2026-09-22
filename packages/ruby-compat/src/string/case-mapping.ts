import { ArgumentError } from "../argument-error.js";
import { bytes } from "./bytes.js";
import { rbCheckStringType } from "./support.js";

interface CaseFlags {
  ascii: boolean;
  turkic: boolean;
  fold: boolean;
}

/**
 * `check_case_options` (`vendor/ruby/string.c:7304`): the `:ascii`, `:turkic`,
 * `:lithuanian` and `:fold` options, spelled as the `":name"` strings trails
 * gives a Ruby Symbol. `:lithuanian` is accepted and, as in Onigmo, maps
 * nothing differently.
 *
 * @noRailsEquivalent PERMANENT
 */
export function checkCaseOptions(argv: unknown[], downcase: boolean): CaseFlags {
  const flags = { ascii: false, turkic: false, fold: false };
  if (argv.length === 0) return flags;
  if (argv.length > 2) throw new ArgumentError("too many options");
  if (argv[0] === ":turkic") {
    flags.turkic = true;
    if (argv.length === 2 && argv[1] !== ":lithuanian") {
      throw new ArgumentError("invalid second option");
    }
  } else if (argv[0] === ":lithuanian") {
    if (argv.length === 2) {
      if (argv[1] === ":turkic") flags.turkic = true;
      else throw new ArgumentError("invalid second option");
    }
  } else if (argv.length > 1) {
    throw new ArgumentError("too many options");
  } else if (argv[0] === ":ascii") {
    flags.ascii = true;
  } else if (argv[0] === ":fold") {
    if (downcase) flags.fold = true;
    else throw new ArgumentError("option :fold only allowed for downcasing");
  } else {
    throw new ArgumentError("invalid option");
  }
  return flags;
}

const ASCII_LETTER = /[A-Za-z]/;

function upcaseChar(c: string, flags: CaseFlags): string {
  if (flags.ascii) return ASCII_LETTER.test(c) ? c.toUpperCase() : c;
  if (flags.turkic && c === "i") return "İ";
  return c.toUpperCase();
}

function downcaseChar(c: string, flags: CaseFlags): string {
  if (flags.ascii) return ASCII_LETTER.test(c) ? c.toLowerCase() : c;
  if (flags.turkic && c === "I") return "ı";
  if (flags.turkic && c === "İ") return "i";
  if (flags.fold) return c.toUpperCase().toLowerCase();
  return c.toLowerCase();
}

/**
 * The characters whose titlecase differs from both their upper and lower
 * case: the Latin digraphs and the Greek letters with ypogegrammeni, which
 * `onigenc_unicode_case_map` (`vendor/ruby/enc/unicode.c:684`) titlecases
 * through `CaseMappingSpecials`.
 */
const TITLECASE: Record<string, string> = Object.fromEntries([
  ...["Ǆ", "ǅ", "ǆ"].map((c) => [c, "ǅ"]),
  ...["Ǉ", "ǈ", "ǉ"].map((c) => [c, "ǈ"]),
  ...["Ǌ", "ǋ", "ǌ"].map((c) => [c, "ǋ"]),
  ...["Ǳ", "ǲ", "ǳ"].map((c) => [c, "ǲ"]),
  ...Array.from({ length: 48 }, (_, i) => {
    const c = 0x1f80 + i;
    return [String.fromCodePoint(c), String.fromCodePoint(c | 0x08)];
  }),
  ["ᾳ", "ᾼ"],
  ["ῃ", "ῌ"],
  ["ῳ", "ῼ"],
]);

function titlecaseChar(c: string, flags: CaseFlags): string {
  if (flags.ascii || (flags.turkic && c === "i")) return upcaseChar(c, flags);
  if (c in TITLECASE) return TITLECASE[c];
  const upper = c.toUpperCase();
  const [first, ...rest] = upper;
  return first + rest.join("").toLowerCase();
}

/**
 * `String#upcase` (`vendor/ruby/string.c:7574` `rb_str_upcase`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function upcase(str: string, argv: unknown[]): string {
  const flags = checkCaseOptions(argv, false);
  return Array.from(str, (c) => upcaseChar(c, flags)).join("");
}

/**
 * `String#downcase` (`vendor/ruby/string.c:7676` `rb_str_downcase`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function downcase(str: string, argv: unknown[]): string {
  const flags = checkCaseOptions(argv, true);
  return Array.from(str, (c) => downcaseChar(c, flags)).join("");
}

/**
 * `String#capitalize` (`vendor/ruby/string.c:7760` `rb_str_capitalize`): the first
 * character titlecased, the rest downcased.
 *
 * @noRailsEquivalent PERMANENT
 */
export function capitalize(str: string, argv: unknown[]): string {
  const flags = checkCaseOptions(argv, false);
  const [first, ...rest] = str;
  if (first === undefined) return str;
  return titlecaseChar(first, flags) + rest.map((c) => downcaseChar(c, flags)).join("");
}

/**
 * `String#swapcase` (`vendor/ruby/string.c:7838` `rb_str_swapcase`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function swapcase(str: string, argv: unknown[]): string {
  const flags = checkCaseOptions(argv, false);
  return Array.from(str, (c) => {
    const down = downcaseChar(c, flags);
    return down !== c ? down : upcaseChar(c, flags);
  }).join("");
}

/**
 * `String#casecmp` (`vendor/ruby/string.c:3844` `rb_str_casecmp` over `str_casecmp`
 * at `:3854`): ASCII letters compare case-insensitively, everything else by
 * its bytes; nil for an incomparable argument.
 *
 * @noRailsEquivalent PERMANENT
 */
export function casecmp(str1: string, other: unknown): number | null {
  const str2 = rbCheckStringType(other);
  if (str2 === null) return null;
  const a = [...str1];
  const b = [...str2];
  for (let i = 0; i < a.length && i < b.length; i++) {
    const c1 = a[i].codePointAt(0)!;
    const c2 = b[i].codePointAt(0)!;
    if (c1 < 0x80 && c2 < 0x80) {
      const l1 = a[i].toLowerCase();
      const l2 = b[i].toLowerCase();
      if (l1 !== l2) return l1 < l2 ? -1 : 1;
      continue;
    }
    const b1 = bytes(a[i]);
    const b2 = bytes(b[i]);
    for (let j = 0; j < b1.length && j < b2.length; j++) {
      if (b1[j] !== b2[j]) return b1[j] < b2[j] ? -1 : 1;
    }
    if (b1.length !== b2.length) return b1.length < b2.length ? -1 : 1;
  }
  const len1 = bytes(str1).length;
  const len2 = bytes(str2).length;
  if (len1 === len2) return 0;
  return len1 > len2 ? 1 : -1;
}

/**
 * `String#casecmp?` (`vendor/ruby/string.c:3934` `rb_str_casecmp_p` over
 * `str_casecmp_p` at `:3944`): equal after Unicode case folding; nil for an
 * incomparable argument.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isCasecmp(str1: string, other: unknown): boolean | null {
  const str2 = rbCheckStringType(other);
  if (str2 === null) return null;
  return downcase(str1, [":fold"]) === downcase(str2, [":fold"]);
}
