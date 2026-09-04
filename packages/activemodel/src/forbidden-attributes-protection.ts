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

/** @internal */
export function sanitizeForMassAssignment(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const attrs = attributes as Record<string, unknown> & PermittedAttributes;
  if (respondToPermitted(attrs)) {
    if (!readPermitted(attrs)) {
      throw new ForbiddenAttributesError();
    }
    return attrs.toH!();
  }
  return attributes;
}

/** @internal */
export const sanitizeForbiddenAttributes = sanitizeForMassAssignment;

export const ForbiddenAttributesProtection = {
  sanitizeForMassAssignment,
  sanitizeForbiddenAttributes,
};

function readPermitted(attrs: PermittedAttributes): boolean {
  const permitted = attrs.permitted;
  return typeof permitted === "function" ? permitted.call(attrs) : Boolean(permitted);
}

function respondToPermitted(attrs: object): boolean {
  if (typeof attrs !== "object" || attrs === null) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return false;
  return "permitted" in attrs;
}
