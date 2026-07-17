import { Table } from "./table.js";
import { TableAlias } from "./nodes/table-alias.js";
import { relationName } from "./attributes/attribute.js";

/**
 * A table reference that can appear in a JOIN's FROM/ON position: either a plain
 * `Arel::Table` or an `Arel::Nodes::TableAlias` wrapping one. Rails treats the
 * two uniformly — `aliased_table_for` returns `arel_table.alias(name)` (a
 * `TableAlias`) when aliased and the bare `Table` otherwise — so the join
 * plumbing that consumes these must accept both.
 */
export type TableRef = Table | TableAlias;

/**
 * The SQL name a table answers to in FROM/ON: its alias when aliased, else the
 * real table name. Mirrors Rails' uniform `relation.table_alias || relation.name`
 * read, which works across both `Arel::Table` and `Arel::Nodes::TableAlias`.
 */
export function tableSqlName(rel: TableRef): string {
  if (rel instanceof TableAlias) return relationName(rel.tableAlias);
  return rel.tableAlias ?? rel.name;
}

/** The underlying real table name, ignoring any alias. */
export function tableRealName(rel: TableRef): string {
  if (rel instanceof TableAlias) return rel.tableName;
  return rel.name;
}
