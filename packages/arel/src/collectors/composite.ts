type CollectorLike = {
  append(str: string): unknown;
  addBind(value: unknown, block: (index: number) => string): unknown;
  addBinds(
    binds: unknown[],
    procForBinds: ((v: unknown) => unknown) | null | undefined,
    block: (index: number) => string,
  ): unknown;
  retryable?: boolean;
  value?: unknown;
};

/**
 * Composite collector — forwards calls to multiple collectors at once.
 *
 * Mirrors: Arel::Collectors::Composite
 */
export class Composite {
  // `attr_accessor :preparable` (composite.rb:7) — no default; nil until written.
  preparable?: boolean;
  #retryable?: boolean;

  // `attr_reader :retryable` (composite.rb:8), written only by `retryable=`.
  get retryable(): boolean | undefined {
    return this.#retryable;
  }

  set retryable(retryable: boolean) {
    this.left.retryable = retryable;
    this.right.retryable = retryable;
    this.#retryable = retryable;
  }

  constructor(left: CollectorLike, right: CollectorLike) {
    this.left = left;
    this.right = right;
  }

  addBind(bind: unknown, block: (index: number) => string): this {
    this.left.addBind(bind, block);
    this.right.addBind(bind, block);
    return this;
  }

  addBinds(
    binds: unknown[],
    procForBinds: ((v: unknown) => unknown) | null | undefined,
    block: (index: number) => string,
  ): this {
    this.left.addBinds(binds, procForBinds, block);
    this.right.addBinds(binds, procForBinds, block);
    return this;
  }

  get value(): [unknown, unknown] {
    return [this.left.value, this.right.value];
  }

  append(str: string): this {
    this.left.append(str);
    this.right.append(str);
    return this;
  }

  private left: CollectorLike;
  private right: CollectorLike;
}
