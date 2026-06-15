import { BindParam } from "../nodes/bind-param.js";

function extractValue(bind: unknown): unknown {
  // A raw Arel BindParam carries its bound value on `.value` (the visitor
  // pushes the node itself so the Bind collector can render `?` while
  // `compileWithBinds` unwraps it). When inlining, unwrap to the value so it
  // can be quoted directly — matching Rails' `add_bind(o.value)`.
  if (bind instanceof BindParam) return extractValue(bind.value);
  if (bind && typeof bind === "object" && "valueForDatabase" in bind) {
    // `valueForDatabase` is a method on a raw Arel attribute but a getter on
    // ActiveModel::Attribute (`get valueForDatabase()`); read the property and
    // only invoke it when it resolves to a function so both shapes unwrap.
    const v = (bind as Record<string, unknown>).valueForDatabase;
    return typeof v === "function" ? (v as () => unknown).call(bind) : v;
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

  // Mirrors Rails `SubstituteBinds#add_binds` (substitute_binds.rb:23-25):
  // it keeps the `proc_for_binds` parameter for caller-signature parity but
  // ignores it, and quotes each bind directly with NO `value_for_database`
  // unwrapping (unlike `add_bind`). The callers pass already-cast values
  // (`HomogeneousIn#casted_values`), so no further transformation is needed.
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
