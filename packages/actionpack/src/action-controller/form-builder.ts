const _registry = new WeakMap<object, unknown>();

function lookupForClass(klass: object | null | undefined): unknown {
  let cur: object | null | undefined = klass;
  while (cur) {
    if (_registry.has(cur)) return _registry.get(cur);
    cur = Object.getPrototypeOf(cur);
  }
  return undefined;
}

export function defaultFormBuilder(this: new (...a: never[]) => unknown, builder: unknown): unknown;
export function defaultFormBuilder(this: new (...a: never[]) => unknown): unknown;
export function defaultFormBuilder(this: object): unknown;
export function defaultFormBuilder(this: unknown, builder?: unknown): unknown {
  const receiverIsClass = typeof this === "function";
  const klass: object | null = receiverIsClass
    ? (this as object)
    : this && typeof this === "object"
      ? ((this as { constructor?: object }).constructor ?? null)
      : null;

  if (arguments.length === 0) {
    return klass ? lookupForClass(klass) : undefined;
  }
  if (!receiverIsClass) {
    throw new TypeError(
      "defaultFormBuilder: instance receiver takes no arguments. " +
        "Use `Controller.defaultFormBuilder(builder)` to set the class default.",
    );
  }
  if (klass) _registry.set(klass, builder);
  return builder;
}
