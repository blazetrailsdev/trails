/**
 * Access mixin — provides slice and values_at for attribute access.
 *
 * Mirrors: ActiveModel::Access (access.rb:7-16), included into
 * `ActiveModel::Model` by `model.rb:44`.
 */
export class Access {
  /**
   * Return a subset of attributes.
   *
   * Mirrors: ActiveModel::Access#slice (access.rb:8-10)
   */
  slice(...methods: (string | string[])[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const m of methods.flat()) {
      result[m] = (this as unknown as AccessHost)._readAttribute(
        (this.constructor as unknown as AccessClass).resolveAttributeName(m),
      );
    }
    return result;
  }

  /**
   * Return attribute values as an array.
   *
   * Mirrors: ActiveModel::Access#values_at (access.rb:12-14)
   */
  valuesAt(...methods: (string | string[])[]): unknown[] {
    return methods
      .flat()
      .map((m) =>
        (this as unknown as AccessHost)._readAttribute(
          (this.constructor as unknown as AccessClass).resolveAttributeName(m),
        ),
      );
  }
}

/** Host shape the {@link Access} bodies read through. */
interface AccessHost {
  _readAttribute(name: string): unknown;
}

interface AccessClass {
  resolveAttributeName(name: string): string;
}
