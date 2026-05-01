import type { DatabaseAdapter } from "../../adapter.js";
import type { Quoting } from "./quoting-interface.js";

/**
 * Assert that `adapter` implements the {@link Quoting} surface
 * `SchemaStatements` depends on, and narrow its type. Used at the
 * boundary where callers hold a `DatabaseAdapter` reference but the
 * concrete adapter is known to mix in `Quoting` at runtime. Throws a
 * descriptive error rather than failing inside a quoting call later.
 * @internal
 */
export function assertSchemaAdapter(
  adapter: DatabaseAdapter,
): asserts adapter is DatabaseAdapter & Quoting {
  const a = adapter as Partial<Quoting>;
  if (
    typeof a.quoteIdentifier !== "function" ||
    typeof a.quoteTableName !== "function" ||
    typeof a.quoteDefaultExpression !== "function"
  ) {
    throw new Error(
      `Adapter ${(adapter as { adapterName?: string }).adapterName ?? "<unknown>"} does not implement the Quoting surface required by SchemaStatements (quoteIdentifier / quoteTableName / quoteDefaultExpression)`,
    );
  }
}
