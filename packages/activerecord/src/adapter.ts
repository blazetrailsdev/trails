/**
 * Database adapter interface — pluggable backends.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */
export interface DatabaseAdapter {
  /**
   * Execute a SQL query and return rows.
   */
  execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;

  /**
   * Execute a SQL statement that modifies data (INSERT/UPDATE/DELETE).
   * Returns the number of affected rows (or the inserted ID for INSERT).
   */
  executeMutation(sql: string, binds?: unknown[]): Promise<number>;

  /**
   * Begin a transaction.
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit a transaction.
   */
  commit(): Promise<void>;

  /**
   * Rollback a transaction.
   */
  rollback(): Promise<void>;

  /**
   * Create a savepoint.
   */
  createSavepoint(name: string): Promise<void>;

  /**
   * Release a savepoint.
   */
  releaseSavepoint(name: string): Promise<void>;

  /**
   * Rollback to a savepoint.
   */
  rollbackToSavepoint(name: string): Promise<void>;

  /**
   * Return the query execution plan.
   * Optional — not all adapters support this.
   */
  explain?(sql: string): Promise<string>;
}

/**
 * In-memory adapter for testing — stores data in Maps.
 */
export class MemoryAdapter implements DatabaseAdapter {
  private tables = new Map<string, Record<string, unknown>[]>();
  private autoIncrements = new Map<string, number>();

  async explain(sql: string): Promise<string> {
    return `MemoryAdapter: EXPLAIN for: ${sql}`;
  }

