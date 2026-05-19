/**
 * ActionController::FormBuilder
 *
 * Configure a custom form builder for controllers. When set, `form_with`
 * and `form_for` will use the specified builder class.
 * @see https://api.rubyonrails.org/classes/ActionController/FormBuilder.html
 *
 * Mirrors `actionpack/lib/action_controller/form_builder.rb`:
 *
 *     module ClassMethods
 *       def default_form_builder(builder)
 *         self._default_form_builder = builder
 *       end
 *     end
 *
 *     def default_form_builder
 *       self.class._default_form_builder
 *     end
 *
 * Rails uses `class_attribute :_default_form_builder, instance_accessor: false`
 * to give per-subclass storage with inheritance. We approximate that with a
 * WeakMap keyed by the host class so descendants reading without a local set
 * walk the prototype chain via `Object.getPrototypeOf`.
 */

const _registry = new WeakMap<object, unknown>();

/**
 * Walk the class's prototype chain looking for a registered builder.
 * Mirrors how Rails `class_attribute` falls back to the parent class value.
 */
function lookupForClass(klass: object | null | undefined): unknown {
  let cur: object | null | undefined = klass;
  while (cur) {
    if (_registry.has(cur)) return _registry.get(cur);
    cur = Object.getPrototypeOf(cur);
  }
  return undefined;
}

/**
 * Dual-purpose Rails-style method for the form-builder DSL.
 *
 * Class form (setter): `Controller.defaultFormBuilder(MyBuilder)` or
 *   `Controller.defaultFormBuilder("MyBuilder")`. Stores the builder on the
 *   class; string form is held as-is — view-layer resolution happens when the
 *   form helper consumes it (Rails-side equivalent is the form helper's own
 *   `default_form_builder_class` reader).
 *
 * Instance/class form (reader): `controller.defaultFormBuilder()` or
 *   `Controller.defaultFormBuilder()` (no args) returns the configured value,
 *   walking the class chain to mirror `class_attribute` inheritance.
 *
 * Bind to a controller via `static defaultFormBuilder = defaultFormBuilder`
 * (class DSL) and/or as an instance method.
 */
// Class form (setter): bound as `static defaultFormBuilder = defaultFormBuilder`
// — `this` is the host class (a function/constructor) and a builder arg is required.
export function defaultFormBuilder(this: new (...a: never[]) => unknown, builder: unknown): unknown;
// Class form (reader, no-arg): also valid on the class for ad-hoc lookups.
export function defaultFormBuilder(this: new (...a: never[]) => unknown): unknown;
// Instance form (reader): mirrors Rails' 0-arg instance method
// `def default_form_builder; self.class._default_form_builder; end`.
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
  // Runtime guard: Rails' instance reader takes no args (Ruby would raise
  // ArgumentError). Refuse to silently mutate the class via an instance call.
  if (!receiverIsClass) {
    throw new TypeError(
      "defaultFormBuilder: instance receiver takes no arguments. " +
        "Use `Controller.defaultFormBuilder(builder)` to set the class default.",
    );
  }
  if (klass) _registry.set(klass, builder);
  return builder;
}
