export class NestedContext {
  /** @internal */
  private depth: number;

  constructor() {
    this.depth = 0;
  }

  enter<T>(block: () => T): T {
    this.push();

    try {
      return block();
    } finally {
      this.pop();
    }
  }

  isEntered(): boolean {
    return this.depth > 0;
  }

  /** @internal */
  private push(): number {
    return (this.depth += 1);
  }

  /** @internal */
  private pop(): number {
    return (this.depth -= 1);
  }
}
