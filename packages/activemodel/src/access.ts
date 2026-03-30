/**
 * Access mixin — provides slice and values_at for attribute access.
 *
 * Mirrors: ActiveModel::Access
 */
export interface Access {
  slice(...methods: (string | string[])[]): Record<string, unknown>;
  valuesAt(...methods: (string | string[])[]): unknown[];
}
