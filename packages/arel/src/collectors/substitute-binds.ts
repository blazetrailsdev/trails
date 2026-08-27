export class SubstituteBinds {
  private quoter: { quote(value: unknown): string };
  private delegate: { append(str: string): unknown; value: string };
  preparable = false;
  retryable = true;

  constructor(
    quoter: { quote(value: unknown): string },
    delegateCollector: { append(str: string): unknown; value: string },
  ) {
    this.quoter = quoter;
    this.delegate = delegateCollector;
  }

  addBind(bind: unknown): this {
    if (bind != null && typeof bind === "object" && "valueForDatabase" in bind) {
      const valueForDatabase = (bind as Record<string, unknown>).valueForDatabase;
      bind =
        typeof valueForDatabase === "function"
          ? (valueForDatabase as () => unknown).call(bind)
          : valueForDatabase;
    }
    return this.append(this.quoter.quote(bind));
  }

  addBinds(binds: unknown[], _procForBinds?: ((v: unknown) => unknown) | null): this {
    this.append(binds.map((bind) => this.quoter.quote(bind)).join(", "));
    return this;
  }

  get value(): string {
    return this.delegate.value;
  }

  append(str: string): this {
    this.delegate.append(str);
    return this;
  }
}
