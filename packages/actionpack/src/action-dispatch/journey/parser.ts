import { Scanner, type Token } from "./scanner.js";
import {
  Cat,
  Group,
  Literal,
  Node,
  Or,
  Slash,
  Star,
  Symbol as SymbolNode,
  Dot,
} from "./nodes/node.js";

export class Parser {
  private _scanner: Scanner;
  private _nextToken: Token | null;

  constructor() {
    this._scanner = new Scanner();
    this._nextToken = null;
  }

  static parse(string: string): Node {
    return new Parser().parse(string);
  }

  parse(string: string): Node {
    this._scanner.scanSetup(string);
    this.advanceToken();
    return this.doParse();
  }

  /** @internal */
  private advanceToken(): void {
    this._nextToken = this._scanner.nextToken();
  }

  /** @internal */
  private doParse(): Node {
    return this.parseExpressions();
  }

  /** @internal */
  private parseExpressions(): Node {
    let node = this.parseExpression();
    while (this._nextToken !== null) {
      if (this._nextToken === "RPAREN") break;
      if (this._nextToken === "OR") {
        node = this.parseOr(node);
      } else {
        node = new Cat(node, this.parseExpressions());
      }
    }
    return node;
  }

  /** @internal */
  private parseOr(lhs: Node): Node {
    this.advanceToken();
    const rhs = this.parseExpression();
    return new Or([lhs, rhs]);
  }

  /** @internal */
  private parseExpression(): Node {
    if (this._nextToken === "STAR") return this.parseStar();
    if (this._nextToken === "LPAREN") return this.parseGroup();
    return this.parseTerminal();
  }

  /** @internal */
  private parseStar(): Node {
    const sym = new SymbolNode(this._scanner.lastString(), SymbolNode.GREEDY_EXP);
    const node = new Star(sym);
    this.advanceToken();
    return node;
  }

  /** @internal */
  private parseGroup(): Node {
    this.advanceToken();
    const inner = this.parseExpressions();
    if (this._nextToken !== "RPAREN") {
      throw new Error("missing right parenthesis.");
    }
    const node = new Group(inner);
    this.advanceToken();
    return node;
  }

  /** @internal */
  private parseTerminal(): Node {
    let node: Node;
    switch (this._nextToken) {
      case "SYMBOL":
        node = new SymbolNode(this._scanner.lastString());
        break;
      case "LITERAL":
        node = new Literal(this._scanner.lastLiteral());
        break;
      case "SLASH":
        node = new Slash("/");
        break;
      case "DOT":
        node = new Dot(".");
        break;
      default:
        throw new Error(`unexpected token: ${this._nextToken}`);
    }
    this.advanceToken();
    return node;
  }
}
