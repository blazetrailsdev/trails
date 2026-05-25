/** Splits `<name>.<locale>.<format>+<variant>.<handler>` per Rails' filename
 * grammar (resolver.rb PathParser). The caller passes a set of known format
 * symbols so tse-compiler stays actionpack-free — pass
 * `new Set(MimeType.SET.symbols)` at call time. */

export interface ParsedFilename {
  name: string;
  locale: string | null;
  format: string;
  variant: string | null;
  handler: string | null;
}

// Matches Rails locale tokens: two-letter lang code with optional region.
const LOCALE_RE = /^[a-z]{2}(?:[-_][A-Z]{2})?$/;

/**
 * Parse a template filename into its structural parts.
 *
 * Algorithm mirrors Rails' `Resolver::PathParser#build_path_regex`:
 * - Strip directory prefix; keep it on `name`.
 * - Last `.`-separated token → `handler` (if any token follows).
 * - Preceding token → `<format>[+<variant>]` if `format` is in `knownFormats`.
 * - Preceding token → `locale` if it matches the locale pattern.
 * - Everything else joins back as the template name.
 * - `format` defaults to `"html"` when absent (Rails `Template#format` fallback).
 */
export function parseFilename(path: string, knownFormats: Set<string>): ParsedFilename {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const base = slash === -1 ? path : path.slice(slash + 1);

  const tokens = base.split(".");

  // At least two tokens needed for a handler suffix.
  let handler: string | null = null;
  if (tokens.length >= 2) {
    handler = tokens.pop()!;
  }

  // Check if the next token is <format>[+<variant>].
  let format: string | null = null;
  let variant: string | null = null;
  if (tokens.length >= 1) {
    const candidate = tokens[tokens.length - 1]!;
    const plusIdx = candidate.indexOf("+");
    const formatToken = plusIdx === -1 ? candidate : candidate.slice(0, plusIdx);
    if (knownFormats.has(formatToken)) {
      tokens.pop();
      format = formatToken;
      variant = plusIdx === -1 ? null : candidate.slice(plusIdx + 1) || null;
    }
  }

  // Locale may appear with or without an explicit format (Rails: `action.locale.format.handler`
  // or `action.locale.handler`). Guard: require at least one remaining token for the name so
  // a bare two-letter filename (`en.tse`) doesn't produce an empty name.
  let locale: string | null = null;
  if (tokens.length >= 2 && LOCALE_RE.test(tokens[tokens.length - 1]!)) {
    locale = tokens.pop()!;
  }

  return {
    name: dir + tokens.join("."),
    locale,
    format: format ?? "html",
    variant,
    handler,
  };
}
