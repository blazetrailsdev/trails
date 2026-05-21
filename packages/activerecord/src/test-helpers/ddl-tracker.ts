/**
 * Module-level DDL tracking for the shared test adapter.
 *
 * Maintained passively by {@link recordDdlTracking} after a successful
 * CREATE/DROP TABLE on the wrapper (`TestAdapterFixtures.executeMutation`
 * and `exec`). Consumed by `defineSchema`'s cache-invalidation logic via
 * `adapterKnownTables` (reads through the wrapper's `tables` getter) and
 * snapshot/restored by `withTransactionalFixtures` so DDL applied inside
 * an `it()` body doesn't leak across a rolled-back outer transaction.
 *
 * @internal
 */

const _createdTables = new Set<string>();
const _createdColumns = new Map<string, Set<string>>();

/** @internal */
export function getCreatedTables(): Set<string> {
  return _createdTables;
}

/** @internal */
export function getCreatedColumns(): Map<string, Set<string>> {
  return _createdColumns;
}

/** @internal */
export function clearDdlTrackers(): void {
  _createdTables.clear();
  _createdColumns.clear();
}

/**
 * Snapshot the global DDL trackers so a wrapping `withTransactionalFixtures`
 * scope can restore them after the outer transaction rolls back. DDL parsed
 * during an `it()` body adds entries to `_createdTables` / `_createdColumns`
 * (via `recordDdlTracking`); the rollback reverts the DDL on the DB side, but
 * the trackers would otherwise report the rolled-back table as still-created.
 *
 * Today this is harmless because `defineSchema` consults its signature cache
 * first (which is snapshot/restored via `_snapshotAppliedSchemaSignaturesForAdapter`).
 * But a future test pattern — `defineSchema` in `beforeAll` plus raw
 * `createTable` inside an `it()` body — would leak. Snapshot/restore plugs
 * that gap before it surfaces.
 *
 * @internal
 */
export function snapshotDdlTrackers(): {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
} {
  const columns = new Map<string, Set<string>>();
  for (const [k, v] of _createdColumns) columns.set(k, new Set(v));
  return { tables: new Set(_createdTables), columns };
}

/** @internal */
export function restoreDdlTrackers(snapshot: {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
}): void {
  _createdTables.clear();
  for (const t of snapshot.tables) _createdTables.add(t);
  _createdColumns.clear();
  for (const [k, v] of snapshot.columns) _createdColumns.set(k, new Set(v));
}

/**
 * Extract the top-level column names from a `CREATE TABLE ... (...)` body.
 * Used to seed `_createdColumns` so `defineSchema`'s cache-invalidation
 * logic has accurate per-table column sets.
 *
 * Tracks paren depth so a nested type like `DECIMAL(10,2)` doesn't count
 * as a top-level comma; identifiers may be quoted with `"`, `` ` ``, or
 * unquoted. Skips quoted SQL literals so a default like `DEFAULT ')'`
 * doesn't close the column list. Returns `Set(["id"])` if no body is found.
 *
 * @internal exported for unit testing.
 */
export function parseCreateTableColumns(sql: string): Set<string> {
  const m = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?\w+["`]?\s*\(/i);
  if (!m) return new Set(["id"]);
  const start = m.index! + m[0].length;

  const skipQuoted = (i: number, quote: string): number => {
    i++;
    while (i < sql.length) {
      const ch = sql[i];
      if (quote === "'" && ch === "\\" && i + 1 < sql.length) {
        i += 2;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        return i + 1;
      }
      i++;
    }
    return i;
  };

  let depth = 1;
  let end = -1;
  let i = start;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(i, ch);
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    i++;
  }
  if (end < 0) return new Set(["id"]);

  const cols = new Set<string>();
  const body = sql.slice(start, end);
  let part = "";
  let pd = 0;
  const flush = () => {
    const piece = part.trim();
    part = "";
    if (!piece) return;
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\b|INDEX\b|KEY\b|CHECK\b|CONSTRAINT\b)/i.test(piece))
      return;
    const colMatch = piece.match(/^(?:["`](\w+)["`]|(\w+))/);
    if (colMatch) cols.add(colMatch[1] ?? colMatch[2]);
  };
  let j = 0;
  while (j < body.length) {
    const ch = body[j];
    if (ch === "'" || ch === '"' || ch === "`") {
      const next = skipQuoted(start + j, ch) - start;
      part += body.slice(j, next);
      j = next;
      continue;
    }
    if (ch === "(") pd++;
    else if (ch === ")") pd--;
    if (ch === "," && pd === 0) {
      flush();
      j++;
      continue;
    }
    part += ch;
    j++;
  }
  flush();
  if (cols.size === 0) cols.add("id");
  return cols;
}

/**
 * Update `_createdTables`/`_createdColumns` after a CREATE TABLE or DROP TABLE
 * has successfully executed. For CREATE: when the table was already tracked,
 * the CREATE was likely `IF NOT EXISTS` against a pre-existing table whose
 * real column set may differ from the SQL we're parsing — fall back to
 * `{id}` rather than recording columns that might not exist.
 *
 * @internal
 */
export function recordDdlTracking(
  sql: string,
  createMatch: RegExpMatchArray | null,
  dropMatch: RegExpMatchArray | null,
): void {
  if (createMatch) {
    const table = createMatch[1] ?? createMatch[2];
    const wasTracked = _createdTables.has(table);
    _createdTables.add(table);
    if (!_createdColumns.has(table)) {
      _createdColumns.set(table, wasTracked ? new Set(["id"]) : parseCreateTableColumns(sql));
    }
  }
  if (dropMatch) {
    const table = dropMatch[1] ?? dropMatch[2];
    _createdTables.delete(table);
    _createdColumns.delete(table);
  }
}
