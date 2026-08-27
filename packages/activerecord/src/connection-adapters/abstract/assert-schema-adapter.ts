/** @noRailsEquivalent PERMANENT */
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { Quoting } from "./quoting.js";

export type SchemaQuoter = Pick<
  Quoting,
  "quoteColumnName" | "quoteTableName" | "quoteDefaultExpression"
>;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function assertSchemaAdapter(
  adapter: DatabaseAdapter,
): asserts adapter is DatabaseAdapter & SchemaQuoter {
  const a = adapter as Partial<SchemaQuoter>;
  if (
    typeof a.quoteColumnName !== "function" ||
    typeof a.quoteTableName !== "function" ||
    typeof a.quoteDefaultExpression !== "function"
  ) {
    throw new Error(
      `Adapter ${(adapter as { adapterName?: string }).adapterName ?? "<unknown>"} does not implement the Quoting surface required by SchemaStatements (quoteColumnName / quoteTableName / quoteDefaultExpression)`,
    );
  }
}
