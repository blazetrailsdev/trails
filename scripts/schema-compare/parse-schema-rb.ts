// Targeted `create_table` parser for
// vendor/rails/activerecord/test/schema/schema.rb. Deliberately not a Ruby
// parser: it recognises the handful of `t.*` forms schema.rb actually uses and
// records anything else as `dynamic`, so the comparator can soften its verdict
// on tables it could not read completely (rather than reporting a column as
// "invented" when we simply failed to parse its Rails declaration).

/** A column as declared in schema.rb. */
export interface RailsColumn {
  name: string;
  /** Rails column type verbatim (`string`, `bigint`, `references`, ...). */
  type: string;
  options: RailsColumnOptions;
}

export interface RailsColumnOptions {
  null?: boolean;
  limit?: number;
  precision?: number | null;
  scale?: number;
  array?: boolean;
  default?: string;
  polymorphic?: boolean;
}

export interface RailsTable {
  name: string;
  columns: Map<string, RailsColumn>;
  /** `id: false` / `primary_key:` as written on the `create_table` line. */
  primaryKey: string[] | false | null;
  /**
   * Primary-key column names the table has whether or not the block declares
   * them — the implicit `id`, or the names given by `primary_key:`. TEST_SCHEMA
   * usually leaves these implicit too, so they are neither "invented" when
   * present nor "unported" when absent.
   */
  primaryKeyColumns: Set<string>;
  /**
   * True when the block contained a `t.*` line we could not reduce to a column
   * name (e.g. `t.integer "a" * max_identifier_length`). Column-level
   * "invented" verdicts are suppressed for such tables.
   */
  dynamic: boolean;
}

// `t.<type> :name` forms that declare a column directly.
// prettier-ignore
const COLUMN_MACROS = new Set(
  ("string text integer bigint float decimal numeric boolean datetime timestamp date time " +
   "binary blob json jsonb citext hstore uuid interval oid inet cidr macaddr money point " +
   "serial bigserial tsvector virtual enum").split(" "),
);

// Lines inside a create_table block that never declare a column.
const IGNORED_MACROS = new Set(
  "index check_constraint foreign_key exclusion_constraint".split(" "),
);

/**
 * A `create_table` call, optionally on a receiver. Rails declares the
 * `courses` / `colleges` / `professors` cluster as
 * `Course.lease_connection.create_table :courses` — outside the
 * `Schema.define` block entirely — so anchoring on a bare `create_table`
 * silently drops four canonical tables.
 */
const CREATE_TABLE_CALL = /^(?:[A-Za-z_][\w:]*\s*\.\s*[\w.\s]*?)?\bcreate_table\b(.*)$/;

