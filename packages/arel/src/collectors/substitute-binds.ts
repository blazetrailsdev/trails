function extractValue(bind: unknown): unknown {
  if (
    bind &&
    typeof bind === "object" &&
    "valueForDatabase" in bind &&
    typeof (bind as Record<string, unknown>).valueForDatabase === "function"
  ) {
    return (bind as { valueForDatabase(): unknown }).valueForDatabase();
  }
  return bind;
}

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

  append(str: string): this {
    this.delegate.append(str);
    return this;
  }

  addBind(bind: unknown): this {
    return this.append(this.quoter.quote(extractValue(bind)));
  }

  addBinds(binds: unknown[], procForBinds?: ((v: unknown) => unknown) | null): this {
    const quoted = binds.map((bind) => {
      const value = procForBinds ? procForBinds(bind) : bind;
      return this.quoter.quote(extractValue(value));
    });
    this.append(quoted.join(", "));
    return this;
  }

  get value(): string {
    return this.delegate.value;
  }
}
