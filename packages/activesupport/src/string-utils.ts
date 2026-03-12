/**
 * String utilities mirroring Rails ActiveSupport string extensions.
 */

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return /^\s*$/.test(value);
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function isPresent(value: unknown): boolean {
  return !isBlank(value);
}

export function presence<T>(value: T): T | undefined {
  return isPresent(value) ? value : undefined;
}

export function squish(str: string): string {
  return str.trim().replace(/\s+/g, " ");
}

export function truncate(str: string, length: number, options: { omission?: string } = {}): string {
  const { omission = "..." } = options;
  if (str.length <= length) return str;
  return str.slice(0, length - omission.length) + omission;
}

export function truncateWords(
  str: string,
  count: number,
  options: { omission?: string } = {},
): string {
  const { omission = "..." } = options;
  const words = str.split(/\s+/);
  if (words.length <= count) return str;
  return words.slice(0, count).join(" ") + omission;
}

/**
 * Strips indentation by removing the amount of leading whitespace of the least
 * indented non-empty line from every line.
 */
export function stripHeredoc(str: string): string {
  const lines = str.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return str;
  const minIndent = Math.min(...nonEmptyLines.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0));
  return lines.map((l) => l.slice(minIndent)).join("\n");
}

/** Lowercase the first character of a string. */
export function downcaseFirst(str: string): string {
  if (str.length === 0) return str;
  return str[0].toLowerCase() + str.slice(1);
}

/** Uppercase the first character of a string. */
export function upcaseFirst(str: string): string {
  if (str.length === 0) return str;
  return str[0].toUpperCase() + str.slice(1);
}

/**
 * Returns the character at the given position (supports negative indexing).
 * Returns undefined if out of range.
 */
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

/** Rails String#exclude? — returns true if the string does not include the substring */
export function exclude(str: string, search: string): boolean {
  return !str.includes(search);
}

/**
 * Returns the first n characters of the string (default 1).
 * Raises if n is negative (mirrors Rails behaviour).
 */
export function first(str: string, n?: number): string {
  if (n === undefined) return str.slice(0, 1);
  if (n < 0) throw new Error("negative length");
  return str.slice(0, n);
}

/**
 * Returns the last n characters of the string (default 1).
 * Raises if n is negative (mirrors Rails behaviour).
 */
export function last(str: string, n?: number): string {
  if (n === undefined) return str.slice(-1);
  if (n < 0) throw new Error("negative length");
  if (n === 0) return "";
  return str.slice(-n);
}

/** Returns the substring from position pos to the end (supports negative). */
export function from(str: string, pos: number): string {
  const idx = pos < 0 ? Math.max(0, str.length + pos) : pos;
  return str.slice(idx);
}

/**
 * Returns the substring from the beginning up to and including position pos
 * (supports negative indexing). Returns "" if pos is out of range on the left.
 */
export function to(str: string, pos: number): string {
  const idx = pos < 0 ? str.length + pos : pos;
  if (idx < 0) return "";
  return str.slice(0, idx + 1);
}

/**
 * Indents every non-empty line (and optionally blank lines) by n repetitions
 * of char (default " "). Mirrors Rails String#indent.
 */
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
