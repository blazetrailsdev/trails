type CollectorLike = {
  append(str: string): unknown;
  addBind(value: unknown): unknown;
  retryable?: boolean;
};

/**
 * Composite collector — forwards calls to multiple collectors at once.
 *
 * Mirrors: Arel::Collectors::Composite
 */
export class Composite {
  readonly collectors: CollectorLike[];

  constructor(...collectors: CollectorLike[]) {
    this.collectors = collectors;
  }

  append(str: string): this {
    for (const c of this.collectors) c.append(str);
    return this;
  }

  addBind(value: unknown): this {
    for (const c of this.collectors) c.addBind(value);
    return this;
  }

  get retryable(): boolean {
    for (const c of this.collectors) {
      if ("retryable" in c && c.retryable === false) return false;
    }
    return true;
  }

  set retryable(value: boolean) {
    for (const c of this.collectors) {
      if ("retryable" in c) (c as CollectorLike & { retryable: boolean }).retryable = value;
    }
  }
}
