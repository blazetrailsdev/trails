import { Node } from "../nodes/node.js";

/**
 * Dot visitor — renders the AST as a Graphviz dot graph.
 *
 * Mirrors: Arel::Visitors::Dot (loosely)
 */
export class Dot {
  compile(node: Node): string {
    const seen = new Map<object, string>();
    const lines: string[] = ["digraph arel {", '  node [shape="box"];'];
    let nextId = 0;

    const idFor = (obj: object): string => {
      const existing = seen.get(obj);
      if (existing) return existing;
      const id = `n${nextId++}`;
      seen.set(obj, id);
      const label = (obj as any).constructor?.name ?? "Object";
      lines.push(`  ${id} [label=${JSON.stringify(label)}];`);
      return id;
    };

    const visit = (value: unknown, parent?: object): void => {
      if (!value || typeof value !== "object") return;

      if (value instanceof Node) {
        const childId = idFor(value);
        if (parent) {
          const parentId = idFor(parent);
          lines.push(`  ${parentId} -> ${childId};`);
        }

        for (const key of Object.keys(value as any)) {
          visit((value as any)[key], value);
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const v of value) visit(v, parent);
        return;
      }

      // Plain objects: walk values (best-effort).
      for (const key of Object.keys(value as any)) {
        visit((value as any)[key], parent);
      }
    };

    idFor(node);
    visit(node);
    lines.push("}");
    return lines.join("\n");
  }
}
