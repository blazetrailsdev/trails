/**
 * Bind collector — collects bind params separately from the SQL.
 *
 * Mirrors: Arel::Collectors::Bind
 */
export class Bind {
  private binds: unknown[];
  retryable = true;

  constructor() {
    this.binds = [];
  }

  append(_str: string): this {
    return this;
  }

  addBind(bind: unknown): this {
    this.binds.push(bind);
    return this;
  }

  addBinds(binds: unknown[], procForBinds?: ((v: unknown) => unknown) | null): this {
    const mapped = procForBinds ? binds.map(procForBinds) : binds;
    this.binds.push(...mapped);
    return this;
  }

  get value(): unknown[] {
    return this.binds;
  }
}
