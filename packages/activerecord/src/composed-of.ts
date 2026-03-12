import type { Base } from "./base.js";

interface ComposedOfOptions {
  className: new (...args: any[]) => any;
  mapping: [string, string][];
  constructorFn?: (...args: any[]) => any;
  converter?: (value: unknown) => unknown;
}

/**
 * Configure a composed-of value object on a model.
 *
 * Mirrors: ActiveRecord::Aggregations.composed_of
 *
 * Usage:
 *   composedOf(Customer, 'address', {
 *     className: Address,
 *     mapping: [['address_street', 'street'], ['address_city', 'city']],
 *   })
 *
 * This adds:
 *   - customer.address → Address instance composed from mapped attributes
 *   - customer.address = new Address(...) → decomposes into mapped attributes
 */
export function composedOf(
  modelClass: typeof Base,
  name: string,
  options: ComposedOfOptions,
): void {
  // Getter: read mapped attributes and instantiate the value object
  Object.defineProperty(modelClass.prototype, name, {
    get(this: Base): unknown {
      const args = options.mapping.map(([modelAttr]) => this.readAttribute(modelAttr));
      // If all args are null, return null
      if (args.every((a) => a === null || a === undefined)) return null;
      return new options.className(...args);
    },
    set(this: Base, value: unknown): void {
      if (value === null || value === undefined) {
        for (const [modelAttr] of options.mapping) {
          this.writeAttribute(modelAttr, null);
        }
        return;
      }

      // If it's an instance of the class, decompose it
      if (value instanceof options.className) {
        for (const [modelAttr, valueAttr] of options.mapping) {
          this.writeAttribute(modelAttr, (value as any)[valueAttr]);
        }
        return;
      }

      // Try converter
      if (options.converter) {
        const converted = options.converter(value);
        if (converted instanceof options.className) {
          for (const [modelAttr, valueAttr] of options.mapping) {
            this.writeAttribute(modelAttr, (converted as any)[valueAttr]);
          }
        }
      }
    },
    configurable: true,
  });
}
