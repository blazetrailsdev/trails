/**
 * Access mixin — provides slice and values_at for attribute access.
 *
 * Mirrors: ActiveModel::Access (access.rb:7-16), included into
 * `ActiveModel::Model` by `model.rb:44`.
 */
export class Access {
  /**
   * Mirrors: ActiveModel::Access#slice (access.rb:8-10)
   *
   *   def slice(*methods)
   *     methods.flatten.index_with { |method| public_send(method) }.with_indifferent_access
   *   end
   *
   * The result is a plain object rather than a `HashWithIndifferentAccess`:
   * Ruby's is a `Hash` subclass, so `h[:name]`, `h["name"]` and `h == {…}` all
   * answer on the same object, while the trails class is `Map`-backed and
   * answers only through `get`/`set`. Converging the return type is tracked by
   * 0115/converge-access-slice-with-indifferent-access.
   */
  slice(...methods: (string | string[])[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const method of methods.flat()) {
      result[method] = publicSend(this, method);
    }
    return result;
  }

  /**
   * Mirrors: ActiveModel::Access#values_at (access.rb:12-14)
   *
   *   def values_at(*methods)
   *     methods.flatten.map! { |method| public_send(method) }
   *   end
   */
  valuesAt(...methods: (string | string[])[]): unknown[] {
    return methods.flat().map((method) => publicSend(this, method));
  }
}

/**
 * Ruby `public_send(method)` with no arguments. A generated attribute reader
 * ports as an accessor property (CLAUDE.md § "Generated attribute readers are
 * properties"), so reading the member is the whole send for one; a member that
 * is a function is a `def` and Ruby's send invokes it.
 */
function publicSend(obj: object, method: string): unknown {
  const value = (obj as Record<string, unknown>)[method];
  return typeof value === "function" ? (value as () => unknown).call(obj) : value;
}
