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
    this._advanceToken();
    return this._doParse();
  }

  /** @internal */
  private _advanceToken(): void {
    this._nextToken = this._scanner.nextToken();
  }

  /** @internal */
  private _doParse(): Node {
    return this._parseExpressions();
  }

  /** @internal */
  private _parseExpressions(): Node {
    let node = this._parseExpression();
    while (this._nextToken !== null) {
      if (this._nextToken === "RPAREN") break;
      if (this._nextToken === "OR") {
        node = this._parseOr(node);
      } else {
        node = new Cat(node, this._parseExpressions());
      }
    }
    return node;
  }

  /** @internal */
  private _parseOr(lhs: Node): Node {
    this._advanceToken();
    const rhs = this._parseExpression();
    return new Or([lhs, rhs]);
  }

  /** @internal */
  private _parseExpression(): Node {
    if (this._nextToken === "STAR") return this._parseStar();
    if (this._nextToken === "LPAREN") return this._parseGroup();
    return this._parseTerminal();
  }

  /** @internal */
  private _parseStar(): Node {
    const sym = new SymbolNode(this._scanner.lastString(), SymbolNode.GREEDY_EXP);
    const node = new Star(sym);
    this._advanceToken();
    return node;
  }

  /** @internal */
  private _parseGroup(): Node {
    this._advanceToken();
    const inner = this._parseExpressions();
    if (this._nextToken !== "RPAREN") {
      throw new Error("missing right parenthesis.");
    }
    const node = new Group(inner);
    this._advanceToken();
    return node;
  }

  /** @internal */
  private _parseTerminal(): Node {
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
    this._advanceToken();
    return node;
  }
}
