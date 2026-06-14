import { SQLString } from "./sql-string.js";
import { BindParam } from "../nodes/bind-param.js";
import { resolveValueForDatabase } from "../visitors/resolve-value-for-database.js";

/**
 * InlineBinds collector — quotes casted/quoted literals during AST traversal
 * (like `Arel::Collectors::SubstituteBinds`) but leaves deferred `BindParam`
 * nodes as `?`/`$N` placeholders, so `Nodes::BindParam.new(v).to_sql` stays
 * `?`. The collector for `ToSql#compile` / `Node#toSql`: a single during-
 * traversal pass replacing the former post-hoc `?`/`$N` regex.
 */
export class InlineBinds {
  private quote: (value: unknown) => string;
  private delegate: SQLString;
  preparable = false;

  constructor(quote: (value: unknown) => string, delegate: SQLString = new SQLString()) {
    this.quote = quote;
    this.delegate = delegate;
  }

  private renders(bind: unknown): boolean {
    return bind !== undefined && !(bind instanceof BindParam);
  }

  addBind(bind: unknown, block?: (index: number) => string): this {
    if (this.renders(bind)) {
      const quoted = this.quote(resolveValueForDatabase(bind));
      this.delegate.addBind(bind, () => quoted);
    } else {
      this.delegate.addBind(bind, block);
    }
    return this;
  }

  addBinds(
    binds: unknown[],
    procForBinds?: ((v: unknown) => unknown) | null,
    block?: (index: number) => string,
  ): this {
    const resolved = binds.map((bind) => (procForBinds ? procForBinds(bind) : bind));
    let i = 0;
    this.delegate.addBinds(binds, procForBinds, (index) => {
      const bind = resolved[i++];
      if (this.renders(bind)) return this.quote(resolveValueForDatabase(bind));
      return block ? block(index) : "?";
    });
    return this;
  }

  append(str: string): this {
    this.delegate.append(str);
    return this;
  }

  get retryable(): boolean {
    return this.delegate.retryable;
  }

  set retryable(value: boolean) {
    this.delegate.retryable = value;
  }

  get value(): string {
    return this.delegate.value;
  }
}
