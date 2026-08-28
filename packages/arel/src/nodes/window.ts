import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { Unary } from "./unary.js";
import { SqlLiteral } from "./sql-literal.js";

export class Window extends Node {
  orders: Node[];
  partitions: Node[];
  framing: Node | null;

  constructor() {
    super();
    this.orders = [];
    this.partitions = [];
    this.framing = null;
  }

  order(...expr: (Node | string)[]): this {
    this.orders.push(...expr.map((x) => (typeof x === "string" ? new SqlLiteral(x) : x)));
    return this;
  }

  partition(...expr: (Node | string)[]): this {
    this.partitions.push(...expr.map((x) => (typeof x === "string" ? new SqlLiteral(x) : x)));
    return this;
  }

  frame(expr: Node): Node {
    this.framing = expr;
    return expr;
  }

  rows(expr: Node | null = null): Node {
    if (this.framing) {
      return new Rows(expr);
    } else {
      return this.frame(new Rows(expr));
    }
  }

  range(expr: Node | null = null): Node {
    if (this.framing) {
      return new Range(expr);
    } else {
      return this.frame(new Range(expr));
    }
  }

  hash(): number {
    return rbHash([this.orders, this.framing]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Window &&
      this.constructor === other.constructor &&
      rbEqual(this.orders, other.orders) &&
      rbEqual(this.framing, other.framing) &&
      rbEqual(this.partitions, other.partitions)
    );
  }
}

export class NamedWindow extends Window {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  override hash(): number {
    return (super.hash() ^ rbHash(this.name)) >>> 0;
  }

  override eql(other: unknown): boolean {
    return super.eql(other) && rbEqual(this.name, (other as NamedWindow).name);
  }
}

export class Rows extends Unary {
  declare expr: Node | null;
  constructor(expr: Node | null = null) {
    super(expr);
  }
}

export class Range extends Unary {
  declare expr: Node | null;
  constructor(expr: Node | null = null) {
    super(expr);
  }
}

export class CurrentRow extends Node {
  hash(): number {
    return rbHash(this.constructor);
  }

  eql(other: unknown): boolean {
    return other instanceof CurrentRow && this.constructor === other.constructor;
  }
}

export class Preceding extends Unary {
  constructor(expr: unknown = null) {
    super(expr);
  }
}

export class Following extends Unary {
  constructor(expr: unknown = null) {
    super(expr);
  }
}
