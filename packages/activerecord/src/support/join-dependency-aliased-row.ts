import { ArgumentError } from "@blazetrails/activemodel";
import type { JoinDependency } from "../associations/join-dependency.js";
import type { JoinPart } from "../associations/join-dependency/join-part.js";

interface AliasReadableJoinDependency {
  aliases(): { columnAlias(node: JoinPart | null, column: string): string | undefined };
  joinRoot: JoinPart;
}

function findNodeByPath(root: JoinPart, path: string | null): JoinPart | null {
  if (!path) return root;
  let node: JoinPart = root;
  for (const segment of path.split(".")) {
    const child: JoinPart | undefined = node.children.find((c) => c.immediateAssocName === segment);
    if (!child) return null;
    node = child;
  }
  return node;
}

export function aliasedRow(
  jd: JoinDependency,
  spec: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inner = jd as unknown as AliasReadableJoinDependency;
  const aliases = inner.aliases();
  const row: Record<string, unknown> = {};
  for (const [path, columns] of Object.entries(spec)) {
    const node = findNodeByPath(inner.joinRoot, path || null);
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
