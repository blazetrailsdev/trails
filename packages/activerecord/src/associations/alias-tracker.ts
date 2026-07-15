/**
 * Tracks table aliases during join construction to avoid conflicts.
 *
 * Mirrors: ActiveRecord::Associations::AliasTracker
 */
import { Table, Nodes } from "@blazetrails/arel";
import { maxIdentifierLength } from "../connection-adapters/abstract/database-limits.js";
import type { Quoting } from "../connection-adapters/abstract/quoting-interface.js";

// DatabaseLimits' table_alias_length defaults to max_identifier_length; use the
// abstract default directly (the free tableAliasLength now dispatches via `this`).
const DEFAULT_TABLE_ALIAS_LENGTH = maxIdentifierLength();

/**
 * Build the Arel table a join should use for `klass` under the SQL name
 * `effectiveName`, keeping the model's type caster attached.
 *
 * Rails never constructs a bare `Arel::Table` for a join: `aliased_table_for`
 * is handed `klass.arel_table` and calls `#alias` on it, so the resulting
 * `TableAlias` delegates `type_for_attribute` back to the underlying table's
 * caster (alias_tracker.rb:58-70, table.rb:106-108). trails encodes an aliased
 * table as `Table(realName, { as: alias })` rather than a `TableAlias`, so the
 * caster has to be carried across explicitly — otherwise `type_for_attribute`
 * hits a nil caster the moment a join's ON clause contains a typed predicate
 * (e.g. an STI type condition).
 *
 * @internal
 */
export function aliasedArelTableFor(
  klass: { arelTable?: Table; tableName?: string } | null | undefined,
  tableName: string,
  effectiveName?: string,
): Table {
  const as = effectiveName && effectiveName !== tableName ? effectiveName : undefined;
  const base = klass?.arelTable;
  if (!base || base.name !== tableName) return new Table(tableName, { as });
  if (as === undefined) return base;
  return new Table(tableName, { as, typeCaster: base.typeCaster, klass: base.klass });
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
    const aliasedName = this.tableAliasFor(candidate);

    const newCount = this._getCount(aliasedName) + 1;
    this.aliases.set(aliasedName, newCount);

    const finalName = newCount > 1 ? `${this.truncate(aliasedName)}_${newCount}` : aliasedName;

    return typeof arelTable.alias === "function" ? arelTable.alias(finalName) : arelTable;
  }

  /**
   * Compute a non-colliding SQL alias for `candidate`, bumping its count so
   * repeat candidates get a numeric suffix. Mirrors the aliased-name branch
   * of `aliased_table_for` (alias_tracker.rb) without needing an Arel table —
   * used by JoinDependency to name self-joined HABTM-through tables with the
   * Rails `{plural_name}_{owner_table}_join` scheme.
   *
   * @internal
   */
  aliasNameFor(candidate: string): string {
    const aliasedName = this.tableAliasFor(candidate);
    const count = this._getCount(aliasedName) + 1;
    this.aliases.set(aliasedName, count);
    return count > 1 ? `${this.truncate(aliasedName)}_${count}` : aliasedName;
  }

  /**
   * Claim a join target `tableName` and return the SQL alias to use: `undefined`
   * on its first use (the real name is kept), else the `candidate` aliased and
   * `_N`-suffixed on repeats. Unlike `aliasNameFor`, the collision decision runs
   * through `_getCount`, so a table already present in the seeded `joins`
   * (`initialCountFor`) or `aliases` map counts as taken. Mirrors the real-table
   * branch of `aliased_table_for` (alias_tracker.rb:58-77) without needing an
   * Arel table.
   *
   * @internal
   */
  aliasNameForTable(tableName: string, candidate: string | (() => string)): string | undefined {
    if (this._getCount(tableName) === 0) {
      this.aliases.set(tableName, 1);
      return undefined;
    }
    return this.aliasNameFor(typeof candidate === "function" ? candidate() : candidate);
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
