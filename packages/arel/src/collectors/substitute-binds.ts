export class SubstituteBinds {
  private quoter: { quote(value: unknown): string };
  private delegate: { append(str: string): unknown; value: string };

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
    const value =
      bind &&
      typeof bind === "object" &&
      "valueForDatabase" in bind &&
      typeof (bind as Record<string, unknown>).valueForDatabase === "function"
        ? (bind as { valueForDatabase(): unknown }).valueForDatabase()
        : bind;
    return this.append(this.quoter.quote(value));
  }

  get value(): string {
    return this.delegate.value;
  }
}
