import { DescendantsTracker, extend, included, registerSubclass } from "@blazetrails/activesupport";
import { ValueType } from "./type/value.js";
import { defaultValue } from "./type.js";
import { typeRegistry } from "./type/registry.js";
import { AttributeSet } from "./attribute-set.js";
import type { AttributeOptions } from "./attributes.js";

export interface AttributeRegistrationClassMethods {
  attribute(
    name: string,
    type?: string | ValueType | AttributeOptions,
    options?: AttributeOptions,
  ): void;
  _defaultAttributes(): AttributeSet;
  decorateAttributes(names: string[] | null, decorator: AttributeDecorator): void;
  attributeTypes(): Record<string, ValueType | null>;
  typeForAttribute(name: string, block?: () => ValueType): ValueType | null;
}

export interface AttributeHostInternals {
  _cachedDefaultAttributes?: AttributeSet | null;
  _cachedAttributeTypes?: Record<string, ValueType | null> | null;
  _attributesBuilder?: unknown;
  _pendingAttributeModifications?: PendingModification[];
  attributeAliases?: Record<string, string>;
  /** @internal */
  resolveAttributeName(name: string): string;

  attributeTypes(): Record<string, ValueType | null>;
  /** @internal */
  pendingAttributeModifications(): PendingModification[];
  /** @internal */
  applyPendingAttributeModifications(attributeSet: AttributeSet): void;
  /** @internal */
  resetDefaultAttributes(): void;
  /** @internal */
  resetDefaultAttributesBang(): void;
}

export type AttributeDecorator = (
  name: string,
  type: ValueType | null,
) => ValueType | null | undefined;

/** @internal */
export interface PendingModification {
  /** @internal */
  applyTo(attributeSet: AttributeSet): void;
}

/** @internal */
export class PendingType implements PendingModification {
  constructor(
    readonly name: string,
    readonly type: ValueType | null,
  ) {}

  applyTo(attributeSet: AttributeSet): void {
    const existing = attributeSet.getAttribute(this.name);
    attributeSet.set(this.name, existing.withType(this.type ?? existing.type));
  }
}

/** @internal */
export class PendingDefault implements PendingModification {
  readonly name: string;
  readonly default: unknown;

  constructor(name: string, value: unknown) {
    this.name = name;
    this.default = value;
  }

  applyTo(attributeSet: AttributeSet): void {
    const existing = attributeSet.getAttribute(this.name);
    attributeSet.set(this.name, existing.withUserDefault(this.default));
  }
}

/** @internal */
export class PendingDecorator implements PendingModification {
  constructor(
    readonly names: string[] | null,
    readonly decorator: AttributeDecorator,
  ) {}

  applyTo(attributeSet: AttributeSet): void {
    const targets = this.names ?? attributeSet.keys();
    for (const name of targets) {
      const existing = attributeSet.getAttribute(name);
      const newType = this.decorator(name, existing.type);
      if (newType) {
        attributeSet.set(name, existing.withType(newType));
      }
    }
  }
}

export interface AttributeRegistrationHost extends AttributeHostInternals {
  /** @internal */
  resolveTypeName(name: string, options?: Record<string, unknown>): ValueType;
  /** @internal */
  hookAttributeType(name: string, type: ValueType): ValueType;
}

type HostAsClass = new (...args: unknown[]) => unknown;

