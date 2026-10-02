// Literal parameter-default + constant comparison for parity:api (advisory —
// never changes parity). Diffs a default/constant's literal *value* after
// normalization absorbing cross-language noise (numeric underscores,
// symbol→string in either spelling, nil↔null/undefined, escapes); a non-literal
// is uncomparable.

import type { LiteralValue, ParamInfo } from "@blazetrails/parity/types";
import { snakeToCamel } from "@blazetrails/parity/conventions";

// ESC is one of the characters being canonicalized, so it belongs in the class.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00\x1b\r\n\t]/g;

function canonString(s: string): string {
  const real: Record<string, string> = {
    "\x00": "<0>",
    "\x1b": "<e>",
    "\r": "<r>",
    "\n": "<n>",
    "\t": "<t>",
  };
  return s.replace(CONTROL_CHARS, (c) => real[c]);
}

const RUBY_SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  f: "\f",
  v: "\v",
  a: "\x07",
  b: "\b",
  e: "\x1b",
  s: " ",
  "\n": "",
};

const RUBY_CLOSING_DELIMITERS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };

const RUBY_ESCAPE =
  /\\(?:([0-7]{1,3})|x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{4})|u\{([0-9a-fA-F \t]+)\}|(?:c|C-)([\s\S])|([\s\S]))/g;

/**
 * The VALUE of a Ruby double-quoted string literal, from the source text
 * between its quotes — which is what extract-ruby-api.rb records, since Ripper's
 * `@tstring_content` is undecoded. The TS extractor records `node.text`, already
 * decoded, so comparing the two spellings counts every Ruby backslash twice:
 * `"\\"` (sanitization.rb:132) and TS `"\\"` are the same one-backslash string.
 *
 * Mirrors MRI's `read_escape` (vendor/ruby/v3.3.11/parse.y:7989): octal
 * `\nnn`, `\xHH`, `\uHHHH`, `\u{H…}`, control `\cx` / `\C-x`, the named escapes, a backslash-newline continuation,
 * and any other `\X`, which is `X`. `\M-x` is not decoded: it yields a byte
 * that is not a character, and falls through the last arm.
 *
 * `opener` is the literal's opening token when it is not double-quoted, which
 * extract-ruby-api.rb reads off the lexer since the sexp drops it. A `'…'` or
 * `%q(…)` literal knows only a backslash before another backslash or before
 * its own delimiter, and keeps every other one: `'\s*'` (action_view.rb:35) is
 * three characters. A `<<~'EOS'` heredoc has no escapes at all.
 */
export function decodeRubyString(source: string, opener?: string): string {
  if (opener?.startsWith("<<")) return source;
  if (opener !== undefined) {
    const open = opener.at(-1)!;
    const close = RUBY_CLOSING_DELIMITERS[open] ?? open;
    return source.replace(/\\([\s\S])/g, (escape, char: string) =>
      char === "\\" || char === open || char === close ? char : escape,
    );
  }
  return source.replace(
    RUBY_ESCAPE,
    (
      _,
      octal: string | undefined,
      hex: string | undefined,
      unicode: string | undefined,
      braced: string | undefined,
      control: string | undefined,
      other: string | undefined,
    ) => {
      if (octal !== undefined) return String.fromCharCode(parseInt(octal, 8) & 0xff);
      if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
      if (unicode !== undefined) return String.fromCharCode(parseInt(unicode, 16));
      if (braced !== undefined) {
        return braced
          .trim()
          .split(/[ \t]+/)
          .map((point) => String.fromCodePoint(parseInt(point, 16)))
          .join("");
      }
      if (control !== undefined) {
        return control === "?" ? "\x7f" : String.fromCharCode(control.charCodeAt(0) & 0x9f);
      }
      return RUBY_SIMPLE_ESCAPES[other!] ?? other!;
    },
  );
}

/** Canonical comparison key, or null when uncomparable (`expr`); int/float parse numerically. */
export function normalizeLiteral(lit: LiteralValue): string | null {
  switch (lit.kind) {
    case "int":
    case "float":
      // int/float share one key: TS's single `number` type makes `1` and `1.0`
      // the identical value, so distinguishing them only manufactures noise.
      return `num:${Number(String(lit.value).replace(/_/g, ""))}`;
    case "string":
    case "symbol":
      return `str:${canonString(String(lit.value ?? ""))}`;
    case "bool":
      return `bool:${lit.value}`;
    case "nil":
      return "nil";
    case "array":
      return "arr";
    case "hash":
      return "hash";
    default:
      return null; // expr — not a literal
  }
}

export type LiteralVerdict = "match" | "mismatch" | "skip";

/** Compare two literals. "skip" when either side is non-literal (`expr`), or
 *  when exactly one side is `nil`: Rails uses `nil` as a sentinel and computes
 *  the committed value in the body (`validate_each(..., precision: nil)`), so it
 *  has no value to compare. `nil`↔`nil` (incl. TS undefined/null) still matches.
 *
 *  A Ruby Symbol is a JS string, and CLAUDE.md ("Symbols vs strings") keeps the
 *  leading colon only where a method's control flow turns on Symbol-vs-String.
 *  `symbolDiscriminated` carries that distinction from the Ruby body: when the
 *  body branches on `Symbol === x` (`I18n::Backend::Base#localize`,
 *  i18n/lib/i18n/backend/base.rb:83) only `":x"` matches, and a bare `"x"` — a
 *  port that bypassed the branch — is a mismatch. Elsewhere a Symbol is just a
 *  name (`timestamp_column = :updated_at`) and the bare spelling is correct. */
