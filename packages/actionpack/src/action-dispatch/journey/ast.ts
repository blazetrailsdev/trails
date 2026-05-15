import { Node, Symbol as SymbolNode, Star } from "./nodes/node.js";

export class Ast {
  readonly tree: Node;
  readonly pathParams: string[] = [];
  readonly names: string[] = [];
  readonly wildcardOptions: Record<string, RegExp> = {};
  readonly terminals: Node[] = [];

  private readonly _symbols: SymbolNode[] = [];
  private readonly _stars: Star[] = [];

  constructor(tree: Node, formatted: boolean | null | undefined) {
    this.tree = tree;
    this._visitTree(formatted);
  }

  /** Rails alias :root :tree */
  get root(): Node {
    return this.tree;
  }

  set requirements(reqs: Record<string, RegExp>) {
    for (const node of [...this._symbols, ...this._stars]) {
      const re = reqs[node.toSym()];
      if (re) node.regexp = re;
    }
  }

  set route(route: unknown) {
    for (const n of this.terminals) n.memo = route;
  }

  isGlob(): boolean {
    return this._stars.length > 0;
  }

  /** @internal */
  private _visitTree(formatted: boolean | null | undefined): void {
    for (const node of this.tree) {
      if (node.isSymbol()) {
        const sym = node as SymbolNode;
        this.pathParams.push(sym.toSym());
        this.names.push(sym.name);
        this._symbols.push(sym);
      } else if (node.isStar()) {
        const star = node as Star;
        this._stars.push(star);
        if (formatted !== false) {
          const key = star.name;
          if (!(key in this.wildcardOptions)) {
            this.wildcardOptions[key] = /.+?/s;
          }
        }
      }
      if (node.isTerminal()) {
        this.terminals.push(node);
      }
    }
  }
}
