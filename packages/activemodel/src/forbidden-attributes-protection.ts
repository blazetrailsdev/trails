export class ForbiddenAttributesError extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "ForbiddenAttributesError";
  }
}

interface PermittedAttributes {
  permitted?: boolean | (() => boolean);
  toH?(): Record<string, unknown>;
}

export const ForbiddenAttributesProtection = {
  /** @internal */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown> {
    const attrs = attributes as Record<string, unknown> & PermittedAttributes;
    if (respondToPermitted(attrs)) {
      if (!readPermitted(attrs)) {
        throw new ForbiddenAttributesError();
      }
      return attrs.toH!();
    }
    return attributes;
  },

  /** @internal */
  sanitizeForbiddenAttributes(
    this: ForbiddenAttributesProtectionHost,
    attributes: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.sanitizeForMassAssignment(attributes);
  },
};

/** @internal */
export const sanitizeForMassAssignment = ForbiddenAttributesProtection.sanitizeForMassAssignment;

/** @internal */
export const sanitizeForbiddenAttributes =
  ForbiddenAttributesProtection.sanitizeForbiddenAttributes;

function readPermitted(attrs: PermittedAttributes): boolean {
  const permitted = attrs.permitted;
  return typeof permitted === "function" ? permitted.call(attrs) : Boolean(permitted);
}

export interface ForbiddenAttributesProtectionHost {
  /** @internal */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
}

function respondToPermitted(attrs: object): boolean {
  if (typeof attrs !== "object" || attrs === null) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return false;
  return "permitted" in attrs;
}
