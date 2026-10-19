export class JsParseError extends SyntaxError {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(`${message} (at offset ${offset})`);
  }
}

export interface JsLocation {
  startOffset: number;
  endOffset: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export class JsNode {
  constructor(
    readonly type: string,
    readonly nodeId: number,
    readonly location: JsLocation,
    readonly children: readonly JsNode[],
    readonly source: string,
  ) {}

  get slice(): string {
    return this.source.slice(this.location.startOffset, this.location.endOffset);
  }

  breadthFirstSearch(block: (node: JsNode) => boolean): JsNode | null {
    const queue: JsNode[] = [this];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (block(node)) return node;
      queue.push(...node.children);
    }
    return null;
  }
}

type TokType = "name" | "num" | "string" | "template" | "regex" | "punct" | "eof";

interface Tok {
  type: TokType;
  value: string;
  start: number;
  end: number;
  nlBefore: boolean;
}

const PUNCTUATORS =
  ">>>= ... === !== **= <<= >>= >>> &&= ||= ??= => == != <= >= && || ?? ?. ++ -- += -= *= /= %= &= |= ^= << >> ** { } ( ) [ ] ; , < > + - * / % & | ^ ! ~ ? : = . @ #".split(
    " ",
  );

const REGEX_AFTER_NAME = new Set(
  "return typeof instanceof in of new delete void throw case do else yield await".split(" "),
);

const BINARY_PRECEDENCE: Record<string, number> = Object.fromEntries(
  "??,||,&&,|,^,&,== != === !==,< > <= >= instanceof in,<< >> >>>,+ -,* / %,**"
    .split(",")
    .flatMap((tier, i) => tier.split(" ").map((op) => [op, i + 1])),
);

const ASSIGN_OPS = new Set("= += -= *= /= %= **= <<= >>= >>>= &= |= ^= &&= ||= ??=".split(" "));

const UNARY_OPS = new Set(["!", "~", "+", "-", "typeof", "void", "delete", "await"]);

const SPACE_RE = /(?:\s|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))*/y;

