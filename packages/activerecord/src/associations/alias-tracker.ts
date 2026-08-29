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

/** @noRailsEquivalent PERMANENT */
export class AliasCounts extends Map<string, number> {
  /** @noRailsEquivalent PERMANENT */
  defaultProc: (h: AliasCounts, k: string) => number;

  constructor(defaultProc: (h: AliasCounts, k: string) => number) {
    super();
    this.defaultProc = defaultProc;
  }

  override get(key: string): number {
    return super.has(key) ? super.get(key)! : this.defaultProc(this, key);
  }
}

export class AliasTracker {
  readonly aliases: AliasCounts;
  private _tableAliasLength: number;

  constructor(tableAliasLength?: number, aliases?: AliasCounts) {
    this.aliases = aliases ?? new AliasCounts(() => 0);
    this._tableAliasLength = tableAliasLength ?? DEFAULT_TABLE_ALIAS_LENGTH;
  }

  static create(
    pool: any,
    initialTable: string,
    joins: any[],
    aliases?: AliasCounts,
  ): AliasTracker {
    const connection =
      typeof pool?.tableAliasLength === "function"
        ? pool
        : (pool?.activeConnection ?? pool?.leaseConnectionSync?.());

    if (joins.length === 0) {
      aliases ??= new AliasCounts(() => 0);
    } else if (aliases) {
      const defaultProc = aliases.defaultProc;
      aliases.defaultProc = (h, k) => {
        const count = AliasTracker.initialCountFor(connection, k, joins) + defaultProc(h, k);
        h.set(k, count);
        return count;
      };
    } else {
      aliases = new AliasCounts((h, k) => {
        const count = AliasTracker.initialCountFor(connection, k, joins);
        h.set(k, count);
        return count;
      });
    }
    aliases.set(initialTable, 1);
    return new AliasTracker(
      connection?.tableAliasLength?.() ?? DEFAULT_TABLE_ALIAS_LENGTH,
      aliases,
    );
  }

  /** @missingRailsCall size — PERMANENT */
  static initialCountFor(connection: Quoting | undefined, name: string, tableJoins: any[]): number {
    const quotedName = connection ? connection.quoteTableName(name) : `"${name}"`;
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

  aliasedTableFor(
    arelTable: Table | any,
    tableName: string | null = null,
    block: () => string,
  ): Table | any {
    tableName = (tableName ?? arelTable.name ?? String(arelTable)) as string;

    if (this.aliases.get(tableName) === 0) {
      this.aliases.set(tableName, 1);
      if (arelTable.name !== tableName && typeof arelTable.alias === "function") {
        arelTable = arelTable.alias(tableName);
      }
    } else {
      let aliasedName = this.tableAliasFor(block());

      const count = this.aliases.get(aliasedName) + 1;
      this.aliases.set(aliasedName, count);

      if (count > 1) aliasedName = `${this.truncate(aliasedName)}_${count}`;

      if (typeof arelTable.alias === "function") arelTable = arelTable.alias(aliasedName);
    }

    return arelTable;
  }

  private tableAliasFor(tableName: string): string {
    return tableName.slice(0, this._tableAliasLength).replace(/\./g, "_");
  }

  private truncate(name: string): string {
    return name.slice(0, this._tableAliasLength - 2);
  }
}
