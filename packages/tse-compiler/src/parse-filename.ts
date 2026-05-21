/** Splits `<name>.<format>.<handler>` per Rails' filename grammar (plan §2.2).
 * Locale folds into `name` (`show.en.html.tse` → `show.en`); variant stays
 * glued to `format` (`show.html+phone.tse` → `html+phone`). Splitting these
 * into their own fields is a follow-up tied to the LookupContext port. */

export interface ParsedFilename {
  name: string;
  format: string | null;
  handler: string | null;
}

export function parseFilename(path: string): ParsedFilename {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const base = slash === -1 ? path : path.slice(slash + 1);
  const segments = base.split(".");
  if (segments.length < 2) return { name: dir + base, format: null, handler: null };
  const handler = segments.pop()!;
  const format = segments.length > 1 ? segments.pop()! : null;
  return { name: dir + segments.join("."), format, handler };
}
