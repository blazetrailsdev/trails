/** Ruby String methods: which only a String answers, and how ruby-compat answers them. */
import { readFileSync } from "node:fs";

/** ruby-compat's STRING_METHOD_TABLE keys (scripts/codegen/data/string-method-table.json). */
export const STRING_TABLE = new Set<string>(
  JSON.parse(
    readFileSync(new URL("../../data/string-method-table.json", import.meta.url), "utf8"),
  ) as string[],
);

/**
 * What a ruby-compat `rbStrSend` call answers, by the Ruby method's documented
 * return (`vendor/ruby/v3.3.11/string.c`): `rbStrSend` is typed `unknown`, so
 * without this a chained call (`s.gsub(..).strip`) fails to type-check. A bang
 * method answers `nil` when it changed nothing.
 */
export const STRING_RESULT_TYPES: Record<string, string> = {
  ...Object.fromEntries(
    [
      "uplus",
      "gsub",
      "sub",
      "append",
      "plus",
      "prepend",
      "insert",
      "downcase",
      "upcase",
      "capitalize",
      "tr",
      "strip",
      "lstrip",
      "rstrip",
      "chomp",
      "chop",
      "squeeze",
      "delete",
      "deletePrefix",
      "deleteSuffix",
      "ljust",
      "rjust",
      "center",
      "toSym",
      "reverse",
      "succ",
      "dup",
    ].map((m) => [m, "string"]),
  ),
  ...Object.fromEntries(
    [
      "gsubBang",
      "subBang",
      "trBang",
      "stripBang",
      "downcaseBang",
      "upcaseBang",
      "deletePrefixBang",
      "deleteSuffixBang",
      "squeezeBang",
      "chompBang",
    ].map((m) => [m, "string | null"]),
  ),
  get: "string",
  bytesize: "number",
  size: "number",
  count: "number",
  equals: "boolean",
  isMatch: "boolean",
  isEmpty: "boolean",
  scan: "any[]",
  bytes: "number[]",
};

/** Ruby methods only String has (so an untyped receiver of one is a String). */
export const STRING_ONLY = new Set(
  "sub sub! gsub gsub! chomp chomp! chop chop! strip strip! lstrip lstrip! rstrip rstrip! squeeze squeeze! tr tr! tr_s delete_prefix delete_prefix! delete_suffix delete_suffix! upcase upcase! downcase downcase! capitalize capitalize! swapcase ljust rjust center scan unpack1 bytesize succ! each_line each_char".split(
    " ",
  ),
);

/** String methods emitted natively on a value already typed as a string. */
export const NATIVE_STRING = new Set([
  "split",
  "length",
  "isStartWith",
  "isEndWith",
  "isInclude",
  "slice",
  "concat",
]);
