import { SQLString } from "./sql-string.js";

type Quoter = {
  quote(value: unknown): string;
};

/**
 * SubstituteBindCollector — inlines bind values into the SQL using a quoter.
 *
 * Mirrors: Arel::Collectors::SubstituteBinds
 */
export class SubstituteBindCollector {
  readonly quoter: Quoter;
  readonly collector: SQLString;

  constructor(quoter: Quoter, collector: SQLString = new SQLString()) {
    this.quoter = quoter;
    this.collector = collector;
  }

  append(str: string): this {
    this.collector.append(str);
    return this;
  }

  addBind(value: unknown): this {
    this.collector.append(this.quoter.quote(value));
    return this;
  }

  get retryable(): boolean {
    return this.collector.retryable;
  }

  set retryable(value: boolean) {
    this.collector.retryable = value;
  }

  get value(): string {
    return this.collector.value;
  }
}
