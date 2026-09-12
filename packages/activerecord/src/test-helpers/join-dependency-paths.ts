import type { Table, Nodes } from "@blazetrails/arel";
import type { JoinDependency } from "../associations/join-dependency.js";
import type { JoinPart } from "../associations/join-dependency/join-part.js";

function reflectionName(node: JoinPart): string {
  return String((node as { reflection?: { name?: unknown } }).reflection?.name ?? "");
}

export function sqlNameOf(node: JoinPart): string {
  const rel = node.table as Table | Nodes.TableAlias;
  return String((rel as { tableAlias?: unknown }).tableAlias ?? (rel as { name: string }).name);
}

export function nodePaths(jd: JoinDependency): string[] {
  const paths: string[] = [];
  const walk = (node: JoinPart, prefix: string): void => {
    for (const child of node.children) {
      const path = prefix ? `${prefix}.${reflectionName(child)}` : reflectionName(child);
      paths.push(path);
      walk(child, path);
    }
  };
  walk(jd.joinRoot, "");
  return paths;
}

export function nodeAt(jd: JoinDependency, path: string): JoinPart {
  let node: JoinPart = jd.joinRoot;
  for (const segment of path.split(".")) {
    node = node.children.find((c) => reflectionName(c) === segment)!;
  }
  return node;
}