  async execute(sql: string): Promise<Record<string, unknown>[]> {
    // Strip SQL comments (from annotate())
    sql = sql.replace(/\/\*[^*]*\*\//g, "").trim();

    // Set operations: (left) UNION|INTERSECT|EXCEPT (right)
    const setOpMatch = sql.match(
      /^\((.+)\)\s+(UNION ALL|UNION|INTERSECT|EXCEPT)\s+\((.+)\)$/is
    );
    if (setOpMatch) {
      const [, leftSql, op, rightSql] = setOpMatch;
      const leftRows = await this.execute(leftSql);
      const rightRows = await this.execute(rightSql);
      const upperOp = op.toUpperCase();
      if (upperOp === "UNION ALL") {
        return [...leftRows, ...rightRows];
      }
      if (upperOp === "UNION") {
        const seen = new Set<string>();
        const result: Record<string, unknown>[] = [];
        for (const row of [...leftRows, ...rightRows]) {
          const key = JSON.stringify(row);
          if (!seen.has(key)) {
            seen.add(key);
            result.push(row);
          }
        }
        return result;
      }
      if (upperOp === "INTERSECT") {
        const rightKeys = new Set(rightRows.map(r => JSON.stringify(r)));
        return leftRows.filter(r => rightKeys.has(JSON.stringify(r)));
      }
      if (upperOp === "EXCEPT") {
        const rightKeys = new Set(rightRows.map(r => JSON.stringify(r)));
        return leftRows.filter(r => !rightKeys.has(JSON.stringify(r)));
      }
    }

    // Strip trailing lock clause (FOR UPDATE, etc.) before parsing
    let cleanedSql = sql.replace(/\s+FOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)(\s+.*)?$/i, "");

    // Grouped aggregate queries: SELECT group_col, AGG(col) FROM ... GROUP BY col [LIMIT n] [OFFSET n]
    const groupAggMatch = cleanedSql.match(
      /SELECT\s+"?\w+"?\."?(\w+)"?\s*AS\s+group_key\s*,\s*(COUNT|SUM|AVG|MIN|MAX)\((\*|"?\w+"?(?:\."?\w+"?)?)\)\s*AS\s+val\s+FROM\s+"(\w+)"(?:\s+WHERE\s+(.+?))?\s+GROUP\s+BY\s+"?\w+"?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/i
    );
    if (groupAggMatch) {
      const [, groupCol, fn, colExpr, tableName, where, limitStr, offsetStr] = groupAggMatch;
      let rows = [...(this.tables.get(tableName) ?? [])];
      if (where) {
        rows = rows.filter((row) => this.evaluateWhere(row, where));
      }

      // Group rows by the group column
      const groups = new Map<unknown, Record<string, unknown>[]>();
      for (const row of rows) {
        const key = row[groupCol];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      const upperFn = fn.toUpperCase();
      const results: Record<string, unknown>[] = [];
      for (const [key, groupRows] of groups) {
        let val: number;
        if (upperFn === "COUNT") {
          if (colExpr === "*") {
            val = groupRows.length;
          } else {
            const col = colExpr.replace(/"/g, "").split(".").pop()!;
            val = groupRows.filter((r) => r[col] !== null && r[col] !== undefined).length;
          }
        } else {
          const col = colExpr.replace(/"/g, "").split(".").pop()!;
          const nums = groupRows
            .map((r) => r[col])
            .filter((v) => v !== null && v !== undefined)
            .map(Number);
          if (nums.length === 0) {
            val = 0;
          } else if (upperFn === "SUM") {
            val = nums.reduce((a, b) => a + b, 0);
          } else if (upperFn === "AVG") {
            val = nums.reduce((a, b) => a + b, 0) / nums.length;
          } else if (upperFn === "MIN") {
            val = Math.min(...nums);
          } else if (upperFn === "MAX") {
            val = Math.max(...nums);
          } else {
            val = 0;
          }
        }
        results.push({ group_key: key, val });
      }
      let finalResults = results;
      if (offsetStr) finalResults = finalResults.slice(parseInt(offsetStr));
      if (limitStr) finalResults = finalResults.slice(0, parseInt(limitStr));
      return finalResults;
    }

    // Aggregate queries: COUNT(*), COUNT(col), COUNT(DISTINCT col), SUM, AVG, MIN, MAX
    const aggMatch = cleanedSql.match(
      /SELECT\s+(COUNT|SUM|AVG|MIN|MAX)\((DISTINCT\s+)?(\*|"?\w+"?(?:\."?\w+"?)?)\)\s*(?:AS\s+\w+\s+)?FROM\s+"(\w+)"(?:\s+WHERE\s+(.+?))?$/i
    );
    if (aggMatch) {
      const [, fn, distinctFlag, colExpr, tableName, where] = aggMatch;
      const isDistinct = !!distinctFlag;
      let rows = [...(this.tables.get(tableName) ?? [])];
      if (where) {
        rows = rows.filter((row) => this.evaluateWhere(row, where));
      }
      const upperFn = fn.toUpperCase();
      if (upperFn === "COUNT") {
        if (colExpr === "*") {
          if (isDistinct) {
            // COUNT(DISTINCT *) — count unique row combos (unusual, treat as normal count)
            return [{ count: rows.length }];
          }
          return [{ count: rows.length }];
        }
        const col = colExpr.replace(/"/g, "").split(".").pop()!;
        const nonNull = rows.filter((r) => r[col] !== null && r[col] !== undefined);
        if (isDistinct) {
          const uniqueValues = new Set(nonNull.map((r) => r[col]));
          return [{ count: uniqueValues.size }];
        }
        return [{ count: nonNull.length }];
      }
      const col = colExpr.replace(/"/g, "").split(".").pop()!;
      const nums = rows
        .map((r) => r[col])
        .filter((v) => v !== null && v !== undefined)
        .map(Number);
      if (nums.length === 0) return [{ val: null }];
      if (upperFn === "SUM") return [{ val: nums.reduce((a, b) => a + b, 0) }];
      if (upperFn === "AVG") return [{ val: nums.reduce((a, b) => a + b, 0) / nums.length }];
      if (upperFn === "MIN") return [{ val: Math.min(...nums) }];
      if (upperFn === "MAX") return [{ val: Math.max(...nums) }];
      return [{ val: null }];
    }

    // Handle JOIN queries
    const joinMatch = cleanedSql.match(
      /SELECT\s+(.+?)\s+FROM\s+"(\w+)"\s+((?:(?:INNER|LEFT\s+OUTER)\s+JOIN\s+.+?\s+ON\s+.+?\s*)+)(?:WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/i
    );
    if (joinMatch) {
      const [, projections, tableName, joinsPart, where, orderBy, limit, offset] = joinMatch;
      let rows = [...(this.tables.get(tableName) ?? [])];

      // Parse and apply joins
      const joinRegex = /(INNER|LEFT\s+OUTER)\s+JOIN\s+"(\w+)"\s+ON\s+(.+?)(?=\s+(?:INNER|LEFT\s+OUTER)\s+JOIN|\s+WHERE|\s+ORDER|\s+LIMIT|\s+OFFSET|$)/gi;
      let jm: RegExpExecArray | null;
      while ((jm = joinRegex.exec(joinsPart)) !== null) {
        const [, joinType, joinTable, onCondition] = jm;
        const rightRows = [...(this.tables.get(joinTable) ?? [])];
        const isLeft = joinType.toUpperCase().includes("LEFT");

        const newRows: Record<string, unknown>[] = [];
        for (const leftRow of rows) {
          let matched = false;
          for (const rightRow of rightRows) {
            const combinedRow: Record<string, unknown> = { ...leftRow, ...rightRow };
            if (this.evaluateWhere(combinedRow, onCondition.trim())) {
              newRows.push(combinedRow);
              matched = true;
            }
          }
          if (!matched && isLeft) {
            const nullRow: Record<string, unknown> = { ...leftRow };
            newRows.push(nullRow);
          }
        }
        rows = newRows;
      }

      if (where) {
        rows = rows.filter((row) => this.evaluateWhere(row, where));
      }
      if (orderBy) {
        rows = this.applyOrder(rows, orderBy);
      }
      if (offset) {
        rows = rows.slice(parseInt(offset));
      }
      if (limit) {
        rows = rows.slice(0, parseInt(limit));
      }
      if (projections.trim() !== "*") {
        const cols = projections.split(",").map((c) => {
          const parts = c.trim().replace(/"/g, "").split(".");
          return parts[parts.length - 1];
        });
        rows = rows.map((row) => {
          const result: Record<string, unknown> = {};
          for (const col of cols) {
            result[col] = row[col];
          }
          return result;
        });
      }
      return rows;
    }

    // Simple SQL parser for SELECT queries against in-memory store
    const selectMatch = cleanedSql.match(
      /SELECT\s+(DISTINCT\s+)?(.+?)\s+FROM\s+"(\w+)"(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/i
    );

    if (selectMatch) {
      const [, distinctFlag, projections, tableName, where, orderBy, limit, offset] =
        selectMatch;
      const isDistinct = !!distinctFlag;
      let rows = [...(this.tables.get(tableName) ?? [])];

      if (where) {
        rows = rows.filter((row) => this.evaluateWhere(row, where));
      }

      if (orderBy) {
        rows = this.applyOrder(rows, orderBy);
      }

      if (offset) {
        rows = rows.slice(parseInt(offset));
      }

      if (limit) {
        rows = rows.slice(0, parseInt(limit));
      }

      if (projections.trim() !== "*") {
        const cols = projections.split(",").map((c) => {
          const parts = c.trim().replace(/"/g, "").split(".");
          return parts[parts.length - 1];
        });
        rows = rows.map((row) => {
          const result: Record<string, unknown> = {};
          for (const col of cols) {
            result[col] = row[col];
          }
          return result;
        });

        if (isDistinct) {
          const seen = new Set<string>();
          rows = rows.filter((row) => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      }

      return rows;
    }

    return [];
  }

  async executeMutation(sql: string): Promise<number> {
    // Strip SQL comments (from annotate())
    sql = sql.replace(/\/\*[^*]*\*\//g, "").trim();

    // INSERT (supports multi-row VALUES and ON CONFLICT)
    const insertMatch = sql.match(
      /INSERT\s+INTO\s+"(\w+)"\s+\((.*?)\)\s+VALUES\s+(.+?)(?:\s+ON\s+CONFLICT\s*\((.+?)\)\s+(DO\s+NOTHING|DO\s+UPDATE\s+SET\s+.+))?$/is
    );
    if (insertMatch) {
      const [, tableName, colStr, valuesSection, conflictCols, conflictAction] = insertMatch;
      const columns = colStr.trim() ? colStr.split(",").map((c) => c.trim().replace(/"/g, "")) : [];

      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
      }

      // Parse multiple value tuples: (v1, v2), (v3, v4), ...
      const valueTuples: string[] = [];
      let depth = 0;
      let current = "";
      for (const ch of valuesSection) {
        if (ch === "(") {
          if (depth === 0) { current = ""; depth++; continue; }
          depth++;
        } else if (ch === ")") {
          depth--;
          if (depth === 0) { valueTuples.push(current); continue; }
        }
        if (depth > 0) current += ch;
      }

      const uniqueKeys = conflictCols
        ? conflictCols.split(",").map((c) => c.trim().replace(/"/g, ""))
        : null;
      const doNothing = conflictAction && /DO\s+NOTHING/i.test(conflictAction);
      const doUpdate = conflictAction && /DO\s+UPDATE/i.test(conflictAction);

      let lastId = 0;
      let affected = 0;

      for (const valStr of valueTuples) {
        const values = this.parseValues(valStr);
        const newRow: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          newRow[columns[i]] = values[i];
        }

        // Check for conflict
        let conflicting: Record<string, unknown> | null = null;
        if (uniqueKeys) {
          const tableRows = this.tables.get(tableName)!;
          conflicting = tableRows.find((existing) =>
            uniqueKeys.every((k) => existing[k] === newRow[k])
          ) ?? null;
        }

        if (conflicting) {
          if (doNothing) {
            continue; // Skip this row
          } else if (doUpdate) {
            // Update the conflicting row with non-unique columns
            for (const col of columns) {
              if (!uniqueKeys || !uniqueKeys.includes(col)) {
                conflicting[col] = newRow[col];
              }
            }
            affected++;
          }
        } else {
          // For plain inserts (no ON CONFLICT), check for PK uniqueness
          if (!uniqueKeys && newRow.id !== undefined) {
            const tableRows = this.tables.get(tableName)!;
            const pkConflict = tableRows.find((r) => r.id === newRow.id);
            if (pkConflict) {
              throw new Error(`Duplicate key value violates unique constraint: id ${newRow.id} already exists in "${tableName}"`);
            }
          }
          // Insert new row
          const id = newRow.id ?? ((this.autoIncrements.get(tableName) ?? 0) + 1);
          this.autoIncrements.set(tableName, Number(id));
          newRow.id = id;
          this.tables.get(tableName)!.push(newRow);
          lastId = Number(id);
          affected++;
        }
      }

      return valueTuples.length === 1 ? lastId : affected;
    }

    // UPDATE
    const updateMatch = sql.match(
      /UPDATE\s+"(\w+)"\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i
    );
    if (updateMatch) {
      const [, tableName, setStr, where] = updateMatch;
      const rows = this.tables.get(tableName) ?? [];
      let affected = 0;
      const assignments = this.parseAssignments(setStr);

      for (const row of rows) {
        if (!where || this.evaluateWhere(row, where)) {
          for (const [col, val] of assignments) {
            // Handle column-relative arithmetic: "col" + N or "col" - N
            if (typeof val === "string") {
              const arithMatch = val.match(/^"?(\w+)"?\s*([+-])\s*(-?\d+(?:\.\d+)?)$/);
              if (arithMatch && arithMatch[1] === col) {
                const current = Number(row[col]) || 0;
                const op = arithMatch[2];
                const amount = Number(arithMatch[3]);
                row[col] = op === "+" ? current + amount : current - amount;
                continue;
              }
            }
            row[col] = val;
          }
          affected++;
        }
      }
      return affected;
    }

    // CREATE TABLE (DDL)
    const createTableMatch = sql.match(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"(\w+)"/i
    );
    if (createTableMatch) {
      const [, tableName] = createTableMatch;
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
      }
      return 0;
    }

    // DROP TABLE (DDL)
    const dropTableMatch = sql.match(
      /DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+"(\w+)"/i
    );
    if (dropTableMatch) {
      const [, tableName] = dropTableMatch;
      this.tables.delete(tableName);
      this.autoIncrements.delete(tableName);
      return 0;
    }

    // ALTER TABLE ADD COLUMN
    const alterAddMatch = sql.match(
      /ALTER\s+TABLE\s+"(\w+)"\s+ADD\s+COLUMN/i
    );
    if (alterAddMatch) return 0;

    // ALTER TABLE DROP COLUMN
    const alterDropMatch = sql.match(
      /ALTER\s+TABLE\s+"(\w+)"\s+DROP\s+COLUMN/i
    );
    if (alterDropMatch) return 0;

    // ALTER TABLE RENAME COLUMN
    const alterRenameMatch = sql.match(
      /ALTER\s+TABLE\s+"(\w+)"\s+RENAME\s+COLUMN/i
    );
    if (alterRenameMatch) return 0;

    // CREATE INDEX
    const createIndexMatch = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/i);
    if (createIndexMatch) return 0;

    // DROP INDEX
    const dropIndexMatch = sql.match(/DROP\s+INDEX/i);
    if (dropIndexMatch) return 0;

    // DELETE
    const deleteMatch = sql.match(
      /DELETE\s+FROM\s+"(\w+)"(?:\s+WHERE\s+(.+))?$/i
    );
    if (deleteMatch) {
      const [, tableName, where] = deleteMatch;
      const rows = this.tables.get(tableName) ?? [];
      if (!where) {
        const count = rows.length;
        this.tables.set(tableName, []);
        return count;
      }
      const before = rows.length;
      this.tables.set(
        tableName,
        rows.filter((row) => !this.evaluateWhere(row, where))
      );
      return before - (this.tables.get(tableName)?.length ?? 0);
    }

    return 0;
  }

  async beginTransaction(): Promise<void> {}
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  async createSavepoint(_name: string): Promise<void> {}
  async releaseSavepoint(_name: string): Promise<void> {}
  async rollbackToSavepoint(_name: string): Promise<void> {}

  // -- Helpers --

  private evaluateWhere(
    row: Record<string, unknown>,
    where: string
  ): boolean {
    // Strip outer parentheses if present (from Grouping nodes)
    let cleaned = where.trim();
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
      // Check if these parens wrap the entire expression
      let depth = 0;
      let wrapsAll = true;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === "(") depth++;
        else if (cleaned[i] === ")") depth--;
        if (depth === 0 && i < cleaned.length - 1) {
          wrapsAll = false;
          break;
        }
      }
      if (wrapsAll) cleaned = cleaned.slice(1, -1).trim();
    }

    // Handle OR conditions (split at top-level OR, not inside parentheses)
    const orParts = this.splitTopLevel(cleaned, /\s+OR\s+/i);
    if (orParts.length > 1) {
      return orParts.some((part) => this.evaluateWhere(row, part.trim()));
    }

    // Handle AND conditions (but not the AND inside BETWEEN x AND y)
    const andParts = this.splitTopLevelAnd(cleaned);
    return andParts.every((part) => this.evaluateCondition(row, part.trim()));
  }

  private splitTopLevelAnd(expr: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    let inBetween = false;

    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === "(") depth++;
      else if (expr[i] === ")") depth--;

      if (depth === 0) {
        // Check for BETWEEN keyword (start tracking)
        const upperRemaining = expr.slice(i).toUpperCase();
        if (upperRemaining.match(/^BETWEEN\s/)) {
          inBetween = true;
        }

        // Check for AND at this position
        const andMatch = expr.slice(i).match(/^\s+AND\s+/i);
        if (andMatch) {
          if (inBetween) {
            // This AND is part of BETWEEN x AND y — include it
            inBetween = false;
            current += andMatch[0];
            i += andMatch[0].length - 1;
            continue;
          }
          // This is a top-level AND separator
          parts.push(current);
          i += andMatch[0].length - 1;
          current = "";
          continue;
        }
      }
      current += expr[i];
    }
    if (current) parts.push(current);
    return parts;
  }

  private splitTopLevel(expr: string, separator: RegExp): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";

    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === "(") depth++;
      else if (expr[i] === ")") depth--;

      if (depth === 0) {
        // Try matching separator at this position
        const remaining = expr.slice(i);
        const match = remaining.match(separator);
        if (match && match.index === 0) {
          parts.push(current);
          i += match[0].length - 1;
          current = "";
          continue;
        }
      }
      current += expr[i];
    }
    if (current) parts.push(current);
    return parts;
  }

  private evaluateCondition(
    row: Record<string, unknown>,
    condition: string
  ): boolean {
    // Always-false (empty IN generates 1=0)
    if (condition.trim() === "1=0") return false;

    // Always-true (empty NOT IN generates 1=1)
    if (condition.trim() === "1=1") return true;

    // Helper to get column name from a "table"."col" or just "col" pattern
    const getCol = (tableOrCol: string, col?: string): string =>
      col !== undefined ? col : tableOrCol;

    // BETWEEN
    const betweenMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s+BETWEEN\s+(.+?)\s+AND\s+(.+)/i
    );
    if (betweenMatch) {
      const col = getCol(betweenMatch[1], betweenMatch[2]);
      const val = Number(row[col]);
      const low = Number(this.parseSingleValue(betweenMatch[3].trim()));
      const high = Number(this.parseSingleValue(betweenMatch[4].trim()));
      return val >= low && val <= high;
    }

    // IS NULL
    const isNullMatch = condition.match(/"?(\w+)"?(?:\."?(\w+)"?)?\s+IS\s+NULL/i);
    if (isNullMatch) {
      const col = getCol(isNullMatch[1], isNullMatch[2]);
      return row[col] === null || row[col] === undefined;
    }

    // IS NOT NULL
    const isNotNullMatch = condition.match(/"?(\w+)"?(?:\."?(\w+)"?)?\s+IS\s+NOT\s+NULL/i);
    if (isNotNullMatch) {
      const col = getCol(isNotNullMatch[1], isNotNullMatch[2]);
      return row[col] !== null && row[col] !== undefined;
    }

    // NOT IN (...)
    const notInMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s+NOT\s+IN\s+\((.+?)\)/i
    );
    if (notInMatch) {
      const col = getCol(notInMatch[1], notInMatch[2]);
      const values = this.parseValues(notInMatch[3]);
      return !values.some((v) => row[col] == v);
    }

    // IN (...)
    const inMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s+IN\s+\((.+?)\)/i
    );
    if (inMatch) {
      const col = getCol(inMatch[1], inMatch[2]);
      const values = this.parseValues(inMatch[3]);
      return values.some((v) => row[col] == v);
    }

    // column != value (check before = to avoid matching != as =)
    const neqMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s*!=\s*(.+)/
    );
    if (neqMatch) {
      const col = getCol(neqMatch[1], neqMatch[2]);
      const val = this.parseSingleValue(neqMatch[3].trim());
      return row[col] != val;
    }

    // column <> value
    const neqMatch2 = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s*<>\s*(.+)/
    );
    if (neqMatch2) {
      const col = getCol(neqMatch2[1], neqMatch2[2]);
      const val = this.parseSingleValue(neqMatch2[3].trim());
      return row[col] != val;
    }

