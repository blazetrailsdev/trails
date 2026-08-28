import { Table, Nodes } from "@blazetrails/arel";
import { maxIdentifierLength } from "../connection-adapters/abstract/database-limits.js";
import type { Quoting } from "../connection-adapters/abstract/quoting.js";

const DEFAULT_TABLE_ALIAS_LENGTH = maxIdentifierLength();

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function aliasedArelTableFor(
  klass: { arelTable?: Table; tableName?: string } | null | undefined,
  tableName: string,
  effectiveName?: string,
): Table | Nodes.TableAlias {
  const sqlName = effectiveName ?? tableName;
  const base = klass?.arelTable ?? new Table(tableName);
  if (sqlName === base.name) return base;
  return base.alias(sqlName);
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
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

  /** @missingRailsCall initial_count_for — PERMANENT */
  static create(
    pool: any,
    initialTable: string,
    joins: any[],
    aliases?: Map<string, number>,
    quoter?: Quoting,
  ): AliasTracker {
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

  /** @missingRailsCall size — PERMANENT */
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
