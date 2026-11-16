export class Result {
  readonly fields: string[];
  private rows: Array<unknown[] | Record<string, unknown>>;

  constructor(
    fields: string[],
    rows: Array<unknown[] | Record<string, unknown>>,
    private error?: Error,
  ) {
    this.fields = fields;
    this.rows = rows;
  }

  get size(): number {
    return this.rows.length;
  }

  toA(): Array<unknown[] | Record<string, unknown>> {
    if (this.error) throw this.error;
    return this.rows;
  }

  free(): void {
    this.rows = [];
  }
}