export const ClassMethods = {
  attribute(
    this: AttributeRegistrationHost,
    name: string,
    type?: string | ValueType | AttributeOptions,
    options?: AttributeOptions,
  ): void {
    name = this.resolveAttributeName(name);
    if (type !== undefined && typeof type !== "string" && !(type instanceof ValueType)) {
      options = type;
      type = undefined;
    }
    const typeProvided = type !== undefined;
    const { default: _default, ...typeOptions } = options ?? {};
    if (typeProvided) {
      type =
        type instanceof ValueType
          ? type
          : this.resolveTypeName(
              type as string,
              Object.keys(typeOptions).length > 0
                ? (typeOptions as Record<string, unknown>)
                : undefined,
            );
      type = this.hookAttributeType(name, type as ValueType);
    }

    const noDefault = options?.default === undefined;
    if (type != null || noDefault) {
      this.pendingAttributeModifications().push(
        new PendingType(name, typeProvided ? (type as ValueType) : null),
      );
    }
    if (!noDefault) {
      this.pendingAttributeModifications().push(new PendingDefault(name, options?.default));
    }

    this.resetDefaultAttributes();
  },

  decorateAttributes(
    this: AttributeHostInternals,
    names: string[] | null,
    decorator: AttributeDecorator,
  ): void {
    names = names?.map((name) => this.resolveAttributeName(name)) ?? null;

    this.pendingAttributeModifications().push(new PendingDecorator(names, decorator));

    this.resetDefaultAttributes();
  },

  _defaultAttributes(this: AttributeHostInternals): AttributeSet {
    if (!this._cachedDefaultAttributes) {
      registerSubclass(Object.getPrototypeOf(this) as HostAsClass, this as unknown as HostAsClass);
      const attributeSet = new AttributeSet({});
      this.applyPendingAttributeModifications(attributeSet);
      this._cachedDefaultAttributes = attributeSet;
    }
    return this._cachedDefaultAttributes;
  },

  attributeTypes(this: AttributeHostInternals): Record<string, ValueType | null> {
    if (Object.hasOwn(this, "_cachedAttributeTypes") && this._cachedAttributeTypes) {
      return this._cachedAttributeTypes;
    }
    const host = this as AttributeHostInternals & { _defaultAttributes(): AttributeSet };
    const cast = host._defaultAttributes().castTypes();
    const proxy = new Proxy(cast, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !Object.hasOwn(target, prop)) {
          return defaultValue();
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    this._cachedAttributeTypes = proxy;
    return proxy;
  },

  typeForAttribute(
    this: AttributeHostInternals,
    attributeName: string,
    block?: () => ValueType,
  ): ValueType | null {
    attributeName = this.resolveAttributeName(attributeName);

    const types = this.attributeTypes();
    if (block) {
      return Object.hasOwn(types, attributeName) ? types[attributeName] : block();
    }
    return types[attributeName];
  },

  /** @internal */
  pendingAttributeModifications(this: AttributeHostInternals): PendingModification[] {
    if (!Object.hasOwn(this, "_pendingAttributeModifications")) {
      this._pendingAttributeModifications = [];
    }
    return this._pendingAttributeModifications as PendingModification[];
  },

  /** @internal */
  applyPendingAttributeModifications(
    this: AttributeHostInternals,
    attributeSet: AttributeSet,
  ): void {
    const superclass = Object.getPrototypeOf(this) as
      | (AttributeHostInternals & { applyPendingAttributeModifications?: unknown })
      | null;
    if (superclass && typeof superclass.applyPendingAttributeModifications === "function") {
      superclass.applyPendingAttributeModifications(attributeSet);
    }

    for (const modification of this.pendingAttributeModifications()) {
      modification.applyTo(attributeSet);
    }
  },

  /** @internal */
  resetDefaultAttributes(this: AttributeHostInternals): void {
    this.resetDefaultAttributesBang();
    for (const sub of DescendantsTracker.subclasses(this as unknown as HostAsClass)) {
      (sub as unknown as AttributeHostInternals).resetDefaultAttributes();
    }
  },

  /** @internal */
  resetDefaultAttributesBang(this: AttributeHostInternals): void {
    this._cachedDefaultAttributes = null;
    this._cachedAttributeTypes = null;
    this._attributesBuilder = undefined;
  },

  /** @internal */
  resolveAttributeName(this: AttributeHostInternals, name: string): string {
    return name;
  },

  /** @internal */
  resolveTypeName(
    this: AttributeHostInternals,
    name: string,
    options?: Record<string, unknown>,
  ): ValueType {
    return typeRegistry.lookup(name, options);
  },

  /** @internal */
  hookAttributeType(this: AttributeHostInternals, _attribute: string, type: ValueType): ValueType {
    return type;
  },
};

export const AttributeRegistration = {
  ClassMethods,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `extend()`'s own AnyClass shape.
  [included](base: new (...args: any[]) => any): void {
    extend(base, ClassMethods);
  },
};
