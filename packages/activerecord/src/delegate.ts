import type { Base } from "./base.js";
import { upcaseFirst } from "@blazetrails/activesupport";
import { association } from "./associations/instance-methods.js";

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
        const assoc = association.call(this, assocName);

        let target: Base | null = null;
        if (assoc.reflection.macro === "belongsTo" || assoc.reflection.macro === "hasOne") {
          target = (await assoc.loadTarget()) as Base | null;
        }

        if (!target) return null;

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
