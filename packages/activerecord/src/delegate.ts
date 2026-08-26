import type { Base } from "./base.js";
import { upcaseFirst } from "@blazetrails/activesupport";
import { association } from "./associations/instance-methods.js";

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
        ? `${options.prefix}${upcaseFirst(method)}`
        : `${assocName}${upcaseFirst(method)}`
      : method;

    Object.defineProperty(modelClass.prototype, delegatedName, {
      value: async function (this: Base) {
        const ctor = this.constructor as typeof Base;
        const assocDef = (ctor as any)._reflectOnAssociation?.(assocName);
        if (!assocDef) {
          throw new Error(`Association "${assocName}" not found on ${ctor.name}`);
        }

        let target: Base | null = null;
        if (assocDef.macro === "belongsTo" || assocDef.macro === "hasOne") {
          target = (await association.call(this, assocName).loadTarget()) as Base | null;
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
