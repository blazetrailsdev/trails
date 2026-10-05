import type { Base } from "./base.js";
import { camelize, constantize, inquiry, singularize, tableize } from "@blazetrails/activesupport";
import { hashDelete, merge, rbFPublicSend } from "@blazetrails/ruby-compat";
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
      const type = rbFPublicSend(this, roleType) as string;
      autoloadModel(type);
      return constantize(type) as typeof Base;
    },
    configurable: true,
  });

  Object.defineProperty(this.prototype, `${role}Name`, {
    get(this: Base) {
      return inquiry.call((rbFPublicSend(this, `${role}Class`) as typeof Base).modelName.singular);
    },
    configurable: true,
  });

  defineMethod(
    this.prototype,
    `build${camelize(role, true)}`,
    function (this: Base, ...params: unknown[]): Base {
      const klass = rbFPublicSend(this, `${role}Class`) as new (...params: unknown[]) => Base;
      const record = new klass(...params);
      rbFPublicSend(this, `${role}=`, record);
      return record;
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

    const query = `is${predicateSuffix}`;
    defineMethod(this.prototype, query, function (this: Base): boolean {
      return rbFPublicSend(this, roleType) === typeName;
    });

    Object.defineProperty(this.prototype, singularName, {
      get(this: Base) {
        if (rbFPublicSend(this, query)) return rbFPublicSend(this, role);
        return null;
      },
      configurable: true,
    });

    Object.defineProperty(this.prototype, camelize(`${singularSnake}_${primaryKey}`, false), {
      get(this: Base) {
        if (rbFPublicSend(this, query)) return rbFPublicSend(this, roleId);
        return null;
      },
      configurable: true,
    });
  }
}
