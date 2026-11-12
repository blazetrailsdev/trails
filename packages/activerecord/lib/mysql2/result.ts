export class Result {
  readonly fields: string[];
  private rows: unknown[][];

  constructor(
    fields: string[],
    rows: unknown[][],
    private error?: Error,
  ) {
    this.fields = fields;
    this.rows = rows;
  }

  get size(): number {
    return this.rows.length;
  }

  toA(): unknown[][] {
    if (this.error) throw this.error;
    return this.rows;
  }

  free(): void {
    this.rows = [];
  }
}