export function compareLiteral(
  ruby: LiteralValue,
  ts: LiteralValue,
  symbolDiscriminated = false,
): LiteralVerdict {
  const r = normalizeLiteral(
    ruby.kind === "string"
      ? { kind: "string", value: decodeRubyString(String(ruby.value ?? ""), ruby.opener) }
      : ruby,
  );
  const t = normalizeLiteral(ts);
  if (r === null || t === null) return "skip";
  if ((r === "nil") !== (t === "nil")) return "skip";
  if (ruby.kind === "symbol") {
    const colon = `str::${canonString(String(ruby.value ?? ""))}`;
    if (symbolDiscriminated) return t === colon ? "match" : "mismatch";
    return t === colon || t === r ? "match" : "mismatch";
  }
  return r === t ? "match" : "mismatch";
}

/** Human-readable rendering of a literal for the mismatch report. */
export function displayLiteral(lit: LiteralValue): string {
  switch (lit.kind) {
    case "string":
      return JSON.stringify(lit.value ?? "");
    case "symbol":
      return `:${lit.value ?? ""}`;
    case "nil":
      return "nil";
    case "array":
      return "[]";
    case "hash":
      return "{}";
    default:
      return String(lit.value);
  }
}

export interface LiteralDefaultResult {
  compared: number;
  skipped: number;
  mismatches: { name: string; rubyValue: string; tsValue: string }[];
}

/** Compare a Ruby method's literal defaults against the matched TS signatures.
 *  Params match by name (snake_case → camelCase) not position — the `this`-mixin
 *  receiver shifts positions. A TS param with no default is skipped silently. */
export function compareDefaults(
  rubyParams: ParamInfo[],
  tsCandidates: ParamInfo[][],
): LiteralDefaultResult {
  const tsByName = new Map<string, LiteralValue>();
  for (const cand of tsCandidates) {
    for (const p of cand) {
      if (p.literal && !tsByName.has(p.name)) tsByName.set(p.name, p.literal);
    }
  }

  const result: LiteralDefaultResult = { compared: 0, skipped: 0, mismatches: [] };
  for (const rp of rubyParams) {
    if (!rp.literal) continue;
    const tl = tsByName.get(snakeToCamel(rp.name)) ?? tsByName.get(rp.name);
    if (!tl) continue;
    const verdict = compareLiteral(rp.literal, tl, rp.symbolDiscriminated);
    if (verdict === "skip") {
      result.skipped++;
      continue;
    }
    result.compared++;
    if (verdict === "mismatch") {
      result.mismatches.push({
        name: rp.name,
        rubyValue: displayLiteral(rp.literal),
        tsValue: displayLiteral(tl),
      });
    }
  }
  return result;
}

/**
 * Ruby and TS spellings of the SAME numeric constant, mapped onto one key.
 *
 * `Float::INFINITY` (cache/coder.rb:17) is the identical IEEE-754 value as JS
 * `Infinity`, and JavaScript has no spelling that is the token `INFINITY` — so
 * the divergence is in the comparator, not in any port, and no rewrite of the
 * port can converge it.
 *
 * Deliberately closed and explicit: a spelling table, never a value-equivalence
 * engine. `Float::MAX` and `Number.MAX_VALUE` are NOT the same value, and
 * anything not listed here compares by its token exactly as before. Ruby's
 * negated forms (`-Float::INFINITY`) reach the argument comparator as a `unary`
 * descriptor, which is opaque on that side, so only the TS half of that pair can
 * ever be looked up — it is listed for the same reason the positive one is, not
 * because a Ruby row is waiting for it.
 *
 * `INFINITY` and `NAN` are the Ruby spellings, which the extractor records
 * without the `Float::` namespace; the rest are the TS ones, which
 * extract-ts-api.ts#describeArg records as `const:` whether they are written as
 * the bare global or as a `Number` property.
 */
const CONSTANT_SPELLINGS: Record<string, string> = {
  INFINITY: "num:Infinity",
  NAN: "num:NaN",
  Infinity: "num:Infinity",
  POSITIVE_INFINITY: "num:Infinity",
  NEGATIVE_INFINITY: "num:-Infinity",
  NaN: "num:NaN",
};

/** The shared key for a value-equivalent constant spelling, or null when the
 *  name is not one of them and must go on comparing by its own token. */
export function normalizeConstantSpelling(name: string): string | null {
  return CONSTANT_SPELLINGS[name] ?? null;
}

/** Match a Ruby constant name to a TS one — SCREAMING_SNAKE passes through; also
 *  accept the camelized form for a lowercase Ruby constant ported as camelCase. */
export function constantNameMatches(rubyName: string, tsName: string): boolean {
  return rubyName === tsName || snakeToCamel(rubyName.toLowerCase()) === tsName;
}
