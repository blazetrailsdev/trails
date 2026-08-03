/**
 * A reader for the YAML subset locale files are written in. The gem gets YAML
 * from the Ruby stdlib (`require 'yaml'`, i18n/lib/i18n/backend/base.rb:3) and
 * calls `YAML.load_file` in `load_yml` (base.rb:246); JS has neither, and
 * `packages/i18n` carries no third-party runtime deps.
 *
 * Read here: comments, `---`, block mappings, block and flow sequences, flow
 * mappings, quoted and plain scalars, `~`/`null`, `true`/`false`, integers and
 * floats — verified to cover all 12 locale files vendored under `vendor/rails`
 * and `vendor/i18n`. Anchors, aliases, tags, block scalars (`|`, `>`) and
 * multi-document streams raise, which `load_yml` reports as `InvalidLocaleData`
 * exactly as Psych's `SyntaxError` does.
 */

type Line = { indent: number; text: string; number: number };
type Cursor = { index: number; lines: Line[] };

export function parseYaml(source: string): unknown {
  const lines = scanLines(source.replace(/^\uFEFF/, ""));
  if (lines.length === 0) return null;

  const cursor: Cursor = { index: 0, lines };
  const value = parseNode(cursor, lines[0].indent);
  const trailing = cursor.lines[cursor.index];
  if (trailing) throw syntaxError(trailing, "unexpected content");
  return value;
}

function scanLines(source: string): Line[] {
  const lines: Line[] = [];
  source.split(/\r?\n/).forEach((raw, offset) => {
    const text = stripComment(raw).trimEnd();
    if (text.trim() === "" || text.trim() === "---") return;
    lines.push({ indent: text.length - text.trimStart().length, text, number: offset + 1 });
  });
  return lines;
}

/** First index at/after `from` where `stop` halts, ignoring quoted spans. */
function scanUnquoted(
  text: string,
  from: number,
  stop: (char: string, i: number) => boolean,
): number {
  let quote: string | undefined;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (quote !== undefined) {
      if (char === "\\" && quote === '"') i += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (stop(char, i)) return i;
  }
  return text.length;
}

/** A `#` starts a comment only at the start of a line or after whitespace. */
function stripComment(line: string): string {
  const hash = scanUnquoted(line, 0, (c, i) => c === "#" && (i === 0 || /\s/.test(line[i - 1])));
  return hash === line.length ? line : line.slice(0, hash);
}

function parseNode(cursor: Cursor, indent: number): unknown {
  const text = cursor.lines[cursor.index].text.trimStart();
  return text === "-" || text.startsWith("- ")
    ? parseSequence(cursor, indent)
    : parseMapping(cursor, indent);
}

function parseMapping(cursor: Cursor, indent: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (;;) {
    const line = cursor.lines[cursor.index];
    if (!line || line.indent < indent) break;
    if (line.indent > indent) throw syntaxError(line, "inconsistent indentation");
    const { key, rest } = splitEntry(line);
    cursor.index += 1;
    result[key] = rest === "" ? parseNested(cursor, indent) : parseScalar(rest, line);
  }
  return result;
}

function parseSequence(cursor: Cursor, indent: number): unknown[] {
  const result: unknown[] = [];
  for (;;) {
    const line = cursor.lines[cursor.index];
    if (!line || line.indent < indent) break;
    if (line.indent > indent) throw syntaxError(line, "inconsistent indentation");
    const text = line.text.trimStart();
    if (text !== "-" && !text.startsWith("- ")) break;
    const rest = text.slice(1).trim();
    cursor.index += 1;
    if (rest !== "" && findEntrySeparator(rest) !== -1) {
      throw syntaxError(line, "a mapping inside a block sequence entry is not supported");
    }
    result.push(rest === "" ? parseNested(cursor, indent) : parseScalar(rest, line));
  }
  return result;
}

function parseNested(cursor: Cursor, indent: number): unknown {
  const next = cursor.lines[cursor.index];
  if (!next || next.indent <= indent) return null;
  return parseNode(cursor, next.indent);
}

function splitEntry(line: Line): { key: string; rest: string } {
  const text = line.text.trimStart();
  const separator = findEntrySeparator(text);
  if (separator === -1) throw syntaxError(line, "expected a `key: value` mapping entry");
  return {
    key: String(parseScalar(text.slice(0, separator), line)),
    rest: text.slice(separator + 1).trim(),
  };
}

function findEntrySeparator(text: string): number {
  const colon = scanUnquoted(
    text,
    0,
    (c, i) => c === ":" && (i + 1 === text.length || text[i + 1] === " "),
  );
  return colon === text.length ? -1 : colon;
}

function parseScalar(text: string, line: Line): unknown {
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return unescapeDoubleQuoted(text.slice(1, -1));
  }
  if (text.startsWith("[") || text.startsWith("{")) {
    const [value, end] = parseFlow(text, 0, line);
    if (text.slice(end).trim() !== "")
      throw syntaxError(line, "trailing content after a collection");
    return value;
  }
  if (/^[|>&*!]/.test(text)) {
    throw syntaxError(line, `the YAML construct \`${text[0]}\` is not supported`);
  }
  if (/^(|~|[Nn]ull|NULL)$/.test(text)) return null;
  if (/^([Tt]rue|TRUE)$/.test(text)) return true;
  if (/^([Ff]alse|FALSE)$/.test(text)) return false;
  if (/^[-+]?(0|[1-9]\d*)(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function parseFlow(text: string, i: number, line: Line): [unknown, number] {
  const open = text[i];
  if (open === "[" || open === "{") {
    const close = open === "[" ? "]" : "}";
    const seq: unknown[] = [];
    const map: Record<string, unknown> = {};
    i += 1;
    for (;;) {
      while (text[i] === " " || text[i] === ",") i += 1;
      if (i >= text.length) throw syntaxError(line, `unterminated \`${open}\``);
      if (text[i] === close) return [open === "[" ? seq : map, i + 1];
      const [entry, afterEntry] = parseFlow(text, i, line);
      i = afterEntry;
      if (open === "[") {
        seq.push(entry);
        continue;
      }
      while (text[i] === " ") i += 1;
      if (text[i] !== ":") throw syntaxError(line, "expected `key: value` in a flow mapping");
      const [value, afterValue] = parseFlow(text, i + 1, line);
      map[String(entry)] = value;
      i = afterValue;
    }
  }
  const end = scanUnquoted(text, i, (c) => c === "," || c === "]" || c === "}" || c === ":");
  return [parseScalar(text.slice(i, end).trim(), line), end];
}

function unescapeDoubleQuoted(text: string): string {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_match, escape: string) =>
    escape.startsWith("u")
      ? String.fromCharCode(parseInt(escape.slice(1), 16))
      : ({ n: "\n", t: "\t", r: "\r", "0": "\0" }[escape] ?? escape),
  );
}

function syntaxError(line: Line, message: string): Error {
  const error = new Error(`${message} at line ${line.number} (${line.text.trim()})`);
  error.name = "YamlSyntaxError";
  return error;
}
