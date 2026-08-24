import { withIndifferentAccess, type HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { NoMethodError } from "./attribute-assignment.js";

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
   */
  slice(...methods: (string | string[])[]): HashWithIndifferentAccess<unknown> {
    const indexed: Record<string, unknown> = {};
    for (const method of methods.flat()) {
      indexed[method] = publicSend(this, method);
    }
    return withIndifferentAccess(indexed);
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
 * Ruby `public_send(method)` with no arguments. Member existence is the JS
 * analog of `respond_to?`, and a receiver that does not respond raises
 * `NoMethodError` as Ruby's send does. A generated attribute reader ports as an
 * accessor property (CLAUDE.md § "Generated attribute readers are properties"),
 * so reading the member is the whole send for one; a member that is a function
 * is a `def` and Ruby's send invokes it.
 */
function publicSend(obj: object, method: string): unknown {
  if (!(method in obj)) {
    throw new NoMethodError(
      `undefined method '${method}' for an instance of ${obj.constructor.name}`,
    );
  }
  const value = (obj as Record<string, unknown>)[method];
  return typeof value === "function" ? (value as () => unknown).call(obj) : value;
}
