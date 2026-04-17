type CollectorLike = {
  append(str: string): unknown;
  addBind(value: unknown, block?: (index: number) => string): unknown;
  addBinds?(binds: unknown[], procForBinds?: ((v: unknown) => unknown) | null): unknown;
  retryable?: boolean;
  value?: unknown;
};

/**
 * Composite collector — forwards calls to multiple collectors at once.
 *
 * Mirrors: Arel::Collectors::Composite
 */
export class Composite {
  private left: CollectorLike;
  private right: CollectorLike;
  preparable = false;

  constructor(left: CollectorLike, right: CollectorLike) {
    this.left = left;
    this.right = right;
  }

  append(str: string): this {
    this.left.append(str);
    this.right.append(str);
    return this;
  }

  addBind(value: unknown, block?: (index: number) => string): this {
    this.left.addBind(value, block);
    this.right.addBind(value);
    return this;
  }

  addBinds(binds: unknown[], procForBinds?: ((v: unknown) => unknown) | null): this {
    if (this.left.addBinds) this.left.addBinds(binds, procForBinds);
    if (this.right.addBinds) this.right.addBinds(binds, procForBinds);
    return this;
  }

  get retryable(): boolean {
    if ("retryable" in this.left && this.left.retryable === false) return false;
    if ("retryable" in this.right && this.right.retryable === false) return false;
    return true;
  }

  set retryable(value: boolean) {
    if ("retryable" in this.left)
      (this.left as CollectorLike & { retryable: boolean }).retryable = value;
    if ("retryable" in this.right)
      (this.right as CollectorLike & { retryable: boolean }).retryable = value;
  }

  get value(): [unknown, unknown] {
    return [this.left.value, this.right.value];
  }
}
