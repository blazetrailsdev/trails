/**
 * Tracks table aliases during join construction to avoid conflicts.
 *
 * Mirrors: ActiveRecord::Associations::AliasTracker
 */
import { Table, Nodes } from "@blazetrails/arel";
import { tableAliasLength as getTableAliasLength } from "../connection-adapters/abstract/database-limits.js";
import { quoteTableName } from "../connection-adapters/abstract/quoting.js";

const DEFAULT_TABLE_ALIAS_LENGTH = getTableAliasLength();

export class AliasTracker {
  readonly aliases: Map<string, number>;
  private _tableAliasLength: number;
  private _joins: any[];

  constructor(tableAliasLength?: number, aliases?: Map<string, number>, joins?: any[]) {
    this._tableAliasLength = tableAliasLength ?? DEFAULT_TABLE_ALIAS_LENGTH;
    this.aliases = aliases ?? new Map();
    this._joins = joins ?? [];
  }

  static create(
    pool: any,
    initialTable: string,
    joins: any[],
    aliases?: Map<string, number>,
  ): AliasTracker {
    const tableAliasLength =
      typeof pool?.withConnection === "function"
        ? DEFAULT_TABLE_ALIAS_LENGTH
        : (pool?.tableAliasLength ?? DEFAULT_TABLE_ALIAS_LENGTH);

    const map = aliases ? new Map(aliases) : new Map<string, number>();
    map.set(initialTable, 1);
    return new AliasTracker(tableAliasLength, map, joins);
  }

  static initialCountFor(name: string, tableJoins: any[]): number {
    const quotedNameEscaped = quoteTableName(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `JOIN(?:\\s+\\w+)?\\s+(?:\\S+\\s+)?(?:${quotedNameEscaped}|${nameEscaped})\\s+ON`,
      "gi",
    );

    let count = 0;
    for (const join of tableJoins) {
      if (join instanceof Nodes.StringJoin) {
        const left = join.left;
        const sql =
          typeof left === "string" ? left : ((left as any)?.value ?? left?.toString?.() ?? "");
        const matches = sql.match(pattern);
        count += matches ? matches.length : 0;
      } else if (join instanceof Nodes.Join) {
        if ((join.left as any)?.name === name) count += 1;
      }
    }

    return count;
  }

  private _getCount(key: string): number {
    if (this.aliases.has(key)) return this.aliases.get(key)!;
    if (this._joins.length > 0) {
      const count = AliasTracker.initialCountFor(key, this._joins);
      this.aliases.set(key, count);
      return count;
    }
    return 0;
  }

  /**
   * Return `arelTable` unaliased on first visit, or a freshly
   * aliased Arel table on repeat visits. The alias candidate is
   * provided by `aliasCandidate` (a string — or a thunk, which is
   * only invoked when the base name is already taken; Rails uses a
   * block so the candidate string isn't built when it isn't needed).
   *
   * Mirrors: ActiveRecord::Associations::AliasTracker#aliased_table_for
   * (alias_tracker.rb) — keyed off `arelTable.name`, not the candidate.
   */
  aliasedTableFor(arelTable: Table | any, aliasCandidate?: string | (() => string)): Table | any {
    const tableName = arelTable.name ?? String(arelTable);
    const count = this._getCount(tableName);
    if (count === 0) {
      this.aliases.set(tableName, 1);
      return arelTable;
    }

    const candidate =
      typeof aliasCandidate === "function" ? aliasCandidate() : (aliasCandidate ?? tableName);
    const aliasedName = this._tableAliasFor(candidate);

    const newCount = this._getCount(aliasedName) + 1;
    this.aliases.set(aliasedName, newCount);

    const finalName = newCount > 1 ? `${this._truncate(aliasedName)}_${newCount}` : aliasedName;

    return typeof arelTable.alias === "function" ? arelTable.alias(finalName) : arelTable;
  }

  aliasFor(tableName: string): string {
    const count = this._getCount(tableName);
    if (count === 0) {
      this.aliases.set(tableName, 1);
      return tableName;
    }
    const newCount = count + 1;
    this.aliases.set(tableName, newCount);
    return `${tableName}_${newCount}`;
  }

  private _tableAliasFor(tableName: string): string {
    return tableName.slice(0, this._tableAliasLength).replace(/\./g, "_");
  }

  private _truncate(name: string): string {
    return name.slice(0, this._tableAliasLength - 2);
  }
}