/** Index of the `)` closing the `(` that `text` starts with, or -1. */
function matchingParen(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** A literal table name as a single-element list, or null if not literal. */
function nameOrNull(token: string): string[] | null {
  const name = parseName(token);
  return name === null ? null : [name];
}

/** Strips a trailing `# comment` that is not inside a string literal. */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

/** `:accounts` / `:"1_need_quoting"` / `"CamelCase"` / `'x'` → the bare name. */
function parseName(token: string): string | null {
  const trimmed = token.trim();
  // `:"c_int_#{i}"` inside a Ruby loop is a generated name, not a literal one.
  if (trimmed.includes("#{")) return null;
  const match =
    /^:"([^"]+)"$/.exec(trimmed) ??
    /^:'([^']+)'$/.exec(trimmed) ??
    /^"([^"]+)"$/.exec(trimmed) ??
    /^'([^']+)'$/.exec(trimmed) ??
    /^:([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
  return match ? match[1]! : null;
}

/**
 * Splits an argument list on top-level commas — `default: -> { "X" }` and
 * `primary_key: [:a, :b]` both contain commas that must not split.
 */
function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let current = "";
  for (let i = 0; i < args.length; i++) {
    const ch = args[i]!;
    if (ch === "\\") {
      current += ch + (args[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (!inSingle && !inDouble) {
      if (ch === "[" || ch === "{" || ch === "(") depth++;
      else if (ch === "]" || ch === "}" || ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
}

function parseOptions(args: string[]): RailsColumnOptions {
  const options: RailsColumnOptions = {};
  for (const arg of args) {
    const kv = /^\s*([a-z_]+):\s*(.+)$/.exec(arg);
    if (!kv) continue;
    const [, key, rawValue] = kv as unknown as [string, string, string];
    const value = rawValue.trim();
    switch (key) {
      case "null":
        if (value === "true" || value === "false") options.null = value === "true";
        break;
      case "polymorphic":
        options.polymorphic = value === "true";
        break;
      case "array":
        options.array = value === "true";
        break;
      case "limit":
      case "scale": {
        const n = Number(value);
        if (Number.isFinite(n)) options[key] = n;
        break;
      }
      case "precision":
        options.precision =
          value === "nil" ? null : Number.isFinite(Number(value)) ? Number(value) : undefined;
        break;
      case "default":
        options.default = value;
        break;
      default:
        break;
    }
  }
  return options;
}

/**
 * `create_table :carts, force: true, primary_key: [:shop_id, :id]` → PK spec.
 * `null` means the default implicit `id`; `false` means `id: false`.
 */
function parseTablePrimaryKey(args: string[]): string[] | false | null {
  for (const arg of args) {
    const idMatch = /^\s*id:\s*(.+)$/.exec(arg);
    // `id: :integer` narrows the implicit PK's type but keeps the name `id`.
    if (idMatch && idMatch[1]!.trim() === "false") return false;
    const pkMatch = /^\s*primary_key:\s*(.+)$/.exec(arg);
    if (!pkMatch) continue;
    const value = pkMatch[1]!.trim();
    if (value.startsWith("[")) {
      const inner = value.slice(1, -1);
      const names = splitArgs(inner)
        .map((t) => parseName(t))
        .filter((n): n is string => n !== null);
      return names;
    }
    const single = parseName(value);
    if (single) return [single];
  }
  return null;
}

function addColumn(
  table: RailsTable,
  name: string,
  type: string,
  options: RailsColumnOptions,
): void {
  table.columns.set(name, { name, type, options });
}

/** Applies one `t.*` line to the table under construction. */
function applyColumnLine(table: RailsTable, body: string): void {
  const macroMatch = /^([a-z_]+)\b\s*(.*)$/s.exec(body);
  if (!macroMatch) {
    table.dynamic = true;
    return;
  }
  const macro = macroMatch[1]!;
  const args = splitArgs(macroMatch[2] ?? "");

  if (IGNORED_MACROS.has(macro)) return;

  if (macro === "timestamps") {
    const options = parseOptions(args);
    addColumn(table, "created_at", "datetime", options);
    addColumn(table, "updated_at", "datetime", options);
    return;
  }

  if (macro === "references" || macro === "belongs_to") {
    const options = parseOptions(args.slice(1));
    for (const arg of args) {
      const name = parseName(arg);
      if (!name) continue;
      addColumn(table, `${name}_id`, "references", options);
      if (options.polymorphic) addColumn(table, `${name}_type`, "string", options);
    }
    return;
  }

  if (macro === "primary_key") {
    const name = parseName(args[0] ?? "");
    if (!name) {
      table.dynamic = true;
      return;
    }
    const type = args[1] ? (parseName(args[1]) ?? "integer") : "integer";
    addColumn(table, name, type, parseOptions(args.slice(2)));
    table.primaryKey = [name];
    table.primaryKeyColumns.add(name);
    return;
  }

  if (macro === "column") {
    const name = parseName(args[0] ?? "");
    const type = parseName(args[1] ?? "");
    if (!name || !type) {
      table.dynamic = true;
      return;
    }
    addColumn(table, name, type, parseOptions(args.slice(2)));
    return;
  }

  if (!COLUMN_MACROS.has(macro)) {
    table.dynamic = true;
    return;
  }

  // `t.string :a, :b, limit: 1` declares every leading symbol/string arg.
  let declared = 0;
  for (const arg of args) {
    const name = parseName(arg);
    if (name === null) break;
    declared++;
  }
  if (declared === 0) {
    table.dynamic = true;
    return;
  }
  const options = parseOptions(args.slice(declared));
  for (let i = 0; i < declared; i++) {
    addColumn(table, parseName(args[i]!)!, macro, options);
  }
}

/**
 * Parses every `create_table` block in a schema.rb source into a table map.
 * Later definitions of the same table win, matching Ruby execution order.
 */
export function parseSchemaRb(source: string): Map<string, RailsTable> {
  return parseSchemaRbWithCoverage(source).tables;
}

export interface ParseResult {
  tables: Map<string, RailsTable>;
  /**
   * `create_table` call sites whose table name the parser could not resolve.
   * This is the honest coverage signal: it is produced by the parser itself as
   * it fails, so — unlike re-scanning the source with the same regex the parser
   * uses — it cannot share the parser's blind spots and quietly self-confirm.
   */
  unresolved: string[];
  /** Total `create_table` call sites seen, resolved or not. */
  callSites: number;
}

export function parseSchemaRbWithCoverage(source: string): ParseResult {
  const tables = new Map<string, RailsTable>();
  const unresolved: string[] = [];
  const callSites: string[] = [];
  const lines = source.split("\n");
  let table: RailsTable | null = null;
  let depth = 0;
  let pendingEach: { variable: string; names: string[] } | null = null;

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (line === "") continue;

    if (table === null) {
      // Remember `[:circles, :squares].each do |t|` so a `create_table(t, ...)`
      // inside it can resolve its block variable to the literal names.
      const eachMatch = /^\[(.+)\]\.each\s+do\s*\|(\w+)\|\s*$/.exec(line);
      if (eachMatch) {
        const names = splitArgs(eachMatch[1]!)
          .map((token) => parseName(token))
          .filter((n): n is string => n !== null);
        pendingEach = names.length > 0 ? { variable: eachMatch[2]!, names } : null;
        continue;
      }
      if (pendingEach && /^end\b/.test(line)) {
        pendingEach = null;
        continue;
      }

      const createMatch = CREATE_TABLE_CALL.exec(line);
      if (!createMatch) continue;
      callSites.push(line);
      // `OtherDog.lease_connection.create_table :dogs` builds a same-named
      // table in a SECOND database; it is not a redefinition of the primary
      // `dogs` and must not clobber that one's columns.
      const onOtherConnection = !/^create_table\b/.test(line);
      let rest = createMatch[1]!;
      // `create_table(t, force: true) { }` — parenthesised args, brace block.
      const parenthesised = rest.startsWith("(");
      let braceBlock = false;
      if (parenthesised) {
        const close = matchingParen(rest);
        if (close === -1) {
          unresolved.push(line);
          continue;
        }
        braceBlock = /^\s*\{/.test(rest.slice(close + 1));
        rest = rest.slice(1, close);
      }
      const doIndex = parenthesised ? -1 : rest.search(/\bdo\s*\|/);
      const argsSource = doIndex === -1 ? rest : rest.slice(0, doIndex);
      const args = splitArgs(argsSource);
      const first = (args[0] ?? "").trim();
      // The name is a literal, or the enclosing `.each` block variable.
      const names =
        pendingEach && first === pendingEach.variable ? pendingEach.names : nameOrNull(first);
      if (names === null) {
        unresolved.push(line);
        continue;
      }
      const primaryKey = parseTablePrimaryKey(args.slice(1));
      const build = (name: string): RailsTable => ({
        name,
        columns: new Map(),
        primaryKey,
        primaryKeyColumns: new Set(
          primaryKey === false ? [] : primaryKey === null ? ["id"] : primaryKey,
        ),
        dynamic: false,
      });
      // A loop or brace-block form declares complete tables on this line;
      // `create_table :carriers, force: true` likewise has no block at all.
      if (names.length > 1 || braceBlock || doIndex === -1) {
        for (const name of names) {
          if (onOtherConnection && tables.has(name)) continue;
          tables.set(name, build(name));
        }
        continue;
      }
      if (onOtherConnection && tables.has(names[0]!)) continue;
      table = build(names[0]!);
      depth = 1;
      continue;
    }

    // Inside a create_table block: track nesting so the matching `end` closes
    // the table rather than an inner `if`/`do`.
    if (/^(if|unless|case|begin)\b/.test(line)) depth++;
    if (/\bdo\s*(\|.*\|)?\s*$/.test(line)) depth++;
    if (/^end\b/.test(line)) {
      depth--;
      if (depth === 0) {
        tables.set(table.name, table);
        table = null;
      }
      continue;
    }

    const tMatch = /^t\.(.+)$/s.exec(line);
    if (tMatch) applyColumnLine(table, tMatch[1]!);
  }

  // A block left open at EOF means the nesting tracker lost sync — report the
  // call site rather than silently dropping the table.
  if (table !== null) unresolved.push(`unterminated block for ${table.name}`);

  return { tables, unresolved, callSites: callSites.length };
}
