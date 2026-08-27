export class Bind {
  private binds: unknown[];
  retryable?: boolean;

  constructor() {
    this.binds = [];
  }

  addBind(bind: unknown, _block: (index: number) => string): this {
    this.binds.push(bind);
    return this;
  }

  addBinds(
    binds: unknown[],
    procForBinds: ((v: unknown) => unknown) | null | undefined,
    _block: (index: number) => string,
  ): this {
    const mapped = procForBinds ? binds.map(procForBinds) : binds;
    this.binds.push(...mapped);
    return this;
  }

  get value(): unknown[] {
    return this.binds;
  }

  append(_str: string): this {
    return this;
  }
}
