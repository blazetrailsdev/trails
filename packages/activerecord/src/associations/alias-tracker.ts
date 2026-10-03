import { ArgumentError, sum } from "@blazetrails/activesupport";
import { Hash, regexpEscape } from "@blazetrails/ruby-compat";
import { Table, Nodes } from "@blazetrails/arel";
import { maxIdentifierLength } from "../connection-adapters/abstract/database-limits.js";
import type { Quoting } from "../connection-adapters/abstract/quoting.js";
import { Associations } from "../namespaces.js";

const DEFAULT_TABLE_ALIAS_LENGTH = maxIdentifierLength();

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy-remainder-4
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
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy-remainder-4
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
  readonly aliases: Hash<string, number>;
  private _tableAliasLength: number;

  constructor(tableAliasLength?: number, aliases?: Hash<string, number>) {
    this.aliases = aliases ?? new Hash<string, number>(0);
    this._tableAliasLength = tableAliasLength ?? DEFAULT_TABLE_ALIAS_LENGTH;
  }

  static create(
    pool: any,
    initialTable: string,
    joins: any[],
    aliases?: Hash<string, number>,
  ): AliasTracker {
    return pool.withConnectionSync((connection: any): AliasTracker => {
      if (joins.length === 0) {
        aliases ??= new Hash<string, number>(0);
      } else if (aliases) {
        const defaultProc = aliases.defaultProc() ?? (() => 0);
        aliases.setDefaultProc((h, k) => {
          const count = AliasTracker.initialCountFor(connection, k, joins) + defaultProc(h, k);
          h.set(k, count);
          return count;
        });
      } else {
        aliases = new Hash<string, number>((h, k) => {
          const count = AliasTracker.initialCountFor(connection, k, joins);
          h.set(k, count);
          return count;
        });
      }
      aliases.set(initialTable, 1);
      return new AliasTracker(connection.tableAliasLength(), aliases);
    });
  }

  static initialCountFor(connection: Quoting, name: string, tableJoins: any[]): number {
    let quotedNameEscaped: string | null = null;
    let nameEscaped: string | null = null;

    const counts = tableJoins.map((join): number => {
      if (join instanceof Nodes.StringJoin) {
        quotedNameEscaped ??= regexpEscape(connection.quoteTableName(name));
        nameEscaped ??= regexpEscape(name);

        return Array.from(
          join.left
            .toString()
            .matchAll(
              new RegExp(
                `JOIN(?:\\s+\\w+)?\\s+(?:\\S+\\s+)?(?:${quotedNameEscaped}|${nameEscaped})\\sON`,
                "gi",
              ),
            ),
        ).length;
      } else if (join instanceof Nodes.Join) {
        return (join.left as any).name === name ? 1 : 0;
      } else {
        throw new ArgumentError("joins list should be initialized by list of Arel::Nodes::Join");
      }
    });

    return sum(counts);
  }

  aliasedTableFor(
    arelTable: Table | any,
    tableName: string | null = null,
    block: () => string,
  ): Table | any {
    tableName ??= arelTable.name as string;

    if (this.aliases.get(tableName) === 0) {
      this.aliases.set(tableName, 1);
      if (arelTable.name !== tableName) arelTable = arelTable.alias(tableName);
    } else {
      let aliasedName = this.tableAliasFor(block());

      const count = this.aliases.get(aliasedName)! + 1;
      this.aliases.set(aliasedName, count);

      if (count > 1) aliasedName = `${this.truncate(aliasedName)}_${count}`;

      arelTable = arelTable.alias(aliasedName);
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

Associations.AliasTracker = AliasTracker;
