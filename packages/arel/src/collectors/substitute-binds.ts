import { BindParam } from "../nodes/bind-param.js";

function extractValue(bind: unknown): unknown {
  // A raw Arel BindParam carries its bound value on `.value` (the visitor
  // pushes the node itself so the Bind collector can render `?` while
  // `compileWithBinds` unwraps it). When inlining, unwrap to the value so it
  // can be quoted directly — matching Rails' `add_bind(o.value)`.
  if (bind instanceof BindParam) return extractValue(bind.value);
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

  append(str: string): this {
    this.delegate.append(str);
    return this;
  }
}
