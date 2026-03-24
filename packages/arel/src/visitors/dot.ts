import { Node } from "../nodes/node.js";

export class DotNode {
  readonly name: string;
  readonly id: string;
  readonly fields: string[];

  constructor(name: string, id: string, fields: string[] = []) {
    this.name = name;
    this.id = id;
    this.fields = fields;
  }
}

export class DotEdge {
  readonly name: string;
  readonly from: DotNode;
  readonly to: DotNode;

  constructor(name: string, from: DotNode, to: DotNode) {
    this.name = name;
    this.from = from;
    this.to = to;
  }
}

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
      const label = (obj as { constructor?: { name?: string } }).constructor?.name ?? "Object";
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

        for (const key of Object.keys(value as unknown as Record<string, unknown>)) {
          visit((value as unknown as Record<string, unknown>)[key], value);
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const v of value) visit(v, parent);
        return;
      }

      // Plain objects: walk values (best-effort).
      for (const key of Object.keys(value as unknown as Record<string, unknown>)) {
        visit((value as unknown as Record<string, unknown>)[key], parent);
      }
    };

    idFor(node);
    visit(node);
    lines.push("}");
    return lines.join("\n");
  }
}