const LEXEMES: [RegExp, TokType][] = [
  [/[\p{ID_Start}$_\\][\p{ID_Continue}$\\]*/uy, "name"],
  [/(?:0[xXoObB][\da-fA-F_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y, "num"],
  [/(["'])(?:\\[\s\S]|(?!\1)[^\\\n])*\1/y, "string"],
  [/\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[\p{ID_Continue}]*/uy, "regex"],
];

export function parseScript(source: string): { value: JsNode } {
  const parser = new Parser(source, 0, source.length, {
    id: 0,
    lines: [0, ...[...source.matchAll(/\n/g)].map((m) => m.index + 1)],
  });
  return { value: parser.parseProgram() };
}

class Parser {
  private pos: number;
  private tok!: Tok;
  private prev: Tok | null = null;

  constructor(
    private readonly src: string,
    start: number,
    private readonly limit: number,
    private readonly ids: { id: number; lines: number[] },
  ) {
    this.pos = start;
    this.next();
  }

  parseProgram(): JsNode {
    const start = this.tok.start;
    const body: JsNode[] = [];
    while (this.tok.type !== "eof") body.push(this.parseStatement());
    return this.finish("Program", start, body, this.limit);
  }

  private next(): void {
    if (this.tok) this.prev = this.tok;
    SPACE_RE.lastIndex = this.pos;
    const space = SPACE_RE.exec(this.src)![0];
    const nlBefore = space.includes("\n");
    const start = (this.pos += space.length);
    if (start >= this.limit) {
      if (start > this.limit || /\/\*(?![\s\S]*\*\/)/.test(space))
        this.raise("Unterminated comment", start);
      this.tok = { type: "eof", value: "", start, end: start, nlBefore };
      return;
    }
    const ch = this.src[start];
    let type: TokType = "punct";
    if (ch === "`") {
      this.skipTemplate();
      type = "template";
    } else {
      const regexAllowed = ch === "/" && this.regexAllowed();
      for (const [re, kind] of LEXEMES) {
        if (kind === "regex" && !regexAllowed) continue;
        re.lastIndex = start;
        const m = re.exec(this.src);
        if (m === null) continue;
        this.pos += m[0].length;
        type = kind;
        break;
      }
      if (this.pos === start) {
        const p = PUNCTUATORS.find((op) => this.src.startsWith(op, start));
        if (p === undefined) this.raise(`Unexpected character ${JSON.stringify(ch)}`, start);
        this.pos += p === "?." && /[0-9]/.test(this.src[start + 2] ?? "") ? 1 : p.length;
      }
    }
    if (this.pos > this.limit) this.raise(`Unterminated ${type}`, start);
    this.tok = { type, value: this.src.slice(start, this.pos), start, end: this.pos, nlBefore };
  }

  private regexAllowed(): boolean {
    const p = this.prev;
    if (p === null) return true;
    if (p.type === "name") return REGEX_AFTER_NAME.has(p.value);
    if (p.type === "punct") return ![")", "]", "}", "++", "--"].includes(p.value);
    return false;
  }

  private templateSubstitutions: Map<number, [number, number][]> = new Map();

  private skipTemplate(): void {
    const start = this.pos;
    const subs: [number, number][] = [];
    this.pos++;
    while (this.src[this.pos] !== "`") {
      if (this.pos >= this.limit) this.raise("Unterminated template", start);
      if (this.src[this.pos] === "\\") this.pos += 2;
      else if (this.src.startsWith("${", this.pos)) {
        const exprStart = this.pos + 2;
        const saved = { tok: this.tok, prev: this.prev };
        this.pos = exprStart;
        this.tok = {
          type: "punct",
          value: "${",
          start: this.pos - 2,
          end: exprStart,
          nlBefore: false,
        };
        let depth = 0;
        for (;;) {
          this.next();
          if (this.tok.type === "eof") this.raise("Unterminated template", start);
          if (this.tok.value === "{" && this.tok.type === "punct") depth++;
          else if (this.tok.value === "}" && this.tok.type === "punct" && depth-- === 0) break;
        }
        subs.push([exprStart, this.tok.start]);
        this.tok = saved.tok;
        this.prev = saved.prev;
      } else this.pos++;
    }
    this.pos++;
    this.templateSubstitutions.set(start, subs);
  }

  private raise(message: string, offset = this.tok.start): never {
    throw new JsParseError(message, offset);
  }

  private is(value: string): boolean {
    return (this.tok.type === "punct" || this.tok.type === "name") && this.tok.value === value;
  }

  private eat(value: string): boolean {
    if (!this.is(value)) return false;
    this.next();
    return true;
  }

  private expect(value: string): void {
    if (!this.eat(value))
      this.raise(`Expected ${JSON.stringify(value)} but found ${JSON.stringify(this.tok.value)}`);
  }

  private semicolon(): void {
    if (this.eat(";") || this.is("}") || this.tok.type === "eof" || this.tok.nlBefore) return;
    this.raise(`Unexpected token ${JSON.stringify(this.tok.value)}`);
  }

  private position(offset: number): [number, number] {
    const { lines } = this.ids;
    let lo = 0;
    for (let hi = lines.length - 1; lo < hi; ) {
      const mid = (lo + hi + 1) >> 1;
      if (lines[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return [lo + 1, offset - lines[lo]];
  }

  private finish(
    type: string,
    start: number,
    children: JsNode[],
    end = this.prev?.end ?? start,
  ): JsNode {
    const [startLine, startColumn] = this.position(start);
    const [endLine, endColumn] = this.position(end);
    const location = {
      startOffset: start,
      endOffset: end,
      startLine,
      startColumn,
      endLine,
      endColumn,
    };
    return new JsNode(type, ++this.ids.id, location, children, this.src);
  }

  private save(): [number, Tok, Tok | null] {
    return [this.pos, this.tok, this.prev];
  }

  private restore([pos, tok, prev]: [number, Tok, Tok | null]): void {
    this.pos = pos;
    this.tok = tok;
    this.prev = prev;
  }

  private parseStatement(): JsNode {
    const start = this.tok.start;
    const kw = this.tok.type === "name" ? this.tok.value : null;
    if (this.is("{")) return this.parseBlock();
    if (this.eat(";")) return this.finish("EmptyStatement", start, []);
    if (kw === "export") {
      this.next();
      this.eat("default");
      const decl = this.isFunctionStart()
        ? this.parseFunction("FunctionDeclaration")
        : this.parseStatement();
      return this.finish("ExportDeclaration", start, [decl]);
    }
    if (kw === "const" || kw === "var" || (kw === "let" && this.peekIsBindingStart())) {
      const decl = this.parseVariableDeclaration();
      this.semicolon();
      return decl;
    }
    if (this.isFunctionStart()) return this.parseFunction("FunctionDeclaration");
    if (kw === "class") return this.parseClass("ClassDeclaration");
    if (kw !== null && this.peekIsLabel()) {
      const label = this.parseIdentifier();
      this.expect(":");
      return this.finish("LabeledStatement", start, [label, this.parseStatement()]);
    }
    switch (kw) {
      case "if": {
        this.next();
        const children = [this.parseParenExpression(), this.parseStatement()];
        if (this.eat("else")) children.push(this.parseStatement());
        return this.finish("IfStatement", start, children);
      }
      case "for":
        return this.parseFor(start);
      case "while": {
        this.next();
        const test = this.parseParenExpression();
        return this.finish("WhileStatement", start, [test, this.parseStatement()]);
      }
      case "do": {
        this.next();
        const body = this.parseStatement();
        this.expect("while");
        const test = this.parseParenExpression();
        this.eat(";");
        return this.finish("DoWhileStatement", start, [body, test]);
      }
      case "switch": {
        this.next();
        const children = [this.parseParenExpression()];
        this.expect("{");
        while (!this.eat("}")) {
          const caseStart = this.tok.start;
          const clause: JsNode[] = [];
          if (this.eat("case")) clause.push(this.parseExpression());
          else if (!this.eat("default"))
            this.raise(`Unexpected token ${JSON.stringify(this.tok.value)}`);
          this.expect(":");
          while (!this.is("case") && !this.is("default") && !this.is("}")) {
            if (this.tok.type === "eof") this.raise("Unterminated switch", start);
            clause.push(this.parseStatement());
          }
          children.push(this.finish("SwitchCase", caseStart, clause));
        }
        return this.finish("SwitchStatement", start, children);
      }
      case "return":
      case "throw": {
        this.next();
        const children: JsNode[] = [];
        if (!this.is(";") && !this.is("}") && this.tok.type !== "eof" && !this.tok.nlBefore)
          children.push(this.parseExpression());
        this.semicolon();
        return this.finish(kw === "return" ? "ReturnStatement" : "ThrowStatement", start, children);
      }
      case "break":
      case "continue": {
        this.next();
        const children: JsNode[] = [];
        if (this.tok.type === "name" && !this.tok.nlBefore) children.push(this.parseIdentifier());
        this.semicolon();
        return this.finish(
          kw === "break" ? "BreakStatement" : "ContinueStatement",
          start,
          children,
        );
      }
      case "try": {
        this.next();
        const children = [this.parseBlock()];
        if (this.is("catch")) {
          const catchStart = this.tok.start;
          this.next();
          const clause = [...(this.is("(") ? this.parseParams() : []), this.parseBlock()];
          children.push(this.finish("CatchClause", catchStart, clause));
        }
        if (this.eat("finally")) children.push(this.parseBlock());
        return this.finish("TryStatement", start, children);
      }
    }
    return this.parseExpressionStatement();
  }

  private parseExpressionStatement(): JsNode {
    const start = this.tok.start;
    const expr = this.parseExpression();
    this.semicolon();
    return this.finish("ExpressionStatement", start, [expr]);
  }

  private peekIsBindingStart(): boolean {
    const saved = this.save();
    this.next();
    const result = this.tok.type === "name" || this.is("[") || this.is("{");
    this.restore(saved);
    return result;
  }

  private peekIsLabel(): boolean {
    const saved = this.save();
    this.next();
    const result = this.is(":");
    this.restore(saved);
    return result;
  }

  private isFunctionStart(): boolean {
    if (this.is("function")) return true;
    if (!this.is("async")) return false;
    const saved = this.save();
    this.next();
    const result = this.is("function") && !this.tok.nlBefore;
    this.restore(saved);
    return result;
  }

  private parseBlock(): JsNode {
    const start = this.tok.start;
    this.expect("{");
    const body: JsNode[] = [];
    while (!this.eat("}")) {
      if (this.tok.type === "eof") this.raise("Unterminated block", start);
      body.push(this.parseStatement());
    }
    return this.finish("BlockStatement", start, body);
  }

  private parseParenExpression(): JsNode {
    this.expect("(");
    const expr = this.parseExpression();
    this.expect(")");
    return expr;
  }

  private parseVariableDeclaration(noIn = false): JsNode {
    const start = this.tok.start;
    this.next();
    const declarators: JsNode[] = [];
    do {
      const declStart = this.tok.start;
      const parts = [this.parseConditional(true)];
      if (this.eat("=")) parts.push(this.parseAssignment(noIn));
      declarators.push(this.finish("VariableDeclarator", declStart, parts));
    } while (this.eat(","));
    return this.finish("VariableDeclaration", start, declarators);
  }

  private parseFor(start: number): JsNode {
    this.next();
    this.eat("await");
    this.expect("(");
    const children: JsNode[] = [];
    let init: JsNode | null = null;
    if (this.is("const") || this.is("var") || this.is("let"))
      init = this.parseVariableDeclaration(true);
    else if (!this.is(";")) init = this.parseExpression(true);
    if (init !== null && (this.is("of") || this.is("in"))) {
      const type = this.tok.value === "of" ? "ForOfStatement" : "ForInStatement";
      this.next();
      children.push(init, this.parseAssignment());
      this.expect(")");
      children.push(this.parseStatement());
      return this.finish(type, start, children);
    }
    if (init !== null) children.push(init);
    this.expect(";");
    if (!this.is(";")) children.push(this.parseExpression());
    this.expect(";");
    if (!this.is(")")) children.push(this.parseExpression());
    this.expect(")");
    children.push(this.parseStatement());
    return this.finish("ForStatement", start, children);
  }

  private parseFunction(type: string): JsNode {
    const start = this.tok.start;
    this.eat("async");
    this.expect("function");
    this.eat("*");
    const children: JsNode[] = [];
    if (this.tok.type === "name") children.push(this.parseIdentifier());
    children.push(...this.parseParams(), this.parseBlock());
    return this.finish(type, start, children);
  }

  private parseClass(type: string): JsNode {
    const start = this.tok.start;
    this.expect("class");
    const children: JsNode[] = [];
    if (this.tok.type === "name" && !this.is("extends") && !this.is("{"))
      children.push(this.parseIdentifier());
    if (this.eat("extends")) children.push(this.parseCallOrMember());
    const bodyStart = this.tok.start;
    this.expect("{");
    const members: JsNode[] = [];
    while (!this.eat("}")) {
      if (this.eat(";")) continue;
      if (this.tok.type === "eof") this.raise("Unterminated class body", bodyStart);
      members.push(this.parseClassMember());
    }
    children.push(this.finish("ClassBody", bodyStart, members));
    return this.finish(type, start, children);
  }

  private parseClassMember(): JsNode {
    const start = this.tok.start;
    if (this.is("static")) {
      const saved = this.save();
      this.next();
      if (this.is("{")) return this.finish("StaticBlock", start, this.parseBlock().children);
      if (this.is("(") || this.is("=") || this.is(";") || this.is("}")) this.restore(saved);
    }
    for (const modifier of ["async", "get", "set"]) {
      if (this.is(modifier) && this.peekIsMemberKey()) this.next();
    }
    this.eat("*");
    const parts: JsNode[] = [];
    if (this.eat("[")) {
      parts.push(this.parseAssignment());
      this.expect("]");
    } else if (this.is("#")) {
      parts.push(this.parsePropertyName());
    } else if (this.tok.type === "name" || this.tok.type === "string" || this.tok.type === "num") {
      parts.push(this.parseKey());
    } else this.raise(`Unexpected token ${JSON.stringify(this.tok.value)}`);
    if (this.is("(")) {
      const fnStart = this.tok.start;
      parts.push(
        this.finish("FunctionExpression", fnStart, [...this.parseParams(), this.parseBlock()]),
      );
      return this.finish("MethodDefinition", start, parts);
    }
    if (this.eat("=")) parts.push(this.parseAssignment());
    this.semicolon();
    return this.finish("PropertyDefinition", start, parts);
  }

  private peekIsMemberKey(): boolean {
    const saved = this.save();
    this.next();
    const result =
      !this.tok.nlBefore &&
      (this.tok.type === "name" ||
        this.tok.type === "string" ||
        this.tok.type === "num" ||
        this.is("[") ||
        this.is("#") ||
        this.is("*"));
    this.restore(saved);
    return result;
  }

  private parseParams(): JsNode[] {
    this.expect("(");
    const params: JsNode[] = [];
    while (!this.eat(")")) {
      params.push(this.parseElement());
      if (!this.is(")")) this.expect(",");
    }
    return params;
  }

  private parseExpression(noIn = false): JsNode {
    const start = this.tok.start;
    const first = this.parseAssignment(noIn);
    if (!this.is(",")) return first;
    const expressions = [first];
    while (this.eat(",")) expressions.push(this.parseAssignment(noIn));
    return this.finish("SequenceExpression", start, expressions);
  }

  private parseAssignment(noIn = false): JsNode {
    const start = this.tok.start;
    const arrow = this.tryArrow();
    if (arrow !== null) return arrow;
    const left = this.parseConditional(noIn);
    if (this.tok.type === "punct" && ASSIGN_OPS.has(this.tok.value)) {
      this.next();
      return this.finish("AssignmentExpression", start, [left, this.parseAssignment(noIn)]);
    }
    return left;
  }

  private tryArrow(): JsNode | null {
    const start = this.tok.start;
    const saved = this.save();
    if (!this.eat("async") || this.tok.nlBefore) this.restore(saved);
    let params: JsNode[] | null = null;
    if (this.tok.type === "name" && !this.is("async")) params = [this.parseIdentifier()];
    else if (this.is("(") && this.parenFollowedByArrow()) params = this.parseParams();
    if (params === null || !this.is("=>") || this.tok.nlBefore) {
      this.restore(saved);
      return null;
    }
    this.next();
    const body = this.is("{") ? this.parseBlock() : this.parseAssignment();
    return this.finish("ArrowFunctionExpression", start, [...params, body]);
  }

  private parenFollowedByArrow(): boolean {
    const saved = this.save();
    let depth = 0;
    do {
      if (this.tok.type === "eof") break;
      if (this.tok.type === "punct" && "([{".includes(this.tok.value)) depth++;
      else if (this.tok.type === "punct" && ")]}".includes(this.tok.value)) depth--;
      this.next();
    } while (depth > 0);
    const result = this.is("=>");
    this.restore(saved);
    return result;
  }

  private parseConditional(noIn = false): JsNode {
    const start = this.tok.start;
    const test = this.parseBinary(0, noIn);
    if (!this.eat("?")) return test;
    const consequent = this.parseAssignment();
    this.expect(":");
    return this.finish("ConditionalExpression", start, [
      test,
      consequent,
      this.parseAssignment(noIn),
    ]);
  }

  private parseBinary(minPrecedence: number, noIn: boolean): JsNode {
    const start = this.tok.start;
    let left = this.parseUnary();
    for (;;) {
      const op = this.tok.value;
      const precedence =
        (this.tok.type === "punct" || this.tok.type === "name") &&
        Object.hasOwn(BINARY_PRECEDENCE, op)
          ? BINARY_PRECEDENCE[op]
          : -1;
      if (precedence <= minPrecedence || (noIn && op === "in")) return left;
      this.next();
      const right = this.parseBinary(op === "**" ? precedence - 1 : precedence, noIn);
      const type =
        op === "&&" || op === "||" || op === "??" ? "LogicalExpression" : "BinaryExpression";
      left = this.finish(type, start, [left, right]);
    }
  }

  private parseUnary(): JsNode {
    const start = this.tok.start;
    if ((this.tok.type === "punct" || this.tok.type === "name") && UNARY_OPS.has(this.tok.value)) {
      const op = this.tok.value;
      this.next();
      const argument = this.parseUnary();
      return this.finish(op === "await" ? "AwaitExpression" : "UnaryExpression", start, [argument]);
    }
    if (this.is("++") || this.is("--")) {
      this.next();
      return this.finish("UpdateExpression", start, [this.parseUnary()]);
    }
    const expr = this.parseCallOrMember();
    if ((this.is("++") || this.is("--")) && !this.tok.nlBefore) {
      this.next();
      return this.finish("UpdateExpression", start, [expr]);
    }
    return expr;
  }

  private parseCallOrMember(): JsNode {
    const start = this.tok.start;
    let expr: JsNode;
    if (this.is("new")) {
      this.next();
      let callee = this.parsePrimary();
      while (this.is(".") || this.is("[")) callee = this.parseMemberTail(start, callee);
      const args = this.is("(") ? this.parseParams() : [];
      expr = this.finish("NewExpression", start, [callee, ...args]);
    } else {
      expr = this.parsePrimary();
    }
    for (;;) {
      if (this.is(".") || this.is("[")) expr = this.parseMemberTail(start, expr);
      else if (this.is("?.")) {
        this.next();
        if (this.is("("))
          expr = this.finish("CallExpression", start, [expr, ...this.parseParams()]);
        else if (this.is("[")) expr = this.parseMemberTail(start, expr);
        else expr = this.finish("MemberExpression", start, [expr, this.parsePropertyName()]);
      } else if (this.is("("))
        expr = this.finish("CallExpression", start, [expr, ...this.parseParams()]);
      else if (this.tok.type === "template")
        expr = this.finish("TaggedTemplateExpression", start, [expr, this.parsePrimary()]);
      else return expr;
    }
  }

  private parseMemberTail(start: number, object: JsNode): JsNode {
    if (this.eat("[")) {
      const property = this.parseExpression();
      this.expect("]");
      return this.finish("MemberExpression", start, [object, property]);
    }
    this.expect(".");
    return this.finish("MemberExpression", start, [object, this.parsePropertyName()]);
  }

  private parsePropertyName(): JsNode {
    const start = this.tok.start;
    this.eat("#");
    if (this.tok.type !== "name") this.raise(`Unexpected token ${JSON.stringify(this.tok.value)}`);
    this.next();
    return this.finish("Identifier", start, []);
  }

  private parseElement(): JsNode {
    const start = this.tok.start;
    if (this.eat("...")) return this.finish("SpreadElement", start, [this.parseAssignment()]);
    return this.parseAssignment();
  }

  private parseIdentifier(): JsNode {
    const start = this.tok.start;
    this.next();
    return this.finish("Identifier", start, []);
  }

  private parsePrimary(): JsNode {
    const start = this.tok.start;
    const tok = this.tok;
    switch (tok.type) {
      case "num":
      case "string":
      case "regex":
        this.next();
        return this.finish("Literal", start, []);
      case "template": {
        this.next();
        const expressions = (this.templateSubstitutions.get(start) ?? []).map(([s, e]) =>
          new Parser(this.src, s, e, this.ids).parseExpression(),
        );
        return this.finish("TemplateLiteral", start, expressions);
      }
      case "name":
        if (this.isFunctionStart()) return this.parseFunction("FunctionExpression");
        if (tok.value === "class") return this.parseClass("ClassExpression");
        if (tok.value === "this") {
          this.next();
          return this.finish("ThisExpression", start, []);
        }
        if (["null", "true", "false"].includes(tok.value)) {
          this.next();
          return this.finish("Literal", start, []);
        }
        return this.parseIdentifier();
      case "punct":
        if (this.eat("(")) {
          const expr = this.parseExpression();
          this.expect(")");
          return this.finish("ParenthesizedExpression", start, [expr]);
        }
        if (this.eat("[")) {
          const elements: JsNode[] = [];
          while (!this.eat("]")) {
            if (this.eat(",")) continue;
            elements.push(this.parseElement());
            if (!this.is("]")) this.expect(",");
          }
          return this.finish("ArrayExpression", start, elements);
        }
        if (this.is("{")) return this.parseObject();
    }
    this.raise(
      tok.type === "eof"
        ? "Unexpected end of input"
        : `Unexpected token ${JSON.stringify(tok.value)}`,
    );
  }

  private parseObject(): JsNode {
    const start = this.tok.start;
    this.expect("{");
    const properties: JsNode[] = [];
    while (!this.eat("}")) {
      const propStart = this.tok.start;
      if (this.eat("...")) {
        properties.push(this.finish("SpreadElement", propStart, [this.parseAssignment()]));
      } else {
        const parts: JsNode[] = [];
        if (["async", "get", "set"].includes(this.tok.value) && this.peekIsBindingStart())
          this.next();
        this.eat("*");
        if (this.eat("[")) {
          parts.push(this.parseAssignment());
          this.expect("]");
        } else if (
          this.tok.type === "name" ||
          this.tok.type === "string" ||
          this.tok.type === "num"
        ) {
          parts.push(this.parseKey());
        } else this.raise(`Unexpected token ${JSON.stringify(this.tok.value)}`);
        if (this.is("(")) {
          const fnStart = this.tok.start;
          parts.push(
            this.finish("FunctionExpression", fnStart, [...this.parseParams(), this.parseBlock()]),
          );
        } else if (this.eat(":") || this.eat("=")) {
          parts.push(this.parseAssignment());
        }
        properties.push(this.finish("Property", propStart, parts));
      }
      if (!this.is("}")) this.expect(",");
    }
    return this.finish("ObjectExpression", start, properties);
  }

  private parseKey(): JsNode {
    const start = this.tok.start;
    const type = this.tok.type === "name" ? "Identifier" : "Literal";
    this.next();
    return this.finish(type, start, []);
  }
}
