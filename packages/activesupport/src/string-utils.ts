export { isBlank, isPresent } from "./core-ext/object/blank.js";

export function squish(str: string): string {
  return str.trim().replace(/\s+/g, " ");
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
  byteLimit: number,
  options: { omission?: string | null } = {},
): string {
  const omission = options.omission === undefined ? "…" : options.omission;
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(str);
  if (strBytes.length <= byteLimit) return str;

  if (byteLimit <= 0) return "";
  const omissionBytes = omission ? encoder.encode(omission).length : 0;
  if (omissionBytes > byteLimit) return "";
  const available = byteLimit - omissionBytes;

  const truncated = new Uint8Array(strBytes.buffer, 0, available);
  let decoded = new TextDecoder().decode(truncated);
  decoded = decoded.replace(/\uFFFD+$/, "");

  return decoded + (omission || "");
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

export function at(str: string, pos: number | [number, number] | RegExp): string | undefined {
  if (pos instanceof RegExp) {
    const m = str.match(pos);
    return m ? m[0] : undefined;
  }
  if (Array.isArray(pos)) {
    const [start, end] = pos;
    const s = start < 0 ? str.length + start : start;
    const e = end < 0 ? str.length + end : end;
    if (s < 0 || s >= str.length) return undefined;
    return str.slice(s, e + 1);
  }
  const idx = pos < 0 ? str.length + pos : pos;
  if (idx < 0 || idx >= str.length) return undefined;
  return str[idx];
}

export function exclude(str: string, search: string): boolean {
  return !str.includes(search);
}

export function first(str: string, n?: number): string {
  if (n === undefined) return str.slice(0, 1);
  if (n < 0) throw new Error("negative length");
  return str.slice(0, n);
}

export function last(str: string, n?: number): string {
  if (n === undefined) return str.slice(-1);
  if (n < 0) throw new Error("negative length");
  if (n === 0) return "";
  return str.slice(-n);
}

export function from(str: string, pos: number): string {
  const idx = pos < 0 ? Math.max(0, str.length + pos) : pos;
  return str.slice(idx);
}

export function to(str: string, pos: number): string {
  const idx = pos < 0 ? str.length + pos : pos;
  if (idx < 0) return "";
  return str.slice(0, idx + 1);
}

export function indent(
  str: string,
  n: number,
  char: string = " ",
  indentEmptyLines: boolean = false,
): string {
  const pad = char.repeat(n);
  return str
    .split("\n")
    .map((line) => {
      if (line.length === 0 && !indentEmptyLines) return line;
      return pad + line;
    })
    .join("\n");
}
