import type { Node } from "./tokenizer.js";

export class TokenScanner {
  current: Node | null = null;
  pos = 0;
  tokens: Node[];

  constructor(tokens: Iterable<Node>) {
    this.tokens = [...tokens];
    this.reset();
  }

  collect(block: () => void): Node[] {
    const start = this.pos;
    block();
    return this.tokens.slice(start, this.pos);
  }

  consume(): Node | null {
    this.current = this.tokens[this.pos] ?? null;
    if (this.current != null) this.pos += 1;
    return this.current;
  }

  peek(): Node | null {
    return this.tokens[this.pos] ?? null;
  }

  reconsume(): void {
    if (this.pos > 0) this.pos -= 1;
  }

  reset(): void {
    this.current = null;
    this.pos = 0;
  }
}
