import { TokenScanner } from "./token-scanner.js";
import { Tokenizer, type Node, type TokenizerOptions } from "./tokenizer.js";

export interface StringifyOptions {
  excludeComments?: boolean;
}

export class Parser {
  static BLOCK_END_TOKENS: Record<string, string> = {
    "{": "}",
    "[": "]",
    "(": ")",
  };

  static parseProperties(input: string | Iterable<Node>, options: TokenizerOptions = {}): Node[] {
    return new Parser(input, options).parseProperties();
  }

  static stringify(nodes: Node | null | (Node | null)[], options: StringifyOptions = {}): string {
    if (!Array.isArray(nodes)) nodes = [nodes];
    let string = "";

    for (const node of nodes) {
      if (node == null) continue;

      switch (node.node) {
        case "at_rule":
          string += "@";
          string += node.name;
          string += this.stringify(node.prelude, options);

          if (node.block != null) {
            string += "{" + this.stringify(node.block, options) + "}";
          } else {
            string += ";";
          }
          break;

        case "comment":
          if (!options.excludeComments) string += node.raw;
          break;

        case "simple_block":
          string += node.start;
          string += this.stringify(node.value, options);
          string += node.end;
          break;

        case "style_rule":
          string += this.stringify(node.selector.tokens, options);
          string += "{" + this.stringify(node.children, options) + "}";
          break;

        default:
          if ("raw" in node) {
            string += node.raw;
          } else if ("tokens" in node) {
            string += this.stringify(node.tokens, options);
          }
      }
    }

    return string;
  }

  tokens: TokenScanner;

  constructor(input: string | Iterable<Node>, options: TokenizerOptions = {}) {
    if (typeof input === "string") {
      input = Tokenizer.tokenize(input, options);
    }

    this.tokens = new TokenScanner(input);
  }

  consumeAtRule(input: TokenScanner = this.tokens): Node {
    const rule: Record<string, Node[string]> = {};

    rule.tokens = input.collect(() => {
      rule.name = input.consume()!.value;
      rule.prelude = [];

      let token: Node | null;
      while ((token = input.consume())) {
        const node = token.node;

        if (node === "comment") {
          continue;
        } else if (node === "semicolon") {
          break;
        } else if (node === "{") {
          rule.block = this.consumeSimpleBlock(input).value;
          break;
        } else if (node === "simple_block" && token.start === "{") {
          rule.block = token.value;
          break;
        } else {
          input.reconsume();
          rule.prelude.push(this.consumeComponentValue(input));
        }
      }
    });

    return this.createNode("at_rule", rule);
  }

  consumeComponentValue(input: TokenScanner = this.tokens): Node | null {
    const token = input.consume();
    if (token == null) return null;

    switch (token.node) {
      case "{":
      case "[":
      case "(":
        return this.consumeSimpleBlock(input);

      case "function":
        if ("name" in token) {
          return token;
        } else {
          return this.consumeFunction(input);
        }

      default:
        return token;
    }
  }

  consumeDeclaration(input: TokenScanner = this.tokens): Node {
    const declaration: Record<string, Node[string]> = {};
    const value: Node[] = [];
    let error: Node | null = null;

    declaration.tokens = input.collect(() => {
      declaration.name = input.consume()!.value;

      let nextToken = input.peek();

      while (nextToken != null && nextToken.node === "whitespace") {
        input.consume();
        nextToken = input.peek();
      }

      if (!(nextToken != null && nextToken.node === "colon")) {
        error = this.createNode("error", { value: "invalid" });
        return;
      }

      input.consume();

      while (input.peek() != null) {
        value.push(this.consumeComponentValue(input)!);
      }
    });
    if (error !== null) return error;

    const importantTokens = value
      .filter((token) => {
        const node = token.node;
        return !(node === "whitespace" || node === "comment" || node === "semicolon");
      })
      .slice(-2);

    if (
      importantTokens.length === 2 &&
      importantTokens[0].node === "delim" &&
      importantTokens[0].value === "!" &&
      importantTokens[1].node === "ident" &&
      importantTokens[1].value.toLowerCase() === "important"
    ) {
      declaration.important = true;
      const exclIndex = value.indexOf(importantTokens[0]);

      value.splice(exclIndex, value.length - exclIndex);
    } else {
      declaration.important = false;
    }

    declaration.value = value;
    return this.createNode("declaration", declaration);
  }

