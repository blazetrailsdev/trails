import { ArgumentError } from "@blazetrails/activemodel";
import type { JoinDependency } from "../associations/join-dependency.js";
import type { JoinPart } from "../associations/join-dependency/join-part.js";

/**
 * The two `JoinDependency` privates this helper reads. Both are TS-`private`
 * (compile-time only), and neither is loosened on the class for this: the
 * helper is test support and lives outside the compared surface, so widening
 * the production class to reach them would be the deviation, not this.
 */
interface AliasReadableJoinDependency {
  aliases(): { columnAlias(node: JoinPart | null, column: string): string | undefined };
  _findNodeByPath(path: string | null): JoinPart | null;
}

/**
 * Build a hydration row from a `{path: {column: value}}` spec, mapping each
 * column to its `t{n}_r{n}` alias via the live `Aliases` map so tests never
 * hardcode a column offset (which silently misaligns when the canonical
 * `schema.rb` column order changes). `path` is the dotted association path
 * ("" / omitted = join root); columns not in the alias map (extra SELECT
 * columns) can be spread onto the returned row by the caller.
 */
export function aliasedRow(
  jd: JoinDependency,
  spec: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inner = jd as unknown as AliasReadableJoinDependency;
  const aliases = inner.aliases();
  const row: Record<string, unknown> = {};
  for (const [path, columns] of Object.entries(spec)) {
    const node = inner._findNodeByPath(path || null);
    if (!node) {
      throw new ArgumentError(`aliasedRow: no join node at path "${path}"`);
    }
    for (const [column, value] of Object.entries(columns)) {
      const alias = aliases.columnAlias(node, column);
      if (!alias) {
        throw new ArgumentError(`aliasedRow: no alias for "${path}".${column}`);
      }
      row[alias] = value;
    }
  }
  return row;
}
