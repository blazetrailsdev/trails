/**
 * Tracks table aliases during join construction to avoid conflicts.
 *
 * Mirrors: ActiveRecord::Associations::AliasTracker
 */
import { Table, Nodes } from "@blazetrails/arel";
import { maxIdentifierLength } from "../connection-adapters/abstract/database-limits.js";
import type { Quoting } from "../connection-adapters/abstract/quoting.js";

const DEFAULT_TABLE_ALIAS_LENGTH = maxIdentifierLength();

/**
 * Build the Arel table a join should use for `klass` under the SQL name
 * `sqlName` (the alias when aliased, else the real table name), keeping the
 * model's type caster attached.
 *
 * Mirrors `table_metadata.rb:43-44` — `arel_table = association_klass.arel_table`
 * then `arel_table.alias(table_name) if arel_table.name != table_name`. (Not
 * `aliased_table_for`: this does none of that method's alias-count bookkeeping,
 * and its real port is `AliasTracker#aliasedTableFor` below.) Deriving from
 * `klass.arel_table` and aliasing produces a `TableAlias`, which delegates its
 * type caster to the underlying real table (table_alias.rb:22-24) — so the
 * caster rides across the alias for free, no hand-carried copy.
 *
 * @internal
 */
export function aliasedArelTableFor(
  klass: { arelTable?: Table; tableName?: string } | null | undefined,
  tableName: string,
  effectiveName?: string,
): Table | Nodes.TableAlias {
  const sqlName = effectiveName ?? tableName;
  // No klass (polymorphic): nothing to source a caster from, so build a bare
  // table on the real name and alias it exactly as Rails' `arel_table.alias`.
  const base = klass?.arelTable ?? new Table(tableName);
  // `base.name` is the real table. Rails aliases it to whatever name the join
  // must answer to (table_metadata.rb:44) and keeps the caster either way.
  if (sqlName === base.name) return base;
  return base.alias(sqlName);
}

/**
 * `aliasedArelTableFor` keyed off a reflection. A polymorphic reflection has no
 * compile-time klass — `reflection.klass` raises (reflection.rb) — so it keeps a
 * caster-less table; the concrete class is only known per row at runtime.
 *
 * @internal
 */
export function aliasedArelTableForReflection(
  reflection: { klass?: unknown; isPolymorphic?: () => boolean } | null | undefined,
  tableName: string,
  effectiveName?: string,
): Table | Nodes.TableAlias {
  const klass = reflection?.isPolymorphic?.() ? null : (reflection?.klass as never);
  return aliasedArelTableFor(klass, tableName, effectiveName);
}

export class AliasTracker {
  readonly aliases: Map<string, number>;
  private _tableAliasLength: number;
  private _joins: any[];
  private _quoter?: Quoting;

  constructor(
    tableAliasLength?: number,
    aliases?: Map<string, number>,
    joins?: any[],
    quoter?: Quoting,
  ) {
    this._tableAliasLength = tableAliasLength ?? DEFAULT_TABLE_ALIAS_LENGTH;
    this.aliases = aliases ?? new Map();
    this._joins = joins ?? [];
    this._quoter = quoter;
  }

  /**
   * @missingRailsCall initial_count_for — PERMANENT: Rails only reaches
   *   `initial_count_for` from the Hash DEFAULT_PROC it installs on `aliases`
   *   (alias_tracker.rb:14-21); a JS Map has no default proc, so the port defers
   *   the call to AliasTracker#_getCount, which is where a missing key is first
   *   read — same language gap as the `Hash.new(0)` args row above.
   */
  static create(
    pool: any,
    initialTable: string,
    joins: any[],
    aliases?: Map<string, number>,
    quoter?: Quoting,
  ): AliasTracker {
    // Rails: `pool.with_connection { |c| new(c.table_alias_length, ...) }`
    // (alias_tracker.rb:24) — always the connection's alias length, so MySQL
    // gets 256. Honor a connection-like arg's `tableAliasLength` (method or
    // number) directly; a bare pool whose connection is only reachable via the
    // async `withConnection` can't be resolved synchronously here, so it falls
    // back to the base default (see the connection-threading follow-up story).
    const tal = pool?.tableAliasLength;
    const tableAliasLength =
      typeof tal === "function"
        ? tal.call(pool)
        : typeof tal === "number"
          ? tal
          : DEFAULT_TABLE_ALIAS_LENGTH;

    const map = aliases ? new Map(aliases) : new Map<string, number>();
    map.set(initialTable, 1);
    return new AliasTracker(tableAliasLength, map, joins, quoter);
  }

  /**
   * @missingRailsCall size — PERMANENT: Ruby Array#size on the scan result:
   *   `join.left.scan(/.../).size` (alias_tracker.rb:39-41) ports to `matches ?
   *   matches.length : 0` off String#match with the /g flag.
   */
  static initialCountFor(quoter: Quoting | undefined, name: string, tableJoins: any[]): number {
    const quotedName = quoter ? quoter.quoteTableName(name) : `"${name}"`;
    const quotedNameEscaped = quotedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      const count = AliasTracker.initialCountFor(this._quoter, key, this._joins);
      this.aliases.set(key, count);
      return count;
    }
    return 0;
  }

  /**
   * Returns `arelTable` under the name this join must answer to: the real (or
   * `references`-supplied) `tableName` on its first visit, else a fresh alias
   * built from the block's candidate and `_N`-suffixed on repeats.
   *
   * Mirrors: `AliasTracker#aliased_table_for`
   * (`associations/alias_tracker.rb:58-75`). Ruby's block is a trailing
   * parameter here; it is required, as Ruby's bare `yield`
   * (`alias_tracker.rb:66`) is, and only invoked on the collision arm.
   */
  aliasedTableFor(
    arelTable: Table | any,
    tableName: string | null = null,
    block: () => string,
  ): Table | any {
    tableName = (tableName ?? arelTable.name ?? String(arelTable)) as string;

    if (this._getCount(tableName) === 0) {
      this.aliases.set(tableName, 1);
      if (arelTable.name !== tableName && typeof arelTable.alias === "function") {
        arelTable = arelTable.alias(tableName);
      }
    } else {
      let aliasedName = this.tableAliasFor(block());

      const count = this._getCount(aliasedName) + 1;
      this.aliases.set(aliasedName, count);

      if (count > 1) aliasedName = `${this.truncate(aliasedName)}_${count}`;

      if (typeof arelTable.alias === "function") arelTable = arelTable.alias(aliasedName);
    }

    return arelTable;
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

  private tableAliasFor(tableName: string): string {
    return tableName.slice(0, this._tableAliasLength).replace(/\./g, "_");
  }

  private truncate(name: string): string {
    return name.slice(0, this._tableAliasLength - 2);
  }
}
