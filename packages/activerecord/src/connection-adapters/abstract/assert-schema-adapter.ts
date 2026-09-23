import type { Quoting } from "./quoting.js";

export type SchemaQuoter = Pick<
  Quoting,
  "quoteColumnName" | "quoteTableName" | "quoteDefaultExpression"
>;
