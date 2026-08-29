import type { Base } from "./base.js";
import {
  camelize,
  constantize,
  inquiry,
  singularize,
  tableize,
  underscore,
} from "@blazetrails/activesupport";
import { autoloadModel } from "./associations.js";

export interface DelegatedTypeOptions {
  types: string[];
  scope?: (rel: any, owner?: any) => any;
  foreignKey?: string;
  foreignType?: string;
  primaryKey?: string;
}

const delegatedTypeRegistry = new WeakMap<
  object,
  Map<string, DelegatedTypeOptions & { foreignKey: string; foreignType: string }>
>();

export function delegatedType(
  modelClass: typeof Base,
  role: string,
  options: DelegatedTypeOptions,
): void {
  const foreignKey = options.foreignKey ?? `${role}_id`;
  const foreignType = options.foreignType ?? `${role}_type`;
  const primaryKey = options.primaryKey ?? "id";
  const config = { ...options, foreignKey, foreignType, primaryKey };

  const {
    types: _types,
    scope,
    ...assocOptions
  } = options as DelegatedTypeOptions & { types?: unknown; scope?: (...args: any[]) => any };
  (modelClass as any).belongsTo(role, scope ?? null, {
    ...assocOptions,
    polymorphic: true,
    foreignKey,
    foreignType,
  });

  if (!delegatedTypeRegistry.has(modelClass)) {
    delegatedTypeRegistry.set(modelClass, new Map());
  }
  delegatedTypeRegistry.get(modelClass)!.set(role, config);

  if (!(modelClass as any)._delegatedTypes) {
    (modelClass as any)._delegatedTypes = new Map();
  }
  (modelClass as any)._delegatedTypes.set(role, config);

  defineDelegatedTypeMethods(modelClass, role, { types: options.types, options });
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
  modelClass: typeof Base,
  role: string,
  { types, options }: { types: string[]; options: DelegatedTypeOptions },
): void {
  const primaryKey = options.primaryKey ?? "id";
  const roleType = options.foreignType ?? `${role}_type`;
  const roleId = options.foreignKey ?? `${role}_id`;

  Object.defineProperty(modelClass, `${role}Types`, {
    get() {
      return types.map(String);
    },
    configurable: true,
  });

  Object.defineProperty(modelClass.prototype, `${role}Class`, {
    get(this: Base) {
      const typeName = this.readAttribute(roleType) as string | null;
      if (!typeName) return null;
      autoloadModel(typeName);
      return constantize(typeName) as typeof Base;
    },
    configurable: true,
  });

  Object.defineProperty(modelClass.prototype, `${role}Name`, {
    get(this: Base) {
      const typeName = this.readAttribute(roleType) as string | null;
      if (!typeName) return null;
      const singular = underscore(typeName).replace(/\//g, "_");
      return inquiry.call(singular);
    },
    configurable: true,
  });

  defineMethod(
    modelClass.prototype,
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

    (modelClass as any).scope(scopeName, function (this: any) {
      return this.where({ [roleType]: typeName });
    });

    defineMethod(modelClass.prototype, `is${predicateSuffix}`, function (this: Base): boolean {
      return this.readAttribute(roleType) === typeName;
    });

    Object.defineProperty(modelClass.prototype, singularName, {
      get(this: Base) {
        if (this.readAttribute(roleType) !== typeName) return null;
        return (this as unknown as Record<string, unknown>)[role];
      },
      configurable: true,
    });

    const fkAccessorName = camelize(`${singularSnake}_${primaryKey}`, false);
    Object.defineProperty(modelClass.prototype, fkAccessorName, {
      get(this: Base) {
        if (this.readAttribute(roleType) !== typeName) return null;
        return this.readAttribute(roleId);
      },
      configurable: true,
    });
  }
}

export function getDelegatedTypeConfig(
  modelClass: typeof Base,
  role: string,
): DelegatedTypeOptions | undefined {
  return (modelClass as any)._delegatedTypes?.get(role);
}
