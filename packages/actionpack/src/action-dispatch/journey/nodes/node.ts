export type NodeType = "LITERAL" | "SLASH" | "DOT" | "SYMBOL" | "GROUP" | "STAR" | "CAT" | "OR";

export abstract class Node {
  left: Node | string;
  memo: unknown = null;

  constructor(left: Node | string) {
    this.left = left;
  }

  *[globalThis.Symbol.iterator](): IterableIterator<Node> {
    yield this;
    const children = this.children();
    for (const child of children) {
      yield* child;
    }
  }

  /** Visit every descendant whose constructor is `klass`. Rails `node.grep(Klass)`. */
  grep<T extends Node>(klass: new (...args: never[]) => T): T[] {
    const out: T[] = [];
    for (const n of this) if (n instanceof klass) out.push(n as T);
    return out;
  }

  children(): readonly Node[] {
    return [];
  }

  abstract get type(): NodeType;

  /** Rails `node.name` — strips `*` and `:` from the leading marker. */
  get name(): string {
    return this._computeName();
  }

  /** @internal */
  protected _computeName(): string {
    if (typeof this.left !== "string") {
      throw new Error("name requires a string `left`");
    }
    return this.left.replace(/[*:]/g, "");
  }

  toSym(): string {
    return this.name;
  }

  toString(): string {
    if (typeof this.left === "string") return this.left;
    return this.left.toString();
  }

  isSymbol(): boolean {
    return false;
  }
  isLiteral(): boolean {
    return false;
  }
  isTerminal(): boolean {
    return false;
  }
  isStar(): boolean {
    return false;
  }
  isCat(): boolean {
    return false;
  }
  isGroup(): boolean {
    return false;
  }
}

export class Terminal extends Node {
  /** Rails alias :symbol :left — kept as a getter for callers. */
  get symbol(): Node | string {
    return this.left;
  }

  get type(): NodeType {
    throw new Error("subclass must override type");
  }

  override isTerminal(): boolean {
    return true;
  }
}

export class Literal extends Terminal {
  override isLiteral(): boolean {
    return true;
  }
  override get type(): NodeType {
    return "LITERAL";
  }
}

export class Dummy extends Literal {
  constructor(x: string = "<dummy>") {
    super(x);
  }
  override isLiteral(): boolean {
    return false;
  }
}

export class Slash extends Terminal {
  override get type(): NodeType {
    return "SLASH";
  }
}

export class Dot extends Terminal {
  override get type(): NodeType {
    return "DOT";
  }
}

export class Symbol extends Terminal {
  static readonly DEFAULT_EXP = /[^./?]+/;
  static readonly GREEDY_EXP = /(.+)/;

  regexp: RegExp;
  private readonly _name: string;

  constructor(left: string, regexp: RegExp = Symbol.DEFAULT_EXP) {
    super(left);
    this.regexp = regexp;
    this._name = left.replace(/[*:]/g, "");
  }

  override get name(): string {
    return this._name;
  }

  override get type(): NodeType {
    return "SYMBOL";
  }
  override isSymbol(): boolean {
    return true;
  }
}

export abstract class Unary extends Node {
  override children(): readonly Node[] {
    return [this.left as Node];
  }
}

export class Group extends Unary {
  override get type(): NodeType {
    return "GROUP";
  }
  override isGroup(): boolean {
    return true;
  }
  override toString(): string {
    return `(${(this.left as Node).toString()})`;
  }
}

export class Star extends Unary {
  regexp: RegExp = /.+?/s;
  override left: Node;

  constructor(left: Node) {
    super(left);
    this.left = left;
  }

  override get type(): NodeType {
    return "STAR";
  }
  override isStar(): boolean {
    return true;
  }
  override get name(): string {
    return this.left.name.replace(/[*:]/g, "");
  }
  override toString(): string {
    return this.left.toString();
  }
}

export abstract class Binary extends Node {
  right: Node;

  constructor(left: Node, right: Node) {
    super(left);
    this.right = right;
  }

  override children(): readonly Node[] {
    return [this.left as Node, this.right];
  }
}

export class Cat extends Binary {
  override get type(): NodeType {
    return "CAT";
  }
  override isCat(): boolean {
    return true;
  }
  override toString(): string {
    return `${(this.left as Node).toString()}${this.right.toString()}`;
  }
}

export class Or extends Node {
  override readonly children: () => readonly Node[];
  private readonly _children: readonly Node[];

  constructor(children: readonly Node[]) {
    super(children[0]!);
    this._children = children;
    this.children = () => this._children;
  }

  override get type(): NodeType {
    return "OR";
  }
  override toString(): string {
    return this._children.map((c) => c.toString()).join("|");
  }
}
