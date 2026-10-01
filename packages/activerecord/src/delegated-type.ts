import type { Base } from "./base.js";
import {
  camelize,
  constantize,
  inquiry,
  singularize,
  tableize,
  underscore,
} from "@blazetrails/activesupport";
import { hashDelete, merge } from "@blazetrails/ruby-compat";
import { autoloadModel } from "./associations.js";

export interface DelegatedTypeOptions {
  types: string[];
  scope?: (rel: any, owner?: any) => any;
  foreignKey?: string;
  foreignType?: string;
  primaryKey?: string;
}

export function delegatedType(
  this: typeof Base,
  role: string,
  { types, ...options }: DelegatedTypeOptions,
): void {
  this.belongsTo(
    role,
    hashDelete(options as Record<string, unknown>, "scope") as DelegatedTypeOptions["scope"] | null,
    merge(options, { polymorphic: true }),
  );
  this.defineDelegatedTypeMethods(role, { types, options });
}

function defineMethod(mixin: any, methodName: string, body: (...args: any[]) => any): void {
  Object.defineProperty(mixin, methodName, {
    value: body,
    writable: true,
    configurable: true,
  });
}

/** @internal */
export function defineDelegatedTypeMethods(
  this: typeof Base,
  role: string,
  { types, options }: { types: string[]; options: Omit<DelegatedTypeOptions, "types" | "scope"> },
): void {
  const primaryKey = options.primaryKey ?? "id";
  const roleType = options.foreignType ?? `${role}_type`;
  const roleId = options.foreignKey ?? `${role}_id`;

  Object.defineProperty(this, `${role}Types`, {
    get() {
      return types.map(String);
    },
    configurable: true,
  });

  Object.defineProperty(this.prototype, `${role}Class`, {
    get(this: Base) {
      const typeName = this.readAttribute(roleType) as string | null;
      if (!typeName) return null;
      autoloadModel(typeName);
      return constantize(typeName) as typeof Base;
    },
    configurable: true,
  });

  Object.defineProperty(this.prototype, `${role}Name`, {
    get(this: Base) {
      const typeName = this.readAttribute(roleType) as string | null;
      if (!typeName) return null;
      const singular = underscore(typeName).replace(/\//g, "_");
      return inquiry.call(singular);
    },
    configurable: true,
  });

  defineMethod(
    this.prototype,
    `build${camelize(role, true)}`,
    function (this: Base, attrs: Record<string, unknown> = {}): Base {
      const typeName = this.readAttribute(roleType) as string | null;
      if (!typeName) {
        throw new Error(`Cannot build${camelize(role, true)}: ${roleType} is not set`);
      }
      autoloadModel(typeName);
      const TargetClass = constantize(typeName) as typeof Base;
      const instance = new (TargetClass as unknown as new (a: Record<string, unknown>) => Base)(
        attrs,
      );
      (this as unknown as Record<string, unknown>)[role] = instance;
      return instance;
    },
  );

  for (const typeName of types) {
    const scopeSnake = tableize(typeName).replace(/\//g, "_");
    const singularSnake = singularize(scopeSnake);
    const scopeName = camelize(scopeSnake, false);
    const singularName = camelize(singularSnake, false);
    const predicateSuffix = camelize(singularSnake, true);

    (this as any).scope(scopeName, function (this: any) {
      return this.where({ [roleType]: typeName });
    });

    defineMethod(this.prototype, `is${predicateSuffix}`, function (this: Base): boolean {
      return this.readAttribute(roleType) === typeName;
    });

    Object.defineProperty(this.prototype, singularName, {
      get(this: Base) {
        if (this.readAttribute(roleType) !== typeName) return null;
        return (this as unknown as Record<string, unknown>)[role];
      },
      configurable: true,
    });

    const fkAccessorName = camelize(`${singularSnake}_${primaryKey}`, false);
    Object.defineProperty(this.prototype, fkAccessorName, {
      get(this: Base) {
        if (this.readAttribute(roleType) !== typeName) return null;
        return this.readAttribute(roleId);
      },
      configurable: true,
    });
  }
}
