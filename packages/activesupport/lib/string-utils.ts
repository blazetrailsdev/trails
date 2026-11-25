import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import type { Range } from "@blazetrails/ruby-compat/range";
import { strSlice } from "@blazetrails/ruby-compat/string/slice";
export { isBlank, isPresent } from "./core-ext/object/blank.js";

export function squish(str: string): string {
  return str.replace(/[\s\u0085]+/g, " ").replace(/^[\s\u0085]+|[\s\u0085]+$/g, "");
}

export function truncate(
  str: string,
  length: number,
  options: { omission?: string; separator?: string | RegExp } = {},
): string {
  const { omission = "...", separator } = options;
  if (str.length <= length) return str;
  const truncateAt = Math.max(0, length - omission.length);
  if (separator) {
    const searchStr = str.slice(0, truncateAt + 1);
    const sepPattern =
      typeof separator === "string"
        ? new RegExp(separator.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g")
        : new RegExp(
            separator.source,
            separator.flags.includes("g") ? separator.flags : separator.flags + "g",
          );
    let lastIndex = -1;
    let match: RegExpExecArray | null;
    while ((match = sepPattern.exec(searchStr)) !== null) {
      if (match[0].length === 0) {
        sepPattern.lastIndex++;
        continue;
      }
      lastIndex = match.index;
    }
    if (lastIndex >= 0) return str.slice(0, lastIndex) + omission;
  }
  return str.slice(0, truncateAt) + omission;
}

export function truncateWords(
  str: string,
  count: number,
  options: { omission?: string; separator?: string | RegExp } = {},
): string {
  const { omission = "...", separator } = options;
  if (separator) {
    const parts = str.split(separator);
    if (parts.length <= count) return str;
    const joinStr = typeof separator === "string" ? separator : (str.match(separator)?.[0] ?? "");
    return parts.slice(0, count).join(joinStr) + omission;
  }
  const words = str.split(/\s+/);
  if (words.length <= count) return str;
  return words.slice(0, count).join(" ") + omission;
}

export function truncateBytes(
  str: string,
  truncateTo: number,
  { omission = "\u2026" }: { omission?: string | null } = {},
): string {
  omission ||= "";
  const bytesize = (s: string) => new TextEncoder().encode(s).length;

  if (bytesize(str) <= truncateTo) {
    return str;
  } else if (bytesize(omission) > truncateTo) {
    throw new ArgumentError(
      `Omission ${JSON.stringify(omission)} is ${bytesize(omission)}, larger than the truncation length of ${truncateTo} bytes`,
    );
  } else if (bytesize(omission) === truncateTo) {
    return omission;
  } else {
    let cut = "";
    const cutAt = truncateTo - bytesize(omission);

    for (const { segment: grapheme } of new Intl.Segmenter().segment(str)) {
      if (bytesize(cut) + bytesize(grapheme) <= cutAt) {
        cut += grapheme;
      } else {
        break;
      }
    }

    return cut + omission;
  }
}

export function remove(str: string, ...patterns: (string | RegExp)[]): string {
  let result = str;
  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      result = result.split(pattern).join("");
    } else {
      const global = pattern.flags.includes("g")
        ? pattern
        : new RegExp(pattern.source, pattern.flags + "g");
      result = result.replace(global, "");
    }
  }
  return result;
}

export function stripHeredoc(str: string): string {
  const lines = str.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return str;
  const minIndent = Math.min(...nonEmptyLines.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0));
  return lines.map((l) => l.slice(minIndent)).join("\n");
}

export function at(str: string, position: number | Range<number | null> | RegExp): string | null {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- TS 6 lint resolves strSlice overloads differently from tsc 7
  return strSlice(str, position as number);
}

export function exclude(str: string, search: string): boolean {
  return !str.includes(search);
}

export function first(str: string, limit = 1): string {
  const result = strSlice(str, 0, limit);
  if (result == null) throw new ArgumentError("negative limit");
  return result;
}

export function last(str: string, limit = 1): string {
  const result = strSlice(str, Math.max(str.length - limit, 0), limit);
  if (result == null) throw new ArgumentError("negative limit");
  return result;
}

export function from(str: string, position: number): string | null {
  return strSlice(str, position, str.length);
}

export function to(str: string, position: number): string {
  if (position < 0) position += str.length;
  return strSlice(str, 0, position + 1) ?? "";
}

export function indentBang(
  str: string,
  amount: number,
  indentString: string | null = null,
  indentEmptyLines: boolean = false,
): string | null {
  indentString = indentString || str.match(/^[ \t]/m)?.[0] || " ";
  const re = indentEmptyLines ? /^/gm : /^(?!$)/gm;
  if (!re.test(str)) return null;
  re.lastIndex = 0;
  return str.replace(re, indentString.repeat(amount));
}

export function indent(
  str: string,
  amount: number,
  indentString: string | null = null,
  indentEmptyLines: boolean = false,
): string {
  const _ = str;
  return indentBang(_, amount, indentString, indentEmptyLines) ?? _;
}
