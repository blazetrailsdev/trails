import {
  Cat,
  Dummy,
  Group,
  Literal,
  Node,
  Or,
  Star,
  Symbol as SymbolNode,
  Terminal,
  Unary,
} from "../nodes/node.js";
import { TransitionTable, type Edge } from "./transition-table.js";

const DUMMY_END_NODE = new Dummy("<end>");

export class Builder {
  readonly root: Node;
  readonly ast: Cat;
  readonly endpoints: unknown[] = [];

  /** @internal */
  private readonly followpos: Map<Node, Node[]>;

  constructor(root: Node) {
    this.root = root;
    this.ast = new Cat(root, DUMMY_END_NODE);
    this.followpos = this.buildFollowpos();
  }

  transitionTable(): TransitionTable {
    const dtrans = new TransitionTable();
    const marked = new Set<readonly Node[]>();
    const stateId = new Map<unknown, number>();
    const idFor = (key: unknown): number => {
      let id = stateId.get(key);
      if (id === undefined) {
        id = stateId.size;
        stateId.set(key, id);
      }
      return id;
    };
    const dstates: Array<readonly Node[]> = [this.firstpos(this.root)];

    while (dstates.length > 0) {
      const s = dstates.shift()!;
      if (marked.has(s)) continue;
      marked.add(s);

      const groups = new Map<Edge, Node[]>();
      const seen = new Map<string, Edge>();
      for (const state of s) {
        const sym = this.symbol(state);
        const key = typeof sym === "string" ? `s:${sym}` : `r:${sym.source}\0${sym.flags}`;
        let canonical = seen.get(key);
        if (!canonical) {
          canonical = sym;
          seen.set(key, canonical);
          groups.set(canonical, []);
        }
        groups.get(canonical)!.push(state);
      }

      for (const [sym, ps] of groups) {
        const u: Node[] = [];
        const uSeen = new Set<Node>();
        for (const l of ps) {
          for (const fp of this.followpos.get(l) ?? []) {
            if (!uSeen.has(fp)) {
              uSeen.add(fp);
              u.push(fp);
            }
          }
        }
        if (u.length === 0) continue;

        const from = idFor(s);

        if (u.every((pos) => pos === DUMMY_END_NODE)) {
          const to = idFor({});
          dtrans.set(from, to, sym);
          dtrans.addAccepting(to);
          for (const state of ps) dtrans.addMemo(to, state.memo);
        } else {
          const to = idFor(u);
          dtrans.set(from, to, sym);
          if (u.includes(DUMMY_END_NODE)) {
            for (const state of ps) {
              if ((this.followpos.get(state) ?? []).includes(DUMMY_END_NODE)) {
                dtrans.addMemo(to, state.memo);
              }
            }
            dtrans.addAccepting(to);
          }
        }

        dstates.push(u);
      }
    }

    return dtrans;
  }

  isNullable(node: Node): boolean {
    if (node instanceof Group) return true;
    if (node instanceof Star) return node.regexp.test("");
    if (node instanceof Or) return node.children().some((c) => this.isNullable(c));
    if (node instanceof Cat)
      return this.isNullable(node.left as Node) && this.isNullable(node.right);
    if (node instanceof Terminal) return !node.left;
    if (node instanceof Unary) return this.isNullable(node.left as Node);
    throw new Error(`unknown nullable: ${node.type}`);
  }

  firstpos(node: Node): readonly Node[] {
    if (node instanceof Star) return this.firstpos(node.left);
    if (node instanceof Cat) {
      const l = this.firstpos(node.left as Node);
      if (this.isNullable(node.left as Node)) {
        return uniqConcat(l, this.firstpos(node.right));
      }
      return l;
    }
    if (node instanceof Or) {
      const out: Node[] = [];
      const seen = new Set<Node>();
      for (const c of node.children()) {
        for (const n of this.firstpos(c)) {
          if (!seen.has(n)) {
            seen.add(n);
            out.push(n);
          }
        }
      }
      return out;
    }
    if (node instanceof Unary) return this.firstpos(node.left as Node);
    if (node instanceof Terminal) return this.isNullable(node) ? [] : [node];
    throw new Error(`unknown firstpos: ${node.type}`);
  }

  lastpos(node: Node): readonly Node[] {
    if (node instanceof Star) return this.lastpos(node.left);
    if (node instanceof Or) {
      const out: Node[] = [];
      const seen = new Set<Node>();
      for (const c of node.children()) {
        for (const n of this.lastpos(c)) {
          if (!seen.has(n)) {
            seen.add(n);
            out.push(n);
          }
        }
      }
      return out;
    }
    if (node instanceof Cat) {
      const r = this.lastpos(node.right);
      if (this.isNullable(node.right)) {
        return uniqConcat(this.lastpos(node.left as Node), r);
      }
      return r;
    }
    if (node instanceof Terminal) return this.isNullable(node) ? [] : [node];
    if (node instanceof Unary) return this.lastpos(node.left as Node);
    throw new Error(`unknown lastpos: ${node.type}`);
  }

  /** @internal */
  private buildFollowpos(): Map<Node, Node[]> {
    const table = new Map<Node, Node[]>();
    for (const n of this.ast) {
      if (n instanceof Cat) {
        const right = this.firstpos(n.right);
        for (const i of this.lastpos(n.left as Node)) {
          const list = table.get(i) ?? [];
          for (const r of right) list.push(r);
          table.set(i, list);
        }
      }
    }
    return table;
  }

  /** @internal */
  private symbol(edge: Node): Edge {
    if (edge.isSymbol()) return (edge as SymbolNode).regexp;
    return (edge as Literal).left as string;
  }
}

function uniqConcat<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const arr of [a, b]) {
    for (const x of arr) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
  }
  return out;
}