  consumeDeclarations(
    input: TokenScanner = this.tokens,
    options: { strict?: boolean } = {},
  ): Node[] {
    const declarations: Node[] = [];

    let token: Node | null;
    while ((token = input.consume())) {
      switch (token.node) {
        case "comment":
        case "semicolon":
        case "whitespace":
          if (!options.strict) declarations.push(token);
          break;

        case "at_keyword":
          input.reconsume();
          declarations.push(this.consumeAtRule(input));
          break;

        case "ident": {
          const declTokens: Node[] = [token];

          let nextToken: Node | null;
          while ((nextToken = input.peek())) {
            if (nextToken.node === "semicolon") break;
            declTokens.push(this.consumeComponentValue(input)!);
          }

          const decl = this.consumeDeclaration(new TokenScanner(declTokens));
          if (decl != null) declarations.push(decl);
          break;
        }

        default: {
          declarations.push(this.createNode("error", { value: "invalid" }));
          input.reconsume();

          let nextToken: Node | null;
          while ((nextToken = input.peek())) {
            if (nextToken.node === "semicolon") break;
            this.consumeComponentValue(input);
          }
        }
      }
    }

    return declarations;
  }

  consumeFunction(input: TokenScanner = this.tokens): Node {
    const fn: Record<string, Node[string]> = {
      name: input.current!.value,
      value: [],
      tokens: [input.current],
    };

    fn.tokens.push(
      ...input.collect(() => {
        let token: Node | null;
        while ((token = input.consume())) {
          if (token.node === ")") break;
          if (token.node === "comment") continue;

          input.reconsume();
          fn.value.push(this.consumeComponentValue(input));
        }
      }),
    );

    return this.createNode("function", fn);
  }

  consumeSimpleBlock(input: TokenScanner = this.tokens): Node {
    const startToken = input.current!.node;
    const endToken = Parser.BLOCK_END_TOKENS[startToken];

    const block: Record<string, Node[string]> = {
      start: startToken,
      end: endToken,
      value: [],
      tokens: [input.current],
    };

    block.tokens.push(
      ...input.collect(() => {
        let token: Node | null;
        while ((token = input.consume())) {
          if (token.node === endToken) break;

          input.reconsume();
          block.value.push(this.consumeComponentValue(input));
        }
      }),
    );

    return this.createNode("simple_block", block);
  }

  createNode(type: string, properties: Record<string, Node[string]> = {}): Node {
    return Object.assign({ node: type }, properties);
  }

  parseComponentValues(input: TokenScanner | Node[] = this.tokens): Node[] {
    if (!(input instanceof TokenScanner)) input = new TokenScanner(input);
    const tokens: Node[] = [];

    let token: Node | null;
    while ((token = this.consumeComponentValue(input))) {
      tokens.push(token);
    }

    return tokens;
  }

  parseDeclarations(
    input: TokenScanner | Node[] = this.tokens,
    options: { strict?: boolean } = {},
  ): Node[] {
    if (!(input instanceof TokenScanner)) input = new TokenScanner(input);
    return this.consumeDeclarations(input, options);
  }

  parseProperties(input: TokenScanner | Node[] = this.tokens): Node[] {
    const properties: Node[] = [];

    for (const decl of this.parseDeclarations(input)) {
      if (decl.node !== "declaration") {
        properties.push(decl);
        continue;
      }

      const children: Node[] = [...decl.value];
      if (children.length > 0 && children.at(-1)!.node === "semicolon") children.pop();

      properties.push(
        this.createNode("property", {
          name: decl.name,
          value: this.parseValue(decl.value),
          children,
          important: decl.important,
          tokens: decl.tokens,
        }),
      );
    }

    return properties;
  }

  parseValue(nodes: Node | Node[]): string {
    if (!Array.isArray(nodes)) nodes = [nodes];
    let string = "";

    for (const node of nodes) {
      switch (node.node) {
        case "comment":
        case "semicolon":
          continue;

        case "at_keyword":
        case "ident":
          string += node.value;
          break;

        case "function":
          if (typeof node.value === "string") {
            string += node.value;
            string += "(";
          } else {
            string += this.parseValue(node.tokens);
          }
          break;

        default:
          if ("raw" in node) {
            string += node.raw;
          } else if ("tokens" in node) {
            string += this.parseValue(node.tokens);
          }
      }
    }

    return string.replace(/^[\t\n\v\f\r \0]+|[\t\n\v\f\r \0]+$/g, "");
  }
}
