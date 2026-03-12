import type { Base } from "./base.js";
import { loadBelongsTo, loadHasOne } from "./associations.js";
import type { AssociationDefinition } from "./associations.js";

/**
 * Delegate methods to an association.
 *
 * Mirrors: Module#delegate (used heavily in Rails models)
 *
 * Usage:
 *   delegate(Book, ['name', 'email'], { to: 'author' })
 *   delegate(Book, ['name'], { to: 'author', prefix: true })
 *     → book.authorName()
 */
export function delegate(
  modelClass: typeof Base,
  methods: string[],
  options: { to: string; prefix?: boolean | string },
): void {
  const assocName = options.to;

  for (const method of methods) {
    const delegatedName = options.prefix
      ? typeof options.prefix === "string"
        ? `${options.prefix}${method.charAt(0).toUpperCase() + method.slice(1)}`
        : `${assocName}${method.charAt(0).toUpperCase() + method.slice(1)}`
      : method;

    Object.defineProperty(modelClass.prototype, delegatedName, {
      value: async function (this: Base) {
        const ctor = this.constructor as typeof Base;
        const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
        const assocDef = associations.find((a) => a.name === assocName);
        if (!assocDef) {
          throw new Error(`Association "${assocName}" not found on ${ctor.name}`);
        }

        let target: Base | null = null;
        if (assocDef.type === "belongsTo") {
          target = await loadBelongsTo(this, assocName, assocDef.options);
        } else if (assocDef.type === "hasOne") {
          target = await loadHasOne(this, assocName, assocDef.options);
        }

        if (!target) return null;

        // Try calling as a method first, then read as attribute
        if (typeof (target as any)[method] === "function") {
          return (target as any)[method]();
        }
        return target.readAttribute(method);
      },
      writable: true,
      configurable: true,
    });
  }
}