    // column = value
    const eqMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s*=\s*(.+)/
    );
    if (eqMatch) {
      const col = getCol(eqMatch[1], eqMatch[2]);
      const val = this.parseSingleValue(eqMatch[3].trim());
      return row[col] == val;
    }

    // column >= value (must come before > to avoid false match)
    const gteMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s*>=\s*(.+)/
    );
    if (gteMatch) {
      const col = getCol(gteMatch[1], gteMatch[2]);
      const val = this.parseSingleValue(gteMatch[3].trim());
      return Number(row[col]) >= Number(val);
    }

    // column <= value (must come before < to avoid false match)
    const lteMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s*<=\s*(.+)/
    );
    if (lteMatch) {
      const col = getCol(lteMatch[1], lteMatch[2]);
      const val = this.parseSingleValue(lteMatch[3].trim());
      return Number(row[col]) <= Number(val);
    }

    // column > value
    const gtMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s*>\s*(.+)/
    );
    if (gtMatch) {
      const col = getCol(gtMatch[1], gtMatch[2]);
      const val = this.parseSingleValue(gtMatch[3].trim());
      return Number(row[col]) > Number(val);
    }

    // column < value
    const ltMatch = condition.match(
      /"?(\w+)"?(?:\."?(\w+)"?)?\s*<\s*(.+)/
    );
    if (ltMatch) {
      const col = getCol(ltMatch[1], ltMatch[2]);
      const val = this.parseSingleValue(ltMatch[3].trim());
      return Number(row[col]) < Number(val);
    }

    return true;
  }

  private parseSingleValue(raw: string): unknown {
    if (raw === "NULL") return null;
    if (raw.startsWith("'") && raw.endsWith("'")) {
      return raw.slice(1, -1).replace(/''/g, "'");
    }
    const num = Number(raw);
    if (!isNaN(num)) return num;
    return raw;
  }

  private parseValues(valStr: string): unknown[] {
    const values: unknown[] = [];
    let current = "";
    let inString = false;

    for (let i = 0; i < valStr.length; i++) {
      const ch = valStr[i];
      if (ch === "'" && !inString) {
        inString = true;
        current += ch;
      } else if (ch === "'" && inString) {
        if (valStr[i + 1] === "'") {
          current += "''";
          i++;
        } else {
          inString = false;
          current += ch;
        }
      } else if (ch === "," && !inString) {
        values.push(this.parseSingleValue(current.trim()));
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) {
      values.push(this.parseSingleValue(current.trim()));
    }

    return values;
  }

  private parseAssignments(setStr: string): [string, unknown][] {
    const results: [string, unknown][] = [];
    const parts = setStr.split(",");
    for (const part of parts) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const col = part
        .slice(0, eqIdx)
        .trim()
        .replace(/"/g, "")
        .split(".")
        .pop()!;
      const val = this.parseSingleValue(part.slice(eqIdx + 1).trim());
      results.push([col, val]);
    }
    return results;
  }

  private applyOrder(
    rows: Record<string, unknown>[],
    orderBy: string
  ): Record<string, unknown>[] {
    const parts = orderBy.split(",").map((p) => {
      const trimmed = p.trim();
      const descMatch = trimmed.match(/(.+?)\s+DESC/i);
      const ascMatch = trimmed.match(/(.+?)\s+ASC/i);
      const col = (descMatch?.[1] ?? ascMatch?.[1] ?? trimmed)
        .replace(/"/g, "")
        .split(".")
        .pop()!;
      const dir = descMatch ? "desc" : "asc";
      return { col, dir };
    });

    return rows.sort((a, b) => {
      for (const { col, dir } of parts) {
        const aVal = a[col];
        const bVal = b[col];
        if (aVal === bVal) continue;
        const cmp =
          aVal === null || aVal === undefined
            ? -1
            : bVal === null || bVal === undefined
              ? 1
              : aVal < bVal
                ? -1
                : 1;
        return dir === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }
}
