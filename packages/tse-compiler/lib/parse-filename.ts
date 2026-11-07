export interface ParsedFilename {
  name: string;
  locale: string | null;
  format: string;
  variant: string | null;
  handler: string | null;
}

const LOCALE_RE = /^[a-z]{2}(?:[-_][A-Z]{2})?$/;

export function parseFilename(path: string, knownFormats: Set<string>): ParsedFilename {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const base = slash === -1 ? path : path.slice(slash + 1);

  const tokens = base.split(".");

  let handler: string | null = null;
  if (tokens.length >= 2) {
    handler = tokens.pop()!;
  }

  let format: string | null = null;
  let variant: string | null = null;
  if (tokens.length >= 1) {
    const candidate = tokens[tokens.length - 1];
    const plusIdx = candidate.indexOf("+");
    const formatToken = plusIdx === -1 ? candidate : candidate.slice(0, plusIdx);
    if (knownFormats.has(formatToken)) {
      tokens.pop();
      format = formatToken;
      variant = plusIdx === -1 ? null : candidate.slice(plusIdx + 1) || null;
    }
  }

  let locale: string | null = null;
  if (tokens.length >= 2 && LOCALE_RE.test(tokens[tokens.length - 1])) {
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
